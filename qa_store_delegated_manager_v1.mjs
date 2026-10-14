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
assert.match(app,/APP_VERSION="v0\.\d+"/);
assert.match(app,/mountStoreManagerTab\(\)/);
assert.match(app,/store_manager_tab\.js\?v=20261014v256/);
assert.match(app,/hq_store_onboarding_ui\.js\?v=20261013v251/);
assert.match(app,/id="empTabActive"/);
assert.match(app,/id="empTabRetired"/);
assert.match(app,/id="adEmps"/);
assert.match(app,/id="adAdd"/);
assert.match(ui,/id="storeManagerPanel"/);
assert.match(ui,/store_delegated_manager_list/);
assert.match(ui,/store_delegated_manager_change/);
assert.match(ui,/store_delegated_permissions_set/);
assert.match(ui,/store_delegated_permissions_list/);
assert.match(app,/store_limited_manager\.js\?v=20261014v254/);
assert.match(ui,/invite_store_delegated_manager/);
assert.match(ui,/CURRENT_STORE_ID/);
assert.match(ui,/storeId=Number\(CURRENT_STORE_ID\|\|1\)/);
assert.doesNotMatch(ui,/===1\s*\?\s*true|storeId===1/,"no single-store tab whitelist");
assert.match(ui,/insertAdjacentElement\("afterend",mount\)/);
assert.match(app,/\.store-manager-section\{/);
assert.doesNotMatch(ui,/empTabManagers/);
assert.doesNotMatch(ui,/storeManagerHqInviteForm|invite_store_manager/,"HQ invitations must not be present on store manager screen");
assert.match(ui,/본사 대시보드/);
assert.match(ui,/const canManage=isPrimary/);
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
 constructor(){this.style={};this.hidden=false;this.listeners={};this.children=[];this.ids={};this.attributes={};this.dataset={};this.textContent="";this.value="";}
 setAttribute(k,v){this.attributes[k]=v;}
 appendChild(n){this.children.push(n);if(n.id)this.ids[n.id]=n;}
 insertAdjacentElement(pos,n){this.adjacent=n;}
 addEventListener(k,fn){this.listeners[k]=fn;}
 querySelector(q){if(q==="#storeManagerContent")return this.content;if(q==="#storeManagerReload")return this.reload;return null;}
 querySelectorAll(){return [];}
 set innerHTML(v){this._html=v;this.content=this.content||new Node();this.reload=this.reload||new Node();}
 get innerHTML(){return this._html||"";}
}
async function simulateStore(storeId,role){
 const tabs=new Node(),panel=new Node(),staffList=new Node(),addButton=new Node();
 const calls=[];
 const document={querySelector:q=>q===".employee-tabs"?tabs:q===".employee-panel"?panel:null,
 getElementById:q=>q==="adEmps"?staffList:q==="adAdd"?addButton:null,createElement:()=>new Node()};
 const context={document,CURRENT_STORE_ID:storeId,CONFIG:{SUPABASE_URL:"https://unit.invalid",SUPABASE_ANON_KEY:"synthetic"},
 Auth:{token:"synthetic",getUser:async()=>({id:"primary-id"})},
 fetch:async(url,options)=>{
 const data=JSON.parse(options.body);calls.push({url,data});
 const result=url.endsWith("is_hq_admin")?role==="HQ":
 [{user_id:"primary-id",email:"primary@synthetic.invalid",manager_role:role==="OWNER"?"OWNER":"MANAGER"}];
 return {ok:true,json:async()=>result};},toast:()=>{},alert:()=>{},confirm:()=>true};
 context.window=context;
 vm.runInNewContext(ui,context,{filename:"store_manager_tab.js"});
 context.mountStoreManagerTab();
 assert.equal(tabs.children.length,0,"employment status tabs must remain exactly two");
 assert.ok(panel.adjacent,"manager section should be after employee panel");
 assert.equal(panel.adjacent.id,"storeManagerPanel");
 assert.equal(staffList.hidden,false,"employee roster must remain visible");
 assert.equal(addButton.hidden,false,"employee add must remain visible");
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.ok(calls.some(x=>x.url.endsWith("store_delegated_manager_list")&&x.data.p_store_id===storeId));
 const html=panel.adjacent.content.innerHTML;
 if(role==="OWNER")assert.match(html,/storeManagerInviteForm/);
 if(role==="HQ"){
   assert.doesNotMatch(html,/storeManagerHqInviteForm|storeManagerExistingForm|storeManagerInviteForm|data-manager-revoke/);
   assert.match(html,/본사 대시보드/);
 }
 if(role==="MANAGER")assert.doesNotMatch(html,/storeManagerInviteForm|storeManagerExistingForm|data-manager-revoke/);
}
for(const id of [1,2,283])for(const role of ["OWNER","HQ","MANAGER"])await simulateStore(id,role);
console.log("PASS: HQ owner invite separated, owner-only delegation at stores 1/2/283, employee roster preserved");
