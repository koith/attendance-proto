// Synthetic UI interaction QA: no live accounts, email, or operational writes.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ui=fs.readFileSync("store_manager_tab.js","utf8");
const settle=()=>new Promise(resolve=>setTimeout(resolve,15));

class Control {
  constructor(){this.listeners={};this.disabled=false;this.dataset={};this.value="";this.checked=false;}
  addEventListener(kind,fn){this.listeners[kind]=fn;}
  trigger(kind,event={}){assert.equal(typeof this.listeners[kind],"function","missing "+kind+" handler");this.listeners[kind](event);}
  querySelector(){return null;}
}
class Content extends Control {
  set innerHTML(html){
    this._html=html;
    this.controls=new Map();
    this.save=[];this.revoke=[];this.buttons=[];this.sections=new Map();
    if(html.includes('id="storeManagerExistingForm"')){
      for(const id of ["storeManagerExistingForm","storeManagerExistingEmail","storeManagerInviteForm","storeManagerInviteEmail"]){
        this.controls.set("#"+id,new Control());
      }
      this.buttons.push(new Control(),new Control());
    }
    for(const match of html.matchAll(/data-manager-rights="([^"]+)"/g)){
      const uid=match[1];
      const section=new Control();
      section.checks={staff:new Control(),attendance:new Control(),payroll:new Control()};
      section.checks.staff.checked=html.includes('data-allow="staff" type="checkbox" checked');
      section.querySelector=selector=>{
        const key=selector.match(/data-allow="([^"]+)"/)?.[1];
        return section.checks[key]||null;
      };
      const button=new Control();
      button.dataset.permissionSave=uid;
      button.closest=selector=>selector==="[data-manager-rights]"?section:null;
      this.save.push(button);this.buttons.push(button);
      this.sections.set(uid,section);
    }
    for(const match of html.matchAll(/data-manager-revoke="([^"]+)"/g)){
      const button=new Control();button.dataset.managerRevoke=match[1];
      this.revoke.push(button);this.buttons.push(button);
    }
  }
  get innerHTML(){return this._html||"";}
  querySelector(selector){return this.controls?.get(selector)||null;}
  querySelectorAll(selector){
    if(selector==="[data-permission-save]")return this.save;
    if(selector==="[data-manager-revoke]")return this.revoke;
    return [];
  }
}
class Mount extends Control {
  setAttribute(){}
  set innerHTML(value){this._html=value;this.content=new Content();this.reload=new Control();}
  get innerHTML(){return this._html||"";}
  querySelector(selector){
    if(selector==="#storeManagerContent")return this.content;
    if(selector==="#storeManagerReload")return this.reload;
    return null;
  }
  querySelectorAll(selector){
    return selector==="button"?[this.reload,...this.content.buttons]:[];
  }
}
async function scenario(role){
  let members=[
    {user_id:"owner-id",email:"owner@synthetic.invalid",manager_role:"OWNER"},
    {user_id:"delegate-id",email:"delegate@synthetic.invalid",manager_role:"MANAGER"}
  ];
  const rights=new Map([["delegate-id",{staff_edit:false,attendance_approve:false,payroll_view:false}]]);
  const calls=[],notices=[],confirmations=[];
  let failNextPermission=false;
  const mount=new Mount();
  const panel={insertAdjacentElement:(position,element)=>{assert.equal(position,"afterend");assert.equal(element,mount);}};
  const tabs={};
  const document={
    querySelector:selector=>selector===".employee-tabs"?tabs:selector===".employee-panel"?panel:null,
    getElementById:()=>null,
    createElement:()=>mount
  };
  const id=role==="HQ"?"hq-id":role==="OWNER"?"owner-id":"delegate-id";
  const response=(value,ok=true)=>({ok,json:async()=>value});
  const context={
    document,CURRENT_STORE_ID:2,
    CONFIG:{SUPABASE_URL:"https://synthetic.invalid",SUPABASE_ANON_KEY:"fixture"},
    Auth:{token:"fixture",getUser:async()=>({id})},
    fetch:async(url,opts)=>{
      const data=JSON.parse(opts.body);const fn=url.split("/").pop();
      calls.push({fn,data});
      if(fn==="store_delegated_manager_list")return response(members);
      if(fn==="store_manager_invitation_states")return response(members.map(m=>({user_id:m.user_id,email:m.email,intended_role:m.manager_role==="OWNER"?"OWNER":"ASSISTANT",account_state:m.user_id==="invited-id"?"PENDING":"ACTIVE"})));
      if(fn==="is_hq_admin")return response(role==="HQ");
      if(fn==="store_delegated_permissions_list")return response(
        [...rights.entries()].map(([user_id,p])=>({user_id,...p})));
      if(fn==="store_delegated_manager_change"){
        if(data.p_action==="ADD"){
          members.push({user_id:"linked-id",email:data.p_email,manager_role:"MANAGER"});
          rights.set("linked-id",{staff_edit:false,attendance_approve:false,payroll_view:false});
        }
        if(data.p_action==="REVOKE")members=members.filter(x=>x.user_id!==data.p_user_id);
        return response({ok:true});
      }
      if(fn==="store_delegated_permissions_set"){
        if(failNextPermission){failNextPermission=false;return response({message:"SYNTHETIC_WRITE_FAILED"},false);}
        rights.set(data.p_user_id,{staff_edit:data.p_staff_edit,
          attendance_approve:data.p_attendance_approve,payroll_view:data.p_payroll_view});
        return response({ok:true});
      }
      if(fn==="server-sync-sheet"){
        assert.equal(data.mode,"invite_store_delegated_manager");
        members.push({user_id:"invited-id",email:data.email,manager_role:"MANAGER"});
        rights.set("invited-id",{staff_edit:false,attendance_approve:false,payroll_view:false});
        return response({ok:true});
      }
      throw Error("unexpected backend function "+fn);
    },
    toast:(kind,title,message)=>{notices.push({kind,title,message});},
    alert:message=>{notices.push({kind:"alert",message});},
    confirm:message=>{confirmations.push(message);return true}
  };
  context.window=context;
  vm.runInNewContext(ui,context,{filename:"store_manager_tab.js"});
  context.mountStoreManagerTab();
  await settle();
  const content=mount.content;
  assert.match(content.innerHTML,/smt-roster/);
  assert.match(content.innerHTML,/smt-owner/);
  assert.match(content.innerHTML,/smt-delegates/);
  assert.match(content.innerHTML,/owner@synthetic.invalid/);
  assert.match(content.innerHTML,/delegate@synthetic.invalid/);
  if(role!=="OWNER"){
    assert.equal(content.querySelector("#storeManagerExistingForm"),null,"only owner can link managers");
    assert.equal(content.querySelector("#storeManagerInviteForm"),null,"only owner can invite");
    assert.equal(content.save.length,0,"non-owner cannot modify permissions");
    assert.equal(content.revoke.length,0,"non-owner cannot revoke");
    return;
  }

  // Owner links an existing confirmed manager in their own store.
  content.querySelector("#storeManagerExistingEmail").value="linked@synthetic.invalid";
  content.querySelector("#storeManagerExistingForm").trigger("submit",{preventDefault(){}});
  await settle();
  assert.ok(calls.some(c=>c.fn==="store_delegated_manager_change"&&
    c.data.p_action==="ADD"&&c.data.p_store_id===2&&c.data.p_email==="linked@synthetic.invalid"));
  assert.equal(mount.reload.disabled,false,"reload must recover after successful link");
  assert.match(content.innerHTML,/linked@synthetic.invalid/,"roster refresh after link");

  // Owner invites a new manager through Edge, never via the HQ invitation mode.
  content.querySelector("#storeManagerInviteEmail").value="invited@synthetic.invalid";
  content.querySelector("#storeManagerInviteForm").trigger("submit",{preventDefault(){}});
  await settle();
  assert.ok(calls.some(c=>c.fn==="server-sync-sheet"&&
    c.data.mode==="invite_store_delegated_manager"&&c.data.store_id===2));
  assert.equal(mount.reload.disabled,false,"reload must recover after invite");

  // Owner grants just staff edit, then all three scoped capabilities.
  let save=content.save.find(button=>button.dataset.permissionSave==="delegate-id");
  assert.ok(save,"editable delegate must have save control");
  content.sections.get("delegate-id").checks.staff.checked=true;
  content.sections.get("delegate-id").checks.attendance.checked=false;
  content.sections.get("delegate-id").checks.payroll.checked=false;
  save.trigger("click");
  await settle();
  assert.ok(calls.some(c=>c.fn==="store_delegated_permissions_set"&&c.data.p_user_id==="delegate-id"&&
    c.data.p_staff_edit===true&&c.data.p_attendance_approve===false&&c.data.p_payroll_view===false));
  assert.equal(mount.reload.disabled,false,"reload must recover after permission save");

  // Permission update rejection must not leave the controls permanently disabled.
  failNextPermission=true;
  save=content.save.find(button=>button.dataset.permissionSave==="delegate-id");
  save.trigger("click");
  await settle();
  assert.ok(notices.some(n=>n.kind==="err"&&String(n.message).includes("SYNTHETIC_WRITE_FAILED")));
  assert.equal(mount.reload.disabled,false,"reload must recover after rejected permission change");
  const beforeReload=calls.filter(c=>c.fn==="store_delegated_manager_list").length;
  mount.reload.trigger("click");
  await settle();
  assert.ok(calls.filter(c=>c.fn==="store_delegated_manager_list").length>beforeReload,
    "manual reload must work after an error");

  // Owner revokes only the selected delegated member, never the owner.
  const revoke=content.revoke.find(button=>button.dataset.managerRevoke==="delegate-id");
  assert.ok(revoke);
  revoke.trigger("click");
  await settle();
  assert.ok(calls.some(c=>c.fn==="store_delegated_manager_change"&&
    c.data.p_action==="REVOKE"&&c.data.p_user_id==="delegate-id"&&c.data.p_store_id===2));
  assert.ok(!content.innerHTML.includes("delegate@synthetic.invalid"));
  assert.ok(content.innerHTML.includes("owner@synthetic.invalid"));
  assert.equal(mount.reload.disabled,false,"reload must recover after revoke");
  assert.ok(confirmations.length>=5,"sensitive mutations require user confirmation");
  assert.ok(notices.some(n=>n.kind==="in"),"successful mutations must provide feedback");
}
for(const role of ["OWNER","HQ","MANAGER"])await scenario(role);
console.log("PASS: owner link/invite/set/revoke, failure recovery, reload controls, HQ/delegate read-only");
