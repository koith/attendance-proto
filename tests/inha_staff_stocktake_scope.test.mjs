import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync('index.html','utf8'),js=readFileSync('operations_staff_stocktake_v1.js','utf8');
const predicate=html.match(/function canUseStaffStocktake\(\)\{[\s\S]*?\n\}/)?.[0];
const start=html.indexOf('async function renderPos(){'),end=html.indexOf('  const grid=',start);
assert.ok(predicate&&start>0&&end>start);
const header=html.slice(start,end)+'}';
const cases=[{id:1,allow:true},{id:80},{id:290},{id:2},{id:0},{id:1,loading:true},{id:1,unavailable:true},{id:1,mode:'hq'},{id:1,hash:'#dashboard'}];
for(const c of cases)test('actual POS entry scope '+JSON.stringify(c),async()=>{
 const view={innerHTML:''};let bound=0;
 const ctx=vm.createContext({STORE_ENTRY_LOADING:!!c.loading,STORE_ENTRY_UNAVAILABLE:!!c.unavailable,CURRENT_STORE_ID:c.id,STORE_ENTRY_MODE:c.mode||'store',location:{hash:c.hash||'#pos'},view,window:{},document:{getElementById:()=>view.innerHTML.includes('staffCountOpen')?{addEventListener(){bound++}}:null}});
 vm.runInContext(predicate+'\n'+header+'\nrenderPos()',ctx);
 assert.equal(view.innerHTML.includes('id="staffCountOpen"'),!!c.allow);
 assert.equal(bound,c.allow?1:0);
});
test('direct popup call and store-context transition use same scope',async()=>{
 let allowed=false,modal=null,reads=0;const handlers={};
 class Node{constructor(){this.value='';this.isConnected=true;this.nodes=new Map();this.hidden=false;}querySelector(q){if(!this.nodes.has(q))this.nodes.set(q,new Node());return this.nodes.get(q)}querySelectorAll(){return []}focus(){}addEventListener(){}remove(){this.isConnected=false}}
 const window={canUseStaffStocktake:()=>allowed,addEventListener:(k,fn)=>handlers[k]=fn};
 const document={body:{appendChild(){}},createElement(){return modal=new Node()},addEventListener(){},removeEventListener(){}};
 vm.runInNewContext(js,{window,document,LIVE:true,BE:{posPublicStaffCards:async()=>{reads++;return []}},alert(){},console});
 await window.openStaffStocktake();assert.equal(modal,null);assert.equal(reads,0);
 allowed=true;await window.openStaffStocktake();assert.ok(modal.isConnected);modal.querySelector('#staffCountPin').value='1234';
 allowed=false;handlers['baekeok:store-context-change']();assert.equal(modal.isConnected,false);assert.equal(modal.querySelector('#staffCountPin').value,'');
 await window.openStaffStocktake();assert.equal(reads,1);
});
import {assertInhaStocktakeRelease,INHA_STOCKTAKE_BASE} from '../scripts/inha_staff_stocktake_release.mjs';
test('one-time publication rejects unknown, operating, drift and wrong parent',()=>{
 const files=['index.html','operations_staff_stocktake_v1.js'].map(filename=>({filename,status:'modified'}));
 const message='[INHA-STAFF-STOCKTAKE] [QA1243-APP-PAGES] [QA1243-NO-OPERATING-WRITE] [QA1243-NO-GOOGLE-RERUN]';
 assert.equal(assertInhaStocktakeRelease(files,message,INHA_STOCKTAKE_BASE),true);
 for(const path of ['supabase/migrations/a.sql','supabase/functions/server-sync-sheet/index.ts','apps_script.gs','unknown.js'])assert.throws(()=>assertInhaStocktakeRelease([...files,{filename:path}],message,INHA_STOCKTAKE_BASE),/SCOPE/);
 assert.throws(()=>assertInhaStocktakeRelease(files,message,'a'.repeat(40)),/PARENT/);
 assert.throws(()=>assertInhaStocktakeRelease(files,message,INHA_STOCKTAKE_BASE,{read:()=>''}),/BYTES/);
});
