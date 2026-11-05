// SEC-S01/S02/S04 continuity D: REAL sealed-backup -> isolated PostgreSQL restore -> verify.
//
// What it does (all inside one private temp directory that is always disposed):
//  1. hashes the sealed source archive (immutability is re-checked at the end);
//  2. authenticated decryption with the existing unseal.mjs (AES-256-GCM + RSA-OAEP);
//  3. archive entry allow-list (no absolute / .. / links), extraction;
//  4. byte-level digest verification of EVERY manifest declaration
//     (database.dump, roles.globals.sql, each Storage object bytes + SHA-256, counts);
//  5. pg_restore TOC + the existing verify_backup_completeness.mjs scope check, and an
//     optional comparison against an expected production scope (schemas -> table counts);
//  6. a brand-new throw-away PostgreSQL cluster (initdb in the temp dir, NO TCP listener,
//     unix socket inside the temp dir) -> roles globals -> pg_restore of business schemas;
//     provider-managed schemas / unavailable provider extensions are excluded and listed;
//  7. db_inventory.mjs of the restore (+ sequence/PK collision check), Storage roster vs
//     restored storage.objects, per-role RLS visibility observation, and — when given —
//     compare_inventory.mjs against the source inventory;
//  8. stops the cluster, deletes the temp dir, re-hashes the source archive.
// It never connects to any database it did not create, never prints row values,
// secrets, keys or role passwords, and never writes outside its own temp dir except
// the --report JSON. Re-running is always safe (fresh temp dir per run).
//
// Usage:
//  node restore_verify.mjs --sealed backup.sealed --key /offline/private.pem
//       [--source-inventory src.json] [--expected-scope scope.json] [--report out.json]
//  node restore_verify.mjs --tar decrypted.tar.gz ...   (operator already decrypted)
// Env: PG_BIN (dir with initdb/pg_ctl/psql/pg_restore), RESTORE_RUN_AS (OS user for the
//      cluster when invoked as root; default "postgres").
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,readdirSync,statSync,rmSync,chmodSync,chownSync,createReadStream} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {inventory} from './db_inventory.mjs';
import {compare,MANAGED_SCHEMAS} from './compare_inventory.mjs';

const HERE=dirname(fileURLToPath(import.meta.url));
const SECURITY=join(HERE,'..');
// Managed schemas are rebuilt by the provider; 'extensions' itself is kept so that
// available extensions (pgcrypto, uuid-ossp …) can be recreated where the dump puts them.
const EXCLUDE_SCHEMAS=MANAGED_SCHEMAS.filter(s=>s!=='extensions');
const ALLOWED_ENTRY=/^(\.\/)?(manifest\.json|database\.dump|roles\.globals\.sql|hosted-auth-config\.json|storage\/|storage\/\d{5}\.bin|)$/;

export function pgBin(){
 if(process.env.PG_BIN)return process.env.PG_BIN;
 try{return execFileSync('pg_config',['--bindir'],{encoding:'utf8'}).trim()}catch{}
 const root='/usr/lib/postgresql';
 if(existsSync(root)){const v=readdirSync(root).filter(x=>/^\d+$/.test(x)).sort((a,b)=>b-a)[0];if(v)return join(root,v,'bin')}
 return '';
}
const sha256File=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
function run(cmd,args,opts={}){
 const r=spawnSync(cmd,args,{encoding:'utf8',maxBuffer:256*1024*1024,...opts});
 if(r.error)throw Error(basename(cmd).toUpperCase()+'_UNAVAILABLE');
 return r;
}

// ---- disposable cluster -------------------------------------------------------------
export function startCluster(base,{bin=pgBin(),runAs=process.env.RESTORE_RUN_AS||'postgres'}={}){
 if(!bin||!existsSync(join(bin,'initdb')))throw Error('POSTGRES_BINARIES_NOT_FOUND');
 const data=join(base,'pgdata'),sock=join(base,'sock');
 mkdirSync(sock,{mode:0o700});
 let wrap=(c,a)=>[c,a];
 if(process.getuid?.()===0){
  // initdb refuses root. Hand ONLY the cluster dirs to an unprivileged OS user.
  const uid=Number(execFileSync('id',['-u',runAs],{encoding:'utf8'}).trim());
  const gid=Number(execFileSync('id',['-g',runAs],{encoding:'utf8'}).trim());
  chmodSync(base,0o711);mkdirSync(data,{mode:0o700});chownSync(data,uid,gid);chownSync(sock,uid,gid);
  wrap=(c,a)=>['runuser',['-u',runAs,'--',c,...a]];
 }
 const port=String(20000+Math.floor(Math.random()*20000));
 const call=(c,a)=>{const [x,y]=wrap(c,a);const r=run(x,y);if(r.status!==0)throw Error(basename(c).toUpperCase()+'_FAILED');return r};
 call(join(bin,'initdb'),['-D',data,'-U','postgres','--auth=trust','--no-sync','-E','UTF8','--locale=C.UTF-8']);
 // listen_addresses='' => no TCP socket at all; only the private unix socket.
 call(join(bin,'pg_ctl'),['-D',data,'-w','-l',join(sock,'server.log'),'-o',
  `-c listen_addresses='' -c unix_socket_directories='${sock}' -c port=${port} -c fsync=off -c full_page_writes=off`,'start']);
 const conn=db=>`host=${sock} port=${port} user=postgres dbname=${db}`;
 return {bin,data,sock,port,conn,stop(){try{call(join(bin,'pg_ctl'),['-D',data,'-m','fast','-w','stop'])}catch{}}};
}

