// Offline scope tests: synthetic manifests and pg_restore TOC text. No secrets, DB or network.
import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const SCRIPT=new URL('./verify_backup_completeness.mjs',import.meta.url).pathname;
const H='a'.repeat(64);
const completeManifest={format:'attendance-secure-backup-v1',database_sha256:H,roles_sha256:H,
 auth_config:{captured:true},storage:[{bucket:'b',name:'x',file:'storage/00001.bin',bytes:10,sha256:H}],full_storage_count:1};
const app=['pin_private','pos_private','session_guard','private','demo_cleanup_archive'];
const completeToc=[
 'SCHEMA - auth','SCHEMA - storage','TABLE DATA public attendance_events',
 'TABLE DATA auth users','SEQUENCE public employees_id_seq','SEQUENCE SET public employees_id_seq',
 'POLICY public attendance_events tenant',
 ...app.flatMap(s=>['SCHEMA - '+s,'TABLE DATA '+s+' fixture_table'])
].join('\n');
function run(manifest,toc){
 const d=mkdtempSync(join(tmpdir(),'bkp-scope-'));
 try{
  const m=join(d,'manifest.json'),t=join(d,'toc.txt');
  writeFileSync(m,JSON.stringify(manifest));writeFileSync(t,toc);
  try{return {code:0,json:JSON.parse(execFileSync(process.execPath,[SCRIPT,m,t],{encoding:'utf8'}))};}
  catch(e){return {code:e.status,json:JSON.parse(e.stdout)};}
 }finally{rmSync(d,{recursive:true,force:true});}
}
function incomplete(m,t,label){const r=run(m,t);assert.equal(r.code,1);assert.equal(r.json.result,'BACKUP_SCOPE_INCOMPLETE');assert.ok(r.json.missing.some(x=>x.label===label),label);}
test('full declared scope only yields metadata-present (not restore success)',()=>{
 const r=run(completeManifest,completeToc);assert.equal(r.code,0);
 assert.equal(r.json.result,'BACKUP_SCOPE_METADATA_PRESENT');assert.equal(r.json.missing.length,0);
 assert.match(r.json.warning,/Does NOT verify/);
});
test('missing role globals rejected',()=>incomplete({...completeManifest,roles_sha256:undefined},completeToc,'roles.globals digest declared'));
test('missing Auth config rejected',()=>incomplete({...completeManifest,auth_config:{captured:false}},completeToc,'auth hosted config'));
test('Storage metadata without file bytes digest rejected',()=>incomplete({...completeManifest,storage:[{bucket:'b',name:'x'}]},completeToc,'storage object byte digests declared'));
test('missing auth.users rejected',()=>incomplete(completeManifest,completeToc.replace('TABLE DATA auth users',''),'TOC: auth.users data'));
test('missing sequence state rejected',()=>incomplete(completeManifest,completeToc.replace('SEQUENCE SET public employees_id_seq',''),'TOC: sequence values'));
test('missing RLS policy rejected',()=>incomplete(completeManifest,completeToc.replace('POLICY public attendance_events tenant',''),'TOC: RLS policies'));
test('bare db-dump shaped backup rejected',()=>incomplete({format:'attendance-secure-backup-v1',database_sha256:H},'TABLE DATA public attendance_events','roles.globals digest declared'));
test('missing PIN schema rejected',()=>incomplete(completeManifest,completeToc.replace('SCHEMA - pin_private',''),'TOC: app schema pin_private'));
test('missing POS session data rejected',()=>incomplete(completeManifest,completeToc.replace('TABLE DATA pos_private fixture_table',''),'TOC: app data pos_private'));
test('missing session guard schema rejected',()=>incomplete(completeManifest,completeToc.replace('SCHEMA - session_guard',''),'TOC: app schema session_guard'));
test('missing historical archive data rejected',()=>incomplete(completeManifest,completeToc.replace('TABLE DATA demo_cleanup_archive fixture_table',''),'TOC: app data demo_cleanup_archive'));
test('fake 64-character nonhex digests rejected',()=>incomplete({...completeManifest,database_sha256:'Z'.repeat(64)},completeToc,'database.dump digest declared'));

test('Claude v2 business and managed scope classification appears in one strict checker',()=>{
 const r=run(completeManifest,completeToc);assert.equal(r.code,0);
 assert.deepEqual(r.json.business_schemas_required_in_backup,
  ['public','auth','storage','pin_private','pos_private','session_guard','private','demo_cleanup_archive']);
 for(const s of ['cron','net','realtime','supabase_migrations','vault','extensions','graphql','graphql_public','pgsodium'])
  assert.ok(r.json.provider_managed_schemas_require_separate_provisioning.includes(s),s);
 assert.equal(r.json.result,'BACKUP_SCOPE_METADATA_PRESENT');
});
