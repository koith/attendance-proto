// Keep one PostgreSQL MVCC snapshot open across pg_dump and read-only inventory queries.
// The source connection is never written. The transaction ends before Storage downloads.
import {spawn} from 'node:child_process';

export function snapshotSql(id,sql){
 if(typeof id!=='string'||!/^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+$/.test(id))
  throw Error('INVALID_EXPORTED_SNAPSHOT_ID');
 return "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY; SET TRANSACTION SNAPSHOT '"+id+"'; "+sql+"; COMMIT;";
}

export async function openExportedSnapshot(conninfo,{psql='psql',timeoutMs=20000}={}){
 const child=spawn(psql,['-X','-q','-A','-t','-v','ON_ERROR_STOP=1','--dbname',conninfo],
  {stdio:['pipe','pipe','pipe']});
 let out='',completed=false;
 const id=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{child.kill();reject(Error('SNAPSHOT_EXPORT_TIMEOUT'))},timeoutMs);
  const fail=()=>{if(completed)return;completed=true;clearTimeout(timer);reject(Error('SNAPSHOT_EXPORT_FAILED'))};
  child.once('error',fail);
  child.once('exit',fail);
  child.stderr.on('data',()=>{}); // never emit conninfo or credentials
  child.stdout.on('data',b=>{
   if(completed)return;
   out+=b.toString('utf8');
   if(out.length>4096){fail();child.kill();return}
   const match=out.match(/(?:^|\n)([0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9]+)\r?\n/);
   if(match){completed=true;clearTimeout(timer);resolve(match[1])}
  });
  child.stdin.write('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();\n');
 });
 return {id,async close(){
  if(child.exitCode!==null)return;
  await new Promise(resolve=>{
   let done=false;
   const finish=()=>{if(done)return;done=true;clearTimeout(timer);resolve()};
   const timer=setTimeout(()=>{child.kill();finish()},5000);
   child.once('exit',finish);
   try{child.stdin.end('ROLLBACK;\n\\q\n')}catch{child.kill();finish()}
  });
 }};
}
