import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(process.env.QA_TAB_INDEX||'index.html','utf8');
const routeStart=source.indexOf('function route(){');
const helperStart=source.indexOf('function renderAttendanceEntry(){');
const routeEnd=source.indexOf('// 관리자 탭 로그인 게이트',routeStart);
function entry(hash){
 let body='<div>이전에 선택한 레시피</div>',selected='',pickers=0;
 const nodes=new Map();const node=id=>{if(!nodes.has(id))nodes.set(id,{isConnected:true,textContent:'',classList:{toggle(){}}});return nodes.get(id)};
 const view={get innerHTML(){return body},set innerHTML(v){body=v},firstElementChild:{isConnected:true}};
 const sandbox={location:{hash,search:''},window:{},document:{getElementById:node,querySelector:()=>null},
  view,STORE_ENTRY_LOADING:false,STORE_ENTRY_UNAVAILABLE:false,STORE_ENTRY_LOCK:false,CURRENT_STORE_ID:80,
  LIVE:true,_posTimer:null,clearInterval(){},syncStoreContextUI(){},setTab:t=>selected=t,
  sessionStorage:{removeItem(){}},Auth:{isLoggedIn:()=>false},openMyRecord:()=>{pickers++},requireAuth(){},URLSearchParams};
 vm.createContext(sandbox);vm.runInContext(source.slice(helperStart<0?routeStart:helperStart,routeEnd)+'\nroute();',sandbox);
 return {body,selected,pickers};
}
test('unauthenticated attendance replaces previous recipe with persistent login entry',()=>{
 const r=entry('#attendance');assert.equal(r.selected,'attendance');assert.equal(r.pickers,1);
 assert.match(r.body,/관리자 로그인/);assert.match(r.body,/직원 본인 기록 보기/);
 assert.doesNotMatch(r.body,/이전에 선택한 레시피/);
});

for(const fail of [false,true])test('late recipe '+(fail?'failure':'success')+' preserves selected login screen',async()=>{
 const recipe=readFileSync(process.env.QA_TAB_RECIPE||'recipe_access_v220.js','utf8');
 const a=recipe.indexOf('  async function renderRecipeHub(){'),b=recipe.indexOf('  window.renderRecipeHub=',a);
 let body='',entry=null,resolve,reject;
 const waiting=new Promise((yes,no)=>{resolve=yes;reject=no});
 const view={get innerHTML(){return body},set innerHTML(v){if(entry)entry.isConnected=false;body=v;entry={isConnected:true}},get firstElementChild(){return entry}};
 const fn=new Function('view','LIVE','Auth','BE','CURRENT_STORE_ID','renderList','document',recipe.slice(a,b)+'\nreturn renderRecipeHub;')(
  view,true,{isLoggedIn:()=>false},{publicStoreRecipeList:()=>waiting},80,()=>{view.innerHTML='stale recipe'}, {getElementById:()=>({})});
 const pending=fn();view.innerHTML='selected login screen';
 if(fail)reject(Error('synthetic unavailable'));else resolve([]);
 await pending;assert.equal(body,'selected login screen');
});
