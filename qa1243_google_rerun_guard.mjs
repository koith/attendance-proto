// Execute the actual Actions guard: a skip marker never exempts app/Google changes.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('.github/workflows/qa1243-live-e2e.yml','utf8');
const start=source.indexOf('            const message=');
const end=source.indexOf("            core.setOutput('run_live',String(runLive));",start);
assert.ok(start>0&&end>start);
const script=source.slice(start,end)+"            core.setOutput('run_live',String(runLive));";
const execute=new (Object.getPrototypeOf(async function(){}).constructor)('context','github','core',script);
async function verdict(files,message='[QA1243-NO-GOOGLE-RERUN] [QA1243-NO-OPERATING-WRITE]',eventName='push'){
 let output;
 await execute({eventName,sha:'b'.repeat(40),repo:{owner:'fixture',repo:'fixture'},payload:{before:'a'.repeat(40),head_commit:{message}}},
 {rest:{repos:{compareCommits:async()=>({data:{files:files.map(filename=>({filename,status:'modified'}))}})}}},
 {info(){},setOutput(name,value){assert.equal(name,'run_live');output=value;}});
 return output;
}
assert.equal(await verdict(['qa_auth_role_journey_1243.mjs','.github/workflows/qa1243-live-e2e.yml']),'false');
assert.equal(await verdict(['supabase/functions/server-sync-sheet/index.ts'],'ordinary Google change'),'true');
assert.equal(await verdict([],'','pull_request'),'false');
assert.equal(await verdict(['qa_inventory_valuation_1243.sql','supabase/migrations/20261023023009_qa1243_inventory_valuation_fail_closed.sql']),'false');
for(const f of ['index.html','apps_script.gs','scripts/qa1243_live_edge_gas_sheets.mjs','supabase/functions/server-sync-sheet/index.ts','unknown.mjs'])
 await assert.rejects(verdict([f]),/GOOGLE_REUSE_SCOPE_REJECTED/);
await assert.rejects(verdict([]),/GOOGLE_REUSE_SCOPE_REJECTED/);
await assert.rejects(verdict(['qa_auth_role_journey_1243.mjs'],'[QA1243-NO-GOOGLE-RERUN]'),/GOOGLE_REUSE_REQUIRES_NO_WRITE/);
assert.match(source,/if: github.event_name == 'push' && needs.execution-scope.outputs.run_live == 'true'/);
console.log('PASS actual Google reuse guard: Auth-only skip, reject operating/Google source exemptions');
