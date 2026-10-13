import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
const read=p=>fs.readFileSync(p,"utf8");
const app=read("index.html");
const ui=read("store_manager_tab.js");
const hq=read("hq_store_onboarding_ui.js");
const sql=read("supabase/migrations/20261013212000_store_primary_owner_delegation.sql");
const edge=read("supabase/functions/server-sync-sheet/index.ts");
const mirror=read("edge-release/supabase/functions/server-sync-sheet/index.ts");

assert.equal(edge,mirror,"deployed Edge source must match canonical source byte for byte");
assert.match(app,/APP_VERSION="v0\.251"/);
assert.match(app,/mountStoreManagerTab\(\)/);
assert.match(app,/store_manager_tab\.js\?v=20261013v251qa/);
assert.match(app,/hq_store_onboarding_ui\.js\?v=20261013v251/);
assert.match(app,/id="empTabActive"/);
assert.match(app,/id="empTabRetired"/);
assert.match(app,/id="adEmps"/);
assert.match(app,/id="adAdd"/);
assert.match(ui,/id="storeManagerPanel"/);
assert.match(ui,/store_delegated_manager_list/);
assert.match(ui,/store_delegated_manager_change/);
assert.match(ui,/invite_store_delegated_manager/);
assert.match(ui,/CURRENT_STORE_ID/);
assert.match(ui,/storeId=Number\(CURRENT_STORE_ID\|\|1\)/);
assert.doesNotMatch(ui,/===1\s*\?\s*true|storeId===1/,"no single-store tab whitelist");
assert.match(ui,/employeeList|listDisplay/);
assert.match(hq,/hq_store_primary_owner_set/);
assert.match(hq,/hq_store_primary_owner_list/);
assert.match(hq,/data-primary-assign/);
assert.match(sql,/REFERENCES public\.admin_users\(user_id\) ON DELETE RESTRICT/);
assert.match(sql,/store_primary_owner_can_delegate/);
assert.match(sql,/SERVICE_ONLY/);
assert.match(sql,/ACCOUNT_ALREADY_ASSIGNED/);
assert.match(sql,/CANNOT_REVOKE_OWNER_OR_SELF/);
assert.match(edge,/mode==="invite_store_delegated_manager"/);
assert.match(edge,/store_primary_owner_can_delegate/);
assert.match(edge,/service_store_delegated_manager_attach_invited_user/);
assert.match(edge,/actor\.adminRole!=="HQ"/,"existing HQ invitation remains protected");
const preflight=edge.indexOf('client.rpc("store_primary_owner_can_delegate"');
const emailSend=edge.indexOf('client.auth.admin.inviteUserByEmail(email,{',preflight);
assert.ok(preflight>0&&emailSend>preflight,"owner authorization must precede sending email");

class Node {
  constructor(){this.style={display:""};this.hidden=false;this.listeners={};this.children=[];this.ids={};
    this.classList={add:()=>{},remove:()=>{}};this.attributes={};this.dataset={};}
  setAttribute(k,v){this.attributes[k]=v;}
  getAttribute(k){return this.attributes[k];}
  appendChild(el){this.children.push(el);if(el.id)this.ids[el.id]=el;}
  addEventListener(k,fn){this.listeners[k]=fn;}
  querySelector(q){return this.ids[q.replace("#","")]||null;}
  querySelectorAll(){return [];}
  set innerHTML(v){this._innerHTML=v;}
  get innerHTML(){return this._innerHTML||"";}
}
async function simulateStore(storeId){
 const tabs=new Node(),panel=new Node(),staffList=new Node(),addButton=new Node(),active=new Node(),retired=new Node();
 tabs.querySelector=q=>q==="#empTabManagers"?tabs.children.find(x=>x.id==="empTabManagers")||null:null;
 tabs.querySelectorAll=q=>q==="button:not(#empTabManagers)"?[active,retired]:[];
 const fetchCalls=[];
 const document={
  querySelector:q=>q===".employee-tabs"?tabs:q===".employee-panel"?panel:null,
  getElementById:q=>q==="adEmps"?staffList:q==="adAdd"?addButton:null,
  createElement:()=>new Node()
 };
 const context={document,CURRENT_STORE_ID:storeId,
  CONFIG:{SUPABASE_URL:"https://unit.invalid",SUPABASE_ANON_KEY:"synthetic"},
  Auth:{token:"synthetic-token",getUser:async()=>({id:"primary-id"})},
  fetch:async(url,opts)=>{fetchCalls.push(JSON.parse(opts.body));return {
   ok:true,json:async()=>[{user_id:"primary-id",email:"primary@synthetic.invalid",manager_role:"OWNER"},
   {user_id:"delegated-id",email:"delegate@synthetic.invalid",manager_role:"MANAGER"}]};},
  toast:()=>{},alert:()=>{},confirm:()=>true
 };
 context.window=context;
 vm.runInNewContext(ui,context,{filename:"store_manager_tab.js"});
 context.window.mountStoreManagerTab();
 const tab=tabs.children.find(x=>x.id==="empTabManagers");
 assert.ok(tab,"manager tab missing");
 assert.equal(tab.textContent,"관리자 관리");
 assert.equal(panel.children.length,1);
 tab.onclick();
 assert.equal(staffList.hidden,true);
 assert.equal(staffList.style.display,"none");
 assert.equal(addButton.hidden,true);
 assert.equal(panel.children[0].hidden,false);
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(fetchCalls[0].p_store_id,storeId);
 assert.match(panel.children[0].innerHTML,/storeManagerExistingForm/);
 assert.match(panel.children[0].innerHTML,/storeManagerInviteForm/);
 active.listeners.click();
 assert.equal(staffList.hidden,false,"employee list must be restored");
 assert.equal(staffList.style.display,"","employee list CSS must be restored");
 assert.equal(addButton.hidden,false);
 assert.equal(panel.children[0].hidden,true);
}
for(const id of [1,2,283])await simulateStore(id);
console.log("PASS: manager tab on stores 1/2/283, old employee tabs preserved; mirrored secured Edge invites; primary role controls");
