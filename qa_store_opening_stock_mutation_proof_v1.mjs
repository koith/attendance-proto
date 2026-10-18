/* #1060 / QA-07: prove stock-opening QA rejects unsafe purchasing regressions.
 * All mutations run in a disposable local directory; never change production.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'store-stock-negative-'));
const source='operations_reference_ui_v208.js';
const fixture='qa_stock_reorder_net_pending_v1.mjs';
const original=fs.readFileSync(source,'utf8');
const run=()=>{
 const result=spawnSync(process.execPath,[fixture],{
  cwd:tmp,encoding:'utf8',timeout:30000,maxBuffer:1024*1024
 });
 assert.ok(!result.error,'Stock mutation fixture execution failed: '+result.error);
 return {status:result.status,output:String(result.stdout||'')+String(result.stderr||'')};
};
function inject(anchor,replacement,label,expected){
 assert.equal(original.split(anchor).length-1,1,'Nonunique mutation anchor: '+label);
 fs.writeFileSync(path.join(tmp,source),original.replace(anchor,replacement));
 const result=run();
 assert.notEqual(result.status,0,'Unsafe stock mutation unexpectedly passed: '+label);
 assert.match(result.output,expected,'Mutation failed for an unrelated reason: '+label);
 console.log('PASS: rejected unsafe stock mutation — '+label);
}
try{
 fs.copyFileSync(fixture,path.join(tmp,fixture));
 fs.writeFileSync(path.join(tmp,source),original);
 const baseline=run();
 assert.equal(baseline.status,0,'Safe production stock baseline failed: '+baseline.output.slice(-1200));
 inject(
  'const shortage=Math.max(0,target-on-pending)',
  'const shortage=Math.max(1,target-on-pending)',
  'already-ordered goods wrongly suggested again',
  /already-ordered items must never be duplicated by default|no shortage must suggest zero/
 );
 inject(
  'if(!match||["CANCELLED","VOID","RECEIVED","CLOSED"].includes(String(o.status).toUpperCase()))continue;',
  'if(!match)continue;',
  'cancelled purchase orders counted as outstanding inventory',
  /cancelled orders are ignored/
 );
 console.log('PASS QA-07: stock ordering safety QA reliably rejects both injected regressions');
}finally{
 fs.rmSync(tmp,{recursive:true,force:true});
}
