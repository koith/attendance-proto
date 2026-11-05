// Source snapshot is read-only; all plaintext stays on the ephemeral runner until sealing.
import {mkdtempSync,mkdirSync,writeFileSync,createWriteStream,rmSync,readFileSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
const out=process.env.SEC_BACKUP_OUT;
const url=process.env.SUPABASE_DB_URL;
const api=process.env.SUPABASE_URL;
const storageKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
const root=mkdtempSync(join(tmpdir(),'attendance-backup-'));
function command(name,args,timeout=180000){try{return execFileSync(name,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],env:process.env,maxBuffer:4*1024*1024,timeout})}catch(e){throw Error(name.toUpperCase().replaceAll('-','_')+'_FAILED exit='+String(e.status??'unknown'))}}
function sha(path){return createHash('sha256').update(readFileSync(path)).digest('hex')}
function roster(){
 const query="SELECT coalesce(json_agg(json_build_object('bucket',bucket_id,'name',name,'size',metadata->>'size','updated_at',updated_at) ORDER BY bucket_id,name),'[]'::json)::text FROM storage.objects";
 return command('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1','--dbname',url,'-c',query]).trim();
}
async function run(){
 if(!url||!api||!storageKey||!out)throw Error('MISSING_PRIVATE_RUNTIME_BACKUP_CONFIGURATION');
 if(!process.env.SUPABASE_ACCESS_TOKEN)throw Error('AUTH_CONFIG_READ_TOKEN_NOT_CONFIGURED');
 const stage=join(root,'snapshot');mkdirSync(stage,{recursive:true});
 const storage=join(stage,'storage');mkdirSync(storage);
 const before=roster();const objects=JSON.parse(before);
 const databaseCaptureStart=new Date().toISOString();
 command('pg_dump',['--format=custom','--dbname',url,'--file',join(stage,'database.dump')],240000);
 const databaseCaptureEnd=new Date().toISOString();
 command('pg_dumpall',['--globals-only','--no-role-passwords','--dbname',url,'--file',join(stage,'roles.globals.sql')],120000);
 if(!readFileSync(join(stage,'roles.globals.sql'),'utf8').includes('CREATE ROLE'))throw Error('ROLE_GLOBALS_MISSING');
 const contents=command('pg_restore',['--list',join(stage,'database.dump')]);
 for(const marker of ['SCHEMA - auth','SCHEMA - storage','TABLE DATA public'])if(!contents.includes(marker))throw Error('DB_ARCHIVE_MISSING_'+marker.replaceAll(' ','_'));
 // SEC-S01/S02: refuse a full-backup claim if live base tables are not represented
 // by the dump TOC. This checks declared coverage, not real restore success.
 const catalogScope=JSON.parse(command('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1','--dbname',url,'-c',
  "SELECT coalesce(json_object_agg(s,n),'{}')::text FROM (SELECT n.nspname s,count(*) n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg\\_toast%' AND NOT EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=c.oid AND d.deptype='e') GROUP BY 1) x"]).trim()||'{}');
 const tocScope={};
 for(const m of contents.matchAll(/^\d+;\s+\d+\s+\d+\s+TABLE (?!DATA )(\S+) /gm))tocScope[m[1]]=(tocScope[m[1]]||0)+1;
 const scopeGaps=Object.entries(catalogScope).filter(([s,n])=>(tocScope[s]||0)<n).map(([s,n])=>({schema:s,catalog_tables:n,dumped_tables:tocScope[s]||0}));
 if(scopeGaps.length)throw Error('DB_ARCHIVE_SCOPE_GAP '+scopeGaps.map(g=>g.schema+':'+g.dumped_tables+'/'+g.catalog_tables).join(','));
 const hashes=[];let index=0;
 for(const obj of objects){
  if(!obj.bucket||!obj.name)throw Error('INVALID_STORAGE_OBJECT_METADATA');
  const file='storage/'+String(index++).padStart(5,'0')+'.bin';
  const remote=obj.name.split('/').map(encodeURIComponent).join('/');
  const endpoint=api.replace(/\/$/,'')+'/storage/v1/object/authenticated/'+encodeURIComponent(obj.bucket)+'/'+remote;
  const response=await fetch(endpoint,{headers:{Authorization:'Bearer '+storageKey,apikey:storageKey},redirect:'error',signal:AbortSignal.timeout(60000)});
  if(!response.ok||!response.body)throw Error('STORAGE_DOWNLOAD_FAILED_'+response.status);
  const target=join(stage,file);
  await pipeline(Readable.fromWeb(response.body),createWriteStream(target,{flags:'wx',mode:0o600}));
  const bytes=statSync(target).size;
  if(obj.size!==null&&obj.size!==undefined&&/^\d+$/.test(String(obj.size))&&bytes!==Number(obj.size))throw Error('STORAGE_SIZE_MISMATCH');
  hashes.push({bucket:obj.bucket,name:obj.name,file,bytes,sha256:sha(target)});
 }
 if(roster()!==before)throw Error('STORAGE_METADATA_CHANGED_DURING_BACKUP_RETRY_FRESH_SNAPSHOT');
 const authUrl=process.env.SEC_BACKUP_ALLOW_LOCAL_AUTH_FIXTURE==='1' && process.env.SEC_BACKUP_AUTH_FIXTURE_URL?.startsWith('http://127.0.0.1:4100/')
  ? process.env.SEC_BACKUP_AUTH_FIXTURE_URL
  : 'https://api.supabase.com/v1/projects/waluhdgqhwjjwmflhrle/config/auth';
 let authResponse;
 try{authResponse=await fetch(authUrl,{headers:{Authorization:'Bearer '+process.env.SUPABASE_ACCESS_TOKEN},redirect:'error',signal:AbortSignal.timeout(20000)});}
 catch{throw Error('HOSTED_AUTH_CONFIG_NETWORK_FAILED')}
 if(!authResponse.ok)throw Error('HOSTED_AUTH_CONFIG_FAILED_HTTP_'+authResponse.status);
 let authConfigData;
 try{authConfigData=await authResponse.json()}catch{throw Error('HOSTED_AUTH_CONFIG_INVALID_JSON')}
 if(!authConfigData||typeof authConfigData!=='object'||Array.isArray(authConfigData)||Object.keys(authConfigData).length<3)throw Error('HOSTED_AUTH_CONFIG_INCOMPLETE');
 writeFileSync(join(stage,'hosted-auth-config.json'),JSON.stringify(authConfigData),{mode:0o600});
 const authConfig={attempted:true,captured:true,scope:'hosted_config_only',redacted_remote_secrets_possible:true};
 writeFileSync(join(stage,'manifest.json'),JSON.stringify({format:'attendance-secure-backup-v1',database_sha256:sha(join(stage,'database.dump')),roles_sha256:sha(join(stage,'roles.globals.sql')),database_snapshot_window:{start:databaseCaptureStart,end:databaseCaptureEnd},catalog_scope:catalogScope,toc_scope:tocScope,scope_gaps:scopeGaps,storage:hashes,auth_config:authConfig,full_storage_count:objects.length,created_at:new Date().toISOString()},null,2),{mode:0o600});
 command('tar',['-czf',join(root,'snapshot.tar.gz'),'-C',stage,'.']);
 command('node',['scripts/security/seal.mjs',join(root,'snapshot.tar.gz'),process.env.SEC_BACKUP_RECIPIENT_PEM||'security/recipient_20261103.pub.pem',out]);
 console.log('ENCRYPTED_BACKUP_CREATED storage_objects='+objects.length+' db_archive_bytes='+statSync(join(stage,'database.dump')).size+' auth_config_captured='+authConfig.captured);
}
try{await run()}finally{rmSync(root,{force:true,recursive:true})}