function psql(cluster,db,sql,{stopOnError=true}={}){
 return run(join(cluster.bin,'psql'),['-X','-q','-At','-v','ON_ERROR_STOP='+(stopOnError?1:0),'--dbname',cluster.conn(db),'-c',sql]);
}

// ---- pg_restore TOC helpers ----------------------------------------------------------
const MULTI=['TABLE DATA','SEQUENCE SET','SEQUENCE OWNED BY','FK CONSTRAINT','DEFAULT ACL','MATERIALIZED VIEW DATA','MATERIALIZED VIEW','ROW SECURITY','PUBLICATION TABLE','EVENT TRIGGER','TEXT SEARCH CONFIGURATION','TEXT SEARCH DICTIONARY','FOREIGN TABLE','LARGE OBJECT','BLOB DATA','BLOBS'];
export function parseToc(text){
 const out=[];
 for(const line of text.split('\n')){
  const m=line.match(/^(\d+);\s+\d+\s+\d+\s+(.*)$/);if(!m)continue;
  let rest=m[2],type=null;
  for(const t of MULTI)if(rest.startsWith(t+' ')){type=t;break}
  if(!type)type=rest.split(' ')[0];
  rest=rest.slice(type.length+1);
  let schema=rest.split(' ')[0];let name=rest.split(' ').slice(1,-1).join(' ');
  if(type==='ACL'||type==='COMMENT'){ // "ACL - SCHEMA foo" / "ACL public TABLE foo"
   const parts=rest.split(' ');schema=parts[0];name=parts.slice(1,-1).join(' ');
   if(schema==='-'&&parts[1]==='SCHEMA')schema=parts[2];
   if(schema==='-'&&parts[1]==='EXTENSION')schema='-',name='EXTENSION '+parts[2];
  }
  if((type==='SCHEMA')&&schema==='-')schema=rest.split(' ')[1];
  out.push({id:Number(m[1]),line,type,schema,name});
 }
 return out;
}
export function tocScope(entries){
 const s={};
 for(const e of entries)if(e.type==='TABLE'){(s[e.schema]||(s[e.schema]={tables:0,data:0})).tables++}
 for(const e of entries)if(e.type==='TABLE DATA'&&s[e.schema])s[e.schema].data++;
 return s;
}

