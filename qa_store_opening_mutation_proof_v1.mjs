/* #1000: prove that automatic store-opening QA actually REJECTS seeded regressions.
 * Each mutation is applied in a disposable local copy only. No real users,
 * email, production DB, remote API or Google Sheet writes.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

const root=process.cwd(),mode=process.argv[2]||'engine';
assert.ok(['engine','browser'].includes(mode),'Choose engine or browser');
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'store-opening-negative-'));
const copy=file=>{
 const dest=path.join(tmp,file);
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.copyFileSync(path.join(root,file),dest);
 return dest;
};
const run=(file,timeout=45000)=>{
 const result=spawnSync(process.execPath,[file],{
   cwd:tmp,encoding:'utf8',timeout,maxBuffer:1024*1024*8,
   env:{...process.env,APP_SMOKE_HOST:'http://127.0.0.1:4173'}
 });
 return {status:result.status,error:result.error,
   output:String(result.stdout||'')+'\n'+String(result.stderr||'')};
};
const mutate=(file,find,replace)=>{
 const src=fs.readFileSync(file,'utf8');
 assert.ok(src.includes(find),'Mutation anchor missing: '+path.basename(file));
 assert.equal(src.split(find).length-1,1,'Mutation anchor must occur exactly once');
 fs.writeFileSync(file,src.replace(find,replace),'utf8');
};
const mustReject=(result,label)=>{
 assert.notEqual(result.status,0,label+' silently passed with injected defect');
 assert.ok(!result.error,label+' harness could not execute: '+result.error);
 assert.match(result.output,/AssertionError|ERR_ASSERTION|Rejected invite|Cross.store|STORE|TEST/i,
    label+' failed for unrelated reason: '+result.output.slice(-1200));
 console.log('PASS negative control: QA rejected '+label);
};
try{
 if(mode==='engine'){
   for(const file of ['qa_store_opening_payroll_sheet_v1.mjs',
     'supabase/functions/server-sync-sheet/engine.mjs',
     'supabase/functions/server-sync-sheet/payroll_policy.mjs',
     'supabase/functions/server-sync-sheet/sheet_minute_reconciliation.mjs'])copy(file);
   const fixture='qa_store_opening_payroll_sheet_v1.mjs';
   const initial=run(fixture);
   assert.equal(initial.status,0,'Real payroll fixture baseline must pass: '+initial.output.slice(-1000));
   const engine=path.join(tmp,'supabase/functions/server-sync-sheet/engine.mjs');
   mutate(engine,".trim().toUpperCase()!=='TEST'",".trim().toUpperCase()==='TEST'");
   const result=run(fixture);
   mustReject(result,'server payroll/Sheet exclusion of TEST employees');
   assert.match(result.output,/TEST excluded from Google Sheet export|Completed regular attendance reaches sheet payload/,
     'Payroll mutant must fail on the security property under test');
 }else{
   for(const file of ['qa_store_opening_browser_v1.mjs','owner_activation.js',
      'owner_activation.html','recipe_access_v220.js','index.html'])copy(file);
   const modules=path.join(root,'node_modules');
   assert.ok(fs.existsSync(path.join(modules,'playwright')),'Playwright must be installed for real browser mutation test');
   fs.symlinkSync(modules,path.join(tmp,'node_modules'),'dir');
   const fixture='qa_store_opening_browser_v1.mjs',activation=path.join(tmp,'owner_activation.js');
   const original=fs.readFileSync(activation,'utf8');
   mutate(activation,"if(password.length<12||password!==confirmPassword)",
     "if(password!==confirmPassword)");
   const tooShort=run(fixture,60000);
   mustReject(tooShort,'short password acceptance in real activation page');
   assert.match(tooShort.output,/Rejected invite must not redirect|AssertionError/,
     'Activation mutant must fail an explicit invitation safety assertion');
   fs.writeFileSync(activation,original);
   mutate(activation,"Number(accepted.store_id)!==storeId","false");
   const crossStore=run(fixture,60000);
   mustReject(crossStore,'mismatched store identity in real activation page');
   assert.match(crossStore.output,/Rejected invite must not redirect|AssertionError/,
     'Store-identity mutant must fail an explicit invitation safety assertion');
 }
 console.log('PASS Store-opening QA self-verification ('+mode+'): injected defects were detected');
}finally{
 fs.rmSync(tmp,{recursive:true,force:true});
}
