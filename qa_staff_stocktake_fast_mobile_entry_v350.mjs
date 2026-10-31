import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

// Execute the actual public shared-POS stocktake modal against an in-memory UI.
// No live PIN, employee, payroll, inventory or supplier data is used.
const source=fs.readFileSync('operations_staff_stocktake_v1.js','utf8');
const index=fs.readFileSync('index.html','utf8');
// Test the v0.350 stocktake asset regardless of a later unrelated app release.
assert.match(index,/const APP_VERSION="v0\.\d+"/);
assert.match(index,/operations_staff_stocktake_v1\.js\?v=20261031v382/);
assert.match(source,/id="staffCountQty"[^>]*inputmode="decimal"/);
assert.match(source,/staffCountQty"\)\.addEventListener\("keydown"/);
class FakeNode {
 constructor(){this.value='';this.textContent='';this.innerHTML='';this.disabled=false;
  this.hidden=false;this.isConnected=true;this.events={};this.children=new Map();this.focused=false;}
 querySelector(key){if(!this.children.has(key))this.children.set(key,new FakeNode());return this.children.get(key);}
 querySelectorAll(){return [];}
 addEventListener(type,fn){(this.events[type]??=[]).push(fn);}
 dispatch(type,more={}){
  for(const fn of this.events[type]||[])fn({target:this,...more});
 }
 click(){if(!this.disabled)this.onclick?.();}
 focus(){this.focused=true;}
 remove(){this.isConnected=false;}
}
let modal=null;const document={createElement(){return modal=new FakeNode();},
 body:{appendChild(node){node.isConnected=true;}}};
let submissions=0;
const BE={
 posPublicStaffCards:async()=>[{id:101,name:'QA staff',working:true}],
 staffStocktakeCatalog:async(id,pin)=>{
  assert.equal(id,101);assert.equal(pin,'1234');
  return [{id:11,name:'원두',unit:'g'},{id:12,name:'우유',unit:'ml'}];
 },
 staffStocktakeSubmit:async()=>{submissions++;throw Error('not permitted in UI-only QA')}
};
const window={canUseStaffStocktake:()=>true};
vm.runInNewContext(source,{window,document,BE,LIVE:true,
 alert(message){throw Error('Unexpected alert: '+message)},confirm(){return false},console},
 {filename:'operations_staff_stocktake_v1.js'});
await window.openStaffStocktake();
const el=id=>modal.querySelector('#'+id);
el('staffCountEmployee').value='101';el('staffCountPin').value='1234';
await el('staffCountVerify').onclick();
assert.equal(el('staffCountWorkspace').hidden,false);
assert.equal(el('staffCountSubmit').disabled,true);

el('staffCountItem').value='11';
el('staffCountQty').value='12.125';
let prevented=false;
el('staffCountQty').dispatch('keydown',{key:'Enter',preventDefault(){prevented=true;}});
assert.equal(prevented,true,'Enter must stop form submission');
assert.equal(el('staffCountQty').value,'','successful add clears numeric input');
assert.equal(el('staffCountSearch').value,'','successful add clears search term');
assert.equal(el('staffCountSearch').focused,true,'focus next search for mobile speed');
assert.match(el('staffCountLines').innerHTML,/원두.*12\.125.*g/);
assert.equal((el('staffCountLines').innerHTML.match(/data-remove=/g)||[]).length,1);
assert.equal(el('staffCountSubmit').disabled,false,'only a verified PIN allows adding draft lines');
assert.match(el('staffCountStatus').textContent,/다음 품목을 검색/);

el('staffCountItem').value='11';
el('staffCountItem').dispatch('change');
assert.match(el('staffCountAdd').textContent,/수량 수정/);
el('staffCountQty').value='0';
el('staffCountQty').dispatch('keydown',{key:'Enter',preventDefault(){}});
assert.match(el('staffCountLines').innerHTML,/원두.*0.*g/);
assert.equal((el('staffCountLines').innerHTML.match(/data-remove=/g)||[]).length,1,
 'Recount the same item without adding a duplicate line');
assert.match(el('staffCountStatus').textContent,/수량을 수정/);

el('staffCountItem').value='12';
el('staffCountItem').dispatch('change');
assert.match(el('staffCountAdd').textContent,/품목 추가/);
el('staffCountQty').value='-1';
el('staffCountQty').dispatch('keydown',{key:'Enter',preventDefault(){}});
assert.match(el('staffCountStatus').textContent,/수량/);
assert.equal((el('staffCountLines').innerHTML.match(/data-remove=/g)||[]).length,1,
 'Invalid count cannot alter already verified local draft');
el('staffCountQty').value='2.5';
el('staffCountQty').dispatch('keydown',{key:'Enter',preventDefault(){}});
assert.equal((el('staffCountLines').innerHTML.match(/data-remove=/g)||[]).length,2);
assert.match(el('staffCountLines').innerHTML,/우유.*2\.5.*ml/);
assert.equal(submissions,0,'Keyboard shortcuts must never submit or mutate live inventory');
// Any credential change still invalidates PIN and hides the draft.
el('staffCountPin').value='4321';el('staffCountPin').dispatch('input');
assert.equal(el('staffCountWorkspace').hidden,true);
assert.equal(el('staffCountSubmit').disabled,true);
assert.equal(submissions,0);
console.log('PASS v0.350 MTG-16 actual shared POS: Enter next-item, recount/zero, invalid input, PIN isolation, no stock writes');