// ---- main ----------------------------------------------------------------------------
export async function restoreVerify(opts){
 const report={format:'attendance-restore-verify-v1',started_at:new Date().toISOString(),stages:[],result:'FAIL'};
 const stage=(name,ok,detail={})=>{report.stages.push({stage:name,ok:!!ok,...detail});if(!ok)throw Object.assign(Error('STAGE_FAILED:'+name),{stageFailed:name})};
 const base=mkdtempSync(join(tmpdir(),'sec-restore-verify-'));chmodSync(base,0o700);
 writeFileSync(join(base,'.sec-restore-verify'),'disposable '+randomBytes(8).toString('hex'),{mode:0o600});
 let cluster=null;const input=opts.sealed||opts.tar;
 const srcBefore=input&&existsSync(input)?{sha256:sha256File(input),size:statSync(input).size,mtime:statSync(input).mtimeMs}:null;
 const onSignal=()=>{try{cluster?.stop()}catch{};rmSync(base,{recursive:true,force:true});process.exit(130)};
 process.once('SIGINT',onSignal);process.once('SIGTERM',onSignal);
 try{
  stage('input_present',Boolean(srcBefore),{input:input?basename(input):null,sha256:srcBefore?.sha256,bytes:srcBefore?.size});
  const tarPath=join(base,'archive.tar.gz');
  if(opts.sealed){
   if(!opts.key||!existsSync(opts.key))stage('decrypt',false,{reason:'PRIVATE_KEY_NOT_AVAILABLE'});
   const r=run(process.execPath,[join(SECURITY,'unseal.mjs'),opts.sealed,opts.key,tarPath]);
   stage('decrypt',r.status===0&&/AUTHENTICATED_DECRYPT_OK/.test(r.stdout),
    {method:'AES-256-GCM + RSA-OAEP-SHA256 (unseal.mjs)',reason:r.status===0?undefined:'AUTHENTICATION_OR_KEY_FAILURE'});
  }else{
   writeFileSync(tarPath,readFileSync(opts.tar),{mode:0o600});
   report.stages.push({stage:'decrypt',ok:true,skipped:'operator supplied decrypted archive'});
  }
  // 3. archive entries
  const list=run('tar',['-tvzf',tarPath]);
  const bad=[];
  for(const line of list.stdout.split('\n').filter(Boolean)){
   const typ=line[0],name=line.split(/\s+/).slice(5).join(' ');
   if(!['-','d'].includes(typ)||name.startsWith('/')||name.split('/').includes('..')||!ALLOWED_ENTRY.test(name))bad.push(name.slice(0,80));
  }
  stage('archive_entries',list.status===0&&bad.length===0,{rejected:bad});
  const x=join(base,'x');mkdirSync(x,{mode:0o700});
  stage('extract',run('tar',['-xzf',tarPath,'--no-same-owner','--no-same-permissions','-C',x]).status===0);
  // 4. digests against actual bytes
  let manifest;try{manifest=JSON.parse(readFileSync(join(x,'manifest.json'),'utf8'))}catch{manifest=null}
  const problems=[];
  if(manifest?.format!=='attendance-secure-backup-v1')problems.push('manifest_format');
  const dump=join(x,'database.dump'),roles=join(x,'roles.globals.sql');
  if(!existsSync(dump)||sha256File(dump)!==manifest?.database_sha256)problems.push('database_sha256');
  if(!existsSync(roles)||sha256File(roles)!==manifest?.roles_sha256)problems.push('roles_sha256');
  const storage=Array.isArray(manifest?.storage)?manifest.storage:[];
  if(storage.length!==manifest?.full_storage_count)problems.push('storage_count');
  let storageBytes=0;
  for(const o of storage){
   const f=join(x,o.file||'');
   if(!/^storage\/\d{5}\.bin$/.test(o.file||'')||!existsSync(f)){problems.push('storage_file_missing');continue}
   const b=readFileSync(f);storageBytes+=b.length;
   if(b.length!==o.bytes)problems.push('storage_bytes:'+o.file);
   if(createHash('sha256').update(b).digest('hex')!==o.sha256)problems.push('storage_sha256:'+o.file);
  }
  const onDisk=existsSync(join(x,'storage'))?readdirSync(join(x,'storage')).length:0;
  if(onDisk!==storage.length)problems.push('storage_extra_files');
  let authKeys=0;try{authKeys=Object.keys(JSON.parse(readFileSync(join(x,'hosted-auth-config.json'),'utf8'))).length}catch{}
  if(manifest?.auth_config?.captured&&authKeys<3)problems.push('hosted_auth_config');
  stage('digests',problems.length===0,{database_bytes:existsSync(dump)?statSync(dump).size:0,
   storage_objects:storage.length,storage_bytes:storageBytes,hosted_auth_config_keys:authKeys,problems});
  // 5. TOC + scope
  cluster=null;
  const bin=pgBin();
  const tocR=run(join(bin,'pg_restore'),['--list',dump]);
  stage('toc',tocR.status===0);
  const tocFile=join(base,'toc.txt');writeFileSync(tocFile,tocR.stdout,{mode:0o600});
  const entries=parseToc(tocR.stdout);const scope=tocScope(entries);
  const comp=run(process.execPath,[join(HERE,'verify_backup_completeness.mjs'),join(x,'manifest.json'),tocFile]);
  let completeness;try{completeness=JSON.parse(comp.stdout)}catch{completeness={result:'UNPARSEABLE'}}
  const scopeGaps=[];
  // Expected scope: operator-supplied production scope, else the live catalog scope that
  // capture.mjs recorded at backup time (manifest.catalog_scope).
  const expected=opts.expectedScope?.schemas||manifest?.catalog_scope||null;
  if(expected){
   for(const [schema,count] of Object.entries(expected)){
    const got=scope[schema]?.tables||0;
    if(got<count)scopeGaps.push({schema,expected_tables:count,toc_tables:got});
   }
  }
  report.stages.push({stage:'scope',ok:completeness.result==='BACKUP_SCOPE_METADATA_PRESENT'&&scopeGaps.length===0,
   completeness:completeness.result,missing:(completeness.missing||[]).map(m=>m.label),toc_scope:scope,
   expected_scope_source:opts.expectedScope?'operator':manifest?.catalog_scope?'manifest.catalog_scope':'none',expected_scope_gaps:scopeGaps,toc_tables_total:Object.values(scope).reduce((a,s)=>a+s.tables,0)});
  // An incomplete backup scope must NEVER be reported as a successful restore.
  if(!report.stages.at(-1).ok)throw Object.assign(Error('STAGE_FAILED:scope'),{stageFailed:'scope'});
  // 6. disposable cluster
  cluster=startCluster(base,{bin});
  report.stages.push({stage:'cluster',ok:true,isolation:'initdb in private temp dir; listen_addresses=empty (no TCP); unix socket 0700'});
  // -f (not -c): pg_dumpall output may contain psql meta-commands such as \\restrict.
  const g=run(join(bin,'psql'),['-X','-q','-v','ON_ERROR_STOP=0','--dbname',cluster.conn('postgres'),'-f',roles]);
  const roleErrors=(g.stderr.match(/ERROR:[^\n]*/g)||[]).filter(e=>!/already exists/.test(e));
  stage('roles',g.status===0&&roleErrors.length===0,{exit_status:g.status,errors:roleErrors.map(e=>e.slice(0,120))});
  const target='restore_'+randomBytes(6).toString('hex');
  stage('create_target',psql(cluster,'postgres',`create database ${target}`).status===0,{database:target});
  const avail=new Set(psql(cluster,target,'select name from pg_available_extensions').stdout.split('\n').filter(Boolean));
  const excluded=[];
  const keep=entries.filter(e=>{
   if(EXCLUDE_SCHEMAS.includes(e.schema)||EXCLUDE_SCHEMAS.includes(e.name)){excluded.push({type:e.type,schema:e.schema,reason:'provider-managed schema'});return false}
   const em=(e.type==='EXTENSION'||e.type==='COMMENT')?e.line.match(/\bEXTENSION (?:- )?(\S+)/):null;
   const extName=em?em[1]:null;
   if(extName&&!avail.has(extName)){excluded.push({type:e.type,schema:extName,reason:'provider extension unavailable in vanilla PostgreSQL'});return false}
   return true;
  });
  const listFile=join(base,'restore.list');
  writeFileSync(listFile,keep.map(e=>e.line).join('\n')+'\n',{mode:0o600});
  const rr=run(join(bin,'pg_restore'),['--dbname',cluster.conn(target),'--use-list',listFile,'--no-password',dump]);
  const restoreErrors=(rr.stderr.match(/ERROR:[^\n]*/g)||[]).map(e=>e.slice(0,140));
  const exclusionSummary={};for(const e of excluded){const k=e.reason+' :: '+e.schema;exclusionSummary[k]=(exclusionSummary[k]||0)+1}
  stage('pg_restore',rr.status===0&&restoreErrors.length===0,{exit_status:rr.status,entries_total:entries.length,entries_restored:keep.length,
   excluded:exclusionSummary,errors:restoreErrors.slice(0,40),error_count:restoreErrors.length});
  // 7. verification of the restored database
  const inv=inventory(cluster.conn(target),{psql:join(bin,'psql')});
  report.restored_inventory_summary={schemas:inv.schema_summary,policies:inv.policies.length,
   rls_tables:inv.tables.filter(t=>t.rls).length,sequences:inv.sequences.length,roles:inv.roles.length};
  if(opts.inventoryOut)writeFileSync(opts.inventoryOut,JSON.stringify(inv,null,1)+'\n',{mode:0o600});
  stage('sequences',inv.sequence_collisions.length===0,{collisions:inv.sequence_collisions});
  const roster=psql(cluster,target,`select coalesce(json_agg(json_build_object('b',bucket_id,'n',name,'s',metadata->>'size')),'[]') from storage.objects`);
  let restoredObjects=[];try{restoredObjects=JSON.parse(roster.stdout.trim()||'[]')}catch{}
  const want=new Set(storage.map(o=>o.bucket+'\u0000'+o.name+'\u0000'+o.bytes));
  const have=new Set(restoredObjects.map(o=>o.b+'\u0000'+o.n+'\u0000'+o.s));
  const missingObjects=[...want].filter(k=>!have.has(k)).length,extraObjects=[...have].filter(k=>!want.has(k)).length;
  stage('storage_roster',roster.status===0&&missingObjects===0&&extraObjects===0,
   {manifest_objects:storage.length,restored_rows:restoredObjects.length,missing:missingObjects,extra:extraObjects,
    note:'object BYTES verified in stage digests; this checks restored storage.objects metadata agrees'});
  // per-role RLS visibility observation on the restored copy (read-only)
  const rlsTables=inv.tables.filter(t=>t.rls&&(t.kind==='r'||t.kind==='p'));
  const roleNames=new Set(inv.roles.map(r=>r.name));
  const visibility={};
  for(const role of ['anon','authenticated']){
   if(!roleNames.has(role))continue;
   let leaks=0,denied=0,checked=0;
   for(const t of rlsTables){
    const r=psql(cluster,target,`begin read only; set local role ${role}; select count(*) from "${t.schema.replaceAll('"','""')}"."${t.name.replaceAll('"','""')}"; rollback;`);
    checked++;
    if(r.status!==0){denied++;continue}
    const n=Number(r.stdout.split('\n').filter(s=>/^\d+$/.test(s)).at(-1));
    if(n>0&&t.rows>0)leaks++;
   }
   visibility[role]={rls_tables_checked:checked,permission_denied:denied,rows_visible_without_claims:leaks};
  }
  report.stages.push({stage:'rls_visibility',ok:true,observation:visibility,
   note:'No JWT claims set. rows_visible_without_claims>0 is reported for review, not auto-failed (policies may intentionally allow).'});
  if(opts.sourceInventory){
   const c=compare(opts.sourceInventory,inv);
   stage('compare_source',c.result==='MATCH',{result:c.result,business_differences:c.business_differences,
    managed_differences:c.managed_differences,blocking_role_differences:c.blocking_role_differences,
    first_differences:c.business.slice(0,25).map(d=>({kind:d.kind,id:d.id,issue:d.issue}))});
  }else report.stages.push({stage:'compare_source',ok:false,skipped:'no --source-inventory supplied; restore authenticity not verified'});
  report.not_verified=['GoTrue service login against restored auth schema (requires an isolated Auth service)',
   'Storage API serving restored bytes (requires an isolated Storage service)',
   'Edge Functions / Apps Script reconnection','provider-managed schemas (cron, net, realtime, vault …): provider rebuild'];
  // Without an independently captured source inventory, this is only an
  // archive self-consistency test, not an end-to-end restore comparison.
  report.result=opts.sourceInventory?'PASS':'PARTIAL_NO_SOURCE_COMPARISON';
 }catch(e){
  report.error=e.stageFailed?undefined:String(e.message||e).slice(0,200);
  report.failed_stage=e.stageFailed||report.stages.find(s=>!s.ok)?.stage||'internal';
 }finally{
  process.removeListener('SIGINT',onSignal);process.removeListener('SIGTERM',onSignal);
  try{cluster?.stop()}catch{}
  const marker=existsSync(join(base,'.sec-restore-verify'));
  if(marker)rmSync(base,{recursive:true,force:true});
  const after=input&&existsSync(input)?{sha256:sha256File(input),size:statSync(input).size,mtime:statSync(input).mtimeMs}:null;
  const unchanged=Boolean(srcBefore&&after&&after.sha256===srcBefore.sha256&&after.size===srcBefore.size&&after.mtime===srcBefore.mtime);
  report.disposal={temp_dir_removed:!existsSync(base),only_marked_dir_removed:marker};
  report.source_immutable=unchanged;
  if(report.result==='PASS'&&(!unchanged||!report.disposal.temp_dir_removed)){report.result='FAIL';report.failed_stage='disposal_or_immutability'}
  report.finished_at=new Date().toISOString();
 }
 return report;
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 const a=process.argv.slice(2),val=k=>{const i=a.indexOf(k);return i<0?null:a[i+1]};
 const opts={sealed:val('--sealed'),key:val('--key'),tar:val('--tar'),allowScopeGaps:a.includes('--allow-scope-gaps'),
  inventoryOut:val('--inventory-out'),
  sourceInventory:val('--source-inventory')?JSON.parse(readFileSync(val('--source-inventory'),'utf8')):null,
  expectedScope:val('--expected-scope')?JSON.parse(readFileSync(val('--expected-scope'),'utf8')):null};
 if(!opts.sealed&&!opts.tar){console.error('usage: restore_verify.mjs --sealed F --key K | --tar F [--source-inventory J] [--expected-scope J] [--report OUT]');process.exit(2)}
 const r=await restoreVerify(opts);
 const text=JSON.stringify(r,null,1);
 if(val('--report'))writeFileSync(val('--report'),text+'\n',{mode:0o600});
 console.log(text);process.exit(r.result==='PASS'?0:1);
}
