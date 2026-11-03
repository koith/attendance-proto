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
function command(name,args){return execFileSync(name,args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],env:process.env,maxBuffer:4*1024*1024,timeout:120000})}
function sha(path){return createHash('sha256').update(readFileSync(path)).digest('hex')}
function roster(){
 const query="SELECT coalesce(json_agg(json_build_object('bucket',bucket_id,'name',name,'size',metadata->>'size','updated_at',updated_at) ORDER BY bucket_id,name),'[]'::json)::text FROM storage.objects";
 return command('psql',['-X','-A','-t','-v','ON_ERROR_STOP=1','--dbname',url,'-c',query]).trim();
}
async function run(){
 if(!url||!api||!storageKey||!out)throw Error('MISSING_PRIVATE_RUNTIME_BACKUP_CONFIGURATION');
 const stage=join(root,'snapshot');mkdirSync(stage,{recursive:true});
 const storage=join(stage,'storage');mkdirSync(storage);
 const before=roster();const objects=JSON.parse(before);
 execFileSync('pg_dump',['--format=custom','--dbname',url,'--file',join(stage,'database.dump')],{stdio:['ignore','pipe','pipe'],env:process.env,timeout:180000});
 const contents=command('pg_restore',['--list',join(stage,'database.dump')]);
 for(const marker of ['SCHEMA - auth','SCHEMA - storage','TABLE DATA public'])if(!contents.includes(marker))throw Error('DB_ARCHIVE_MISSING_'+marker.replaceAll(' ','_'));
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
 const authConfig={attempted:false,captured:false};
 if(process.env.SUPABASE_ACCESS_TOKEN){
  authConfig.attempted=true;
  const response=await fetch('https://api.supabase.com/v1/projects/waluhdgqhwjjwmflhrle/config/auth',{headers:{Authorization:'Bearer '+process.env.SUPABASE_ACCESS_TOKEN},redirect:'error',signal:AbortSignal.timeout(20000)});
  if(response.ok){writeFileSync(join(stage,'hosted-auth-config.json'),await response.text(),{mode:0o600});authConfig.captured=true}
 }
 writeFileSync(join(stage,'manifest.json'),JSON.stringify({format:'attendance-secure-backup-v1',database_sha256:sha(join(stage,'database.dump')),storage:hashes,auth_config:authConfig,full_storage_count:objects.length,created_at:new Date().toISOString()},null,2),{mode:0o600});
 command('tar',['-czf',join(root,'snapshot.tar.gz'),'-C',stage,'.']);
 command('node',['scripts/security/seal.mjs',join(root,'snapshot.tar.gz'),process.env.SEC_BACKUP_RECIPIENT_PEM||'security/recipient_20261103.pub.pem',out]);
 console.log('ENCRYPTED_BACKUP_CREATED storage_objects='+objects.length+' db_archive_bytes='+statSync(join(stage,'database.dump')).size+' auth_config_captured='+authConfig.captured);
}
try{await run()}finally{rmSync(root,{force:true,recursive:true})}
