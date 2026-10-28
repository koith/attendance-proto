import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const allNames=['hq_owner_console.js','hq_store_onboarding_ui.js','owner_activation.html','owner_activation.js',
 'owner_temp_activation.html','owner_temp_activation.js','operations_v1.js','actual_attendance.html',
 'actual_attendance.js','actual_attendance.css','recipe_access_v220.js','recipe_access_v220.css','admin_single_session_watch_v1.js'];
const selected=process.argv.includes('--owner-password-feedback')?allNames.filter(x=>!x.startsWith('owner_activation.')&&!x.startsWith('owner_temp_activation.')):allNames;
const priorNames=process.argv.includes('--assistant-attendance')?allNames.filter(x=>!['actual_attendance.html','actual_attendance.js'].includes(x)):selected;
const names=process.argv.includes('--protected-tab-entry')?priorNames.filter(x=>x!=='recipe_access_v220.js'):priorNames;
assert.ok([9,11,12,13].includes(names.length));
const base='https://koith.github.io/attendance-proto/';
const file='/tmp/qa1243-legacy-assets-before.json';
const hashes=async()=>Object.fromEntries(await Promise.all(names.map(async path=>{
 const r=await fetch(base+path+'?legacy_check='+Date.now(),{cache:'no-store',signal:AbortSignal.timeout(15000)});
 assert.equal(r.status,200);return [path,createHash('sha256').update(await r.text()).digest('hex')];
})));
if(process.argv.includes('--before')){writeFileSync(file,JSON.stringify(await hashes()));console.log('LEGACY_ENTRY_'+names.length+'_OPERATING_ASSETS_CAPTURED');}
else{assert.deepEqual(await hashes(),JSON.parse(readFileSync(file,'utf8')));console.log('LEGACY_ENTRY_'+names.length+'_OPERATING_ASSETS_UNCHANGED');}
