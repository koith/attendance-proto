import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transition} from './state.mjs';
test('merge/deploy do not imply acceptance; missing proof cannot advance', () => {
  assert.equal(transition('READY','IN_PROGRESS'),'IN_PROGRESS');
  assert.throws(()=>transition('IN_PROGRESS','ACCEPTED',{verified:true}),/INVALID_TRANSITION/);
  for (const [a,b] of [['IN_PROGRESS','CODE_VERIFIED'],['CODE_VERIFIED','MERGED'],['MERGED','DEPLOYED'],['DEPLOYED','ACCEPTED']]) {
    assert.throws(()=>transition(a,b),/EVIDENCE/);
    assert.equal(transition(a,b,{verified:true}),b);
  }
});
test('interruption, duplicate transition, blocked and explicit resume', () => {
  assert.equal(transition('IN_PROGRESS','IN_PROGRESS'),'IN_PROGRESS');
  assert.throws(()=>transition('IN_PROGRESS','BLOCKED'),/REASON/);
  assert.equal(transition('CODE_VERIFIED','BLOCKED',{reason:'permission denied'}),'BLOCKED');
  assert.throws(()=>transition('BLOCKED','ACCEPTED',{resumeState:'CODE_VERIFIED'}),/RESUME/);
  assert.equal(transition('BLOCKED','CODE_VERIFIED',{resumeState:'CODE_VERIFIED'}),'CODE_VERIFIED');
  assert.equal(transition('ACCEPTED','IN_PROGRESS'),'IN_PROGRESS');
  assert.throws(()=>transition('done','ACCEPTED'),/INVALID_STATE/);
});
test('actual existing P0 guard isolates AI changes and rejects operating/mixed paths', async () => {
  const workflow=readFileSync('.github/workflows/p0-pages-deploy.yml','utf8');
  const start=workflow.indexOf('            const allowed=new Set([');
  const end=workflow.indexOf("\n      # A merged Edge",start);
  const source=workflow.slice(start,end).split('\n').map(l=>l.slice(12)).join('\n');
  const run=new (Object.getPrototypeOf(async function(){}).constructor)('context','github','core',source);
  const check=files=>run({repo:{},sha:'b'.repeat(40),payload:{before:'a'.repeat(40),head_commit:{message:'[AI1331] [QA1243-NO-OPERATING-WRITE]'}}},
    {rest:{repos:{compareCommits:async()=>({data:{files:files.map(filename=>({filename}))}})}}},{info(){}});
  await check(['AGENTS.md','scripts/ai-dev/state.mjs','.github/workflows/work-orchestrator.yml']);
  for (const path of ['index.html','apps_script.gs','supabase/functions/server-sync-sheet/index.ts','unknown.txt','scripts/ai-dev/../../index.html'])
    await assert.rejects(check(['AGENTS.md',path]),/AI1331_SCOPE/);
  await assert.rejects(check([]),/AI1331_SCOPE/);
});

test('actual existing Google guard skips AI changes without repeating OAuth or Sheets QA', async () => {
  const workflow=readFileSync('.github/workflows/qa1243-live-e2e.yml','utf8');
  const start=workflow.indexOf('            const message=');
  const end=workflow.indexOf("            core.setOutput('run_live',String(runLive));",start);
  const source=workflow.slice(start,end)+"core.setOutput('run_live',String(runLive));";
  const run=new (Object.getPrototypeOf(async function(){}).constructor)('context','github','core',source);
  const check=async(files,message='[AI1331] [QA1243-NO-OPERATING-WRITE]')=>{
    let output;
    await run({eventName:'push',repo:{},sha:'b'.repeat(40),payload:{before:'a'.repeat(40),head_commit:{message}}},
      {rest:{repos:{compareCommits:async()=>({data:{files:files.map(filename=>({filename,status:'modified'}))}})}}},
      {info(){},setOutput(k,v){output=v;}});
    return output;
  };
  assert.equal(await check(['scripts/ai-dev/cli.mjs','.github/workflows/qa1243-live-e2e.yml']),'false');
  for(const p of ['apps_script.gs','index.html','scripts/qa1243_live_edge_gas_sheets.mjs'])
    await assert.rejects(check([p]),/AI1331_SCOPE/);
  await assert.rejects(check(['AGENTS.md'],'[AI1331]'),/AI1331_SCOPE/);
  assert.equal(await check(['apps_script.gs'],'ordinary app release'),'true');
});
