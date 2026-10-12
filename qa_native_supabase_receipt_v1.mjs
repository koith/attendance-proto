import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
const require=createRequire(import.meta.url);
const attest=require('./ci_native_supabase_receipt.cjs');
const sha='a'.repeat(40);
const project='https://supabase.com/dashboard/project/waluhdgqhwjjwmflhrle';
const good={name:'Supabase Preview',status:'completed',conclusion:'success',
  app:{slug:'supabase',id:330661},head_sha:sha,details_url:project};
const make=(sequence)=>{
  let count=0,sleeps=0;
  const github={rest:{checks:{listForRef:async args=>{assert.equal(args.filter,'all');assert.equal(args.app_id,330661);return {data:sequence[Math.min(count++,sequence.length-1)]};}}}};
  return {github,context:{repo:{owner:'koith',repo:'attendance-proto'},sha},
    core:{info:()=>{}},sleep:async()=>{sleeps++;},
    reads:()=>count,paused:()=>sleeps};
};
const data=(rows,total_count=rows.length)=>({check_runs:rows,total_count});
let s=make([data([good])]);
assert.equal((await attest({...s,maxAttempts:1})).conclusion,'success');
assert.equal(s.reads(),1);

for(const bad of [
 {...good,app:{slug:'github-actions',id:15368}},
 {...good,app:{slug:'supabase',id:333}},
 {...good,head_sha:'b'.repeat(40)},
 {...good,details_url:'https://supabase.com/dashboard/project/unrelated'},
]){
 s=make([data([bad])]);
 await assert.rejects(attest({...s,maxAttempts:1}),/receipt missing/,
   'Must reject forged, foreign-project or unrelated-SHA deployment checks');
}
for(const conclusion of ['failure','cancelled','timed_out']){
 s=make([data([{...good,conclusion}])]);
 await assert.rejects(attest({...s,maxAttempts:1}),/deployment failed/,
   'Never publish green for a failed native deployment');
}
// A newer skipped PR Preview attached to the base main SHA must not shadow
// an earlier successful *production* run from the official Supabase App.
const skipped={...good,conclusion:'skipped',details_url:project+'/branches',
 started_at:'2026-10-13T00:10:00Z',id:9};
s=make([data([skipped,{...good,started_at:'2026-10-13T00:00:00Z',id:8}])]);
assert.equal((await attest({...s,maxAttempts:1})).conclusion,'success');
s=make([data([skipped])]);
await assert.rejects(attest({...s,maxAttempts:1}),/receipt missing/);
const latestFailure={...good,conclusion:'failure',id:15,started_at:'2026-10-13T00:20:00Z'};
const olderSuccess={...good,id:14,started_at:'2026-10-13T00:10:00Z'};
s=make([data([olderSuccess,latestFailure])]);
await assert.rejects(attest({...s,maxAttempts:1}),/deployment failed/,
 'A newer failed deployment must beat an older success on same SHA');
s=make([data([good],101)]);
await assert.rejects(attest({...s,maxAttempts:1}),/truncated/);
s=make([data([{...good,status:'in_progress',conclusion:null}]),data([good])]);
await attest({...s,maxAttempts:2});
assert.equal(s.reads(),2);
assert.equal(s.paused(),1);

const workflow=fs.readFileSync('.github/workflows/deploy-server-payroll-edge.yml','utf8');
assert.match(workflow,/checks: read/);
assert.match(workflow,/edge-release\/supabase\/\*\*/);
assert.match(workflow,/ci_native_supabase_receipt\.cjs/);
assert.match(workflow,/node scripts\/sync_supabase_native_edge_release\.mjs --check/);
assert.match(workflow,/edge\/server-sync-sheet-deploy/);
assert.doesNotMatch(workflow,/SUPABASE_ACCESS_TOKEN|supabase functions deploy/,
 'Legacy personal-token CLI deploy must not conflict with native GitHub integration');
console.log('PASS native Supabase GitHub release: official app, exact SHA, project, delays, forged and failed checks');
