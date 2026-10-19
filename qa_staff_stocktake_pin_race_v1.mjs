import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync('operations_staff_stocktake_v1.js','utf8');
const index=fs.readFileSync('index.html','utf8');
assert.match(source,/staffVerificationMatches\(epoch,verificationEpoch,/);
assert.match(source,/staffCountPin"\)\.addEventListener\("input",invalid\)/);
assert.match(source,/staffCountEmployee"\)\.addEventListener\("change",invalid\)/);
assert.match(source,/verifiedEmployee=null;catalog=\[\];selected\.clear\(\)/);
assert.match(source,/if\(dialog\.isConnected&&epoch===verificationEpoch\)/);
assert.match(source,/staffStocktakeSubmit\(verifiedEmployee,el\("staffCountPin"\)\.value/);
assert.match(source,/result\.stock_changed!==false/);
assert.match(index,/operations_staff_stocktake_v1\.js\?v=20261019v346/);

class FakeNode {
 constructor(){this.value='';this.hidden=false;this.disabled=false;this.textContent='';this.innerHTML='';this.isConnected=true;this.handlers={};this.nodes=new Map();}
 querySelector(selector){if(!this.nodes.has(selector))this.nodes.set(selector,new FakeNode());return this.nodes.get(selector);}
 querySelectorAll(){return [];}
 addEventListener(name,fn){(this.handlers[name]??=[]).push(fn);}
 dispatch(name){for(const fn of this.handlers[name]||[])fn({target:this});}
 focus(){}
 remove(){this.isConnected=false;}
}
let modal=null,calls=[];
const doc={createElement(){return modal=new FakeNode();},body:{appendChild(m){m.isConnected=true;}}};
const defer=()=>{
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
};
const window={};
const BE={
 posPublicStaffCards:async()=>[{id:101,name:'Synthetic Clocked In Staff',working:true},{id:102,name:'Other Staff',working:true}],
 staffStocktakeCatalog(id,pin){
  const d=defer();calls.push({id,pin,...d});return d.promise;
 }
};
const context=vm.createContext({window,document:doc,BE,LIVE:true,alert(){},confirm(){return false;},console});
vm.runInContext(source,context,{filename:'operations_staff_stocktake_v1.js',timeout:1500});
await window.openStaffStocktake();
const el=id=>modal.querySelector('#'+id);
const verify=(id,pin)=>{
 el('staffCountEmployee').value=String(id);
 el('staffCountPin').value=pin;
 const p=el('staffCountVerify').onclick();
 assert.equal(calls.at(-1).id,id);
 assert.equal(calls.at(-1).pin,pin);
 return p;
};
const rows=[{id:11,name:'우유',unit:'ml'}];
// PIN changes while RPC is in flight: old success MUST NOT revive authenticated workspace.
const a=verify(101,'1111');
el('staffCountPin').value='2222';el('staffCountPin').dispatch('input');
calls[0].resolve(rows);await a;
assert.equal(el('staffCountWorkspace').hidden,true,'stale verification reopened prior staff's workspace');
assert.equal(el('staffCountSubmit').disabled,true);
assert.notEqual(el('staffCountStatus').textContent,'본인 확인 완료 · 재고 실사 품목을 입력하세요.');
// Matching request succeeds and permits only a fresh verified workspace.
const b=verify(101,'2222');
calls[1].resolve(rows);await b;
assert.equal(el('staffCountWorkspace').hidden,false,'fresh verified PIN should unlock workflow');
// Editing identity invalidates previously successful PIN immediately.
el('staffCountEmployee').value='102';el('staffCountEmployee').dispatch('change');
assert.equal(el('staffCountWorkspace').hidden,true,'switching employee must revoke form');
assert.equal(el('staffCountSubmit').disabled,true);
// Employee switch in flight cannot leak an old worker's successful RPC result.
const c=verify(101,'3333');
el('staffCountEmployee').value='102';el('staffCountEmployee').dispatch('change');
calls[2].resolve(rows);await c;
assert.equal(el('staffCountWorkspace').hidden,true);
// Failure from old request must not overwrite the new identity's current state.
const d=verify(102,'4444');
el('staffCountPin').value='5555';el('staffCountPin').dispatch('input');
calls[3].reject(new Error('stale network error'));await d;
assert.match(el('staffCountStatus').textContent,/다시 본인 확인하세요/);
// Close during RPC cannot reopen a removed modal or retain PIN.
const e=verify(102,'6666');
modal.querySelector('.ops-modal-close').onclick();
calls[4].resolve(rows);await e;
assert.equal(modal.isConnected,false);assert.equal(el('staffCountPin').value,'');
console.log('PASS actual MTG-16 shipped JS async UI: stale PIN/employee/race/late-error/close denied, fresh login allowed');
