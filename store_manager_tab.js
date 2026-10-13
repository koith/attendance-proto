/* Isolated store manager tab. Existing employee listing and handlers are left untouched. */
(function(){
"use strict";
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function rpc(fn,args){
 if(!Auth.token)throw Error("로그인이 필요합니다.");
 const r=await fetch(CONFIG.SUPABASE_URL+"/rest/v1/rpc/"+fn,{method:"POST",
 headers:{apikey:CONFIG.SUPABASE_ANON_KEY,Authorization:"Bearer "+Auth.token,"Content-Type":"application/json"},
 body:JSON.stringify(args)});
 const data=await r.json().catch(()=>null);
 if(!r.ok)throw Error(data?.message||fn+" 요청 실패");
 return data;
}
window.mountStoreManagerTab=async function(){
 const tabs=document.querySelector(".employee-tabs"),panel=document.querySelector(".employee-panel");
 if(!tabs||!panel||tabs.querySelector("#empTabManagers"))return;
 const storeId=Number(CURRENT_STORE_ID||1);
 if(!Number.isSafeInteger(storeId)||storeId<1)return;
 const tab=document.createElement("button");
 tab.type="button";tab.id="empTabManagers";tab.setAttribute("role","tab");
 tab.setAttribute("aria-selected","false");tab.textContent="관리자 관리";
 const mount=document.createElement("div");mount.id="storeManagerPanel";mount.hidden=true;
 mount.style.cssText="padding:14px 0";
 panel.appendChild(mount);tabs.appendChild(tab);
 const oldTabs=[...tabs.querySelectorAll("button:not(#empTabManagers)")];
 const employeeList=document.getElementById("adEmps");
 oldTabs.forEach(b=>b.addEventListener("click",()=>{mount.hidden=true;if(employeeList)employeeList.hidden=false;tab.classList.remove("on");tab.setAttribute("aria-selected","false");}));
 async function refresh(){
  mount.textContent="관리자 계정을 불러오는 중…";
  try{
   const rows=await rpc("store_delegated_manager_list",{p_store_id:storeId});
   const user=await Auth.getUser();
   const me=rows.find(x=>x.user_id===user?.id);
   const owner=me?.manager_role==="OWNER";
   mount.innerHTML='<p style="font-size:.82rem;color:var(--text-muted)">대표 점주는 추가 관리자 계정을 연결하거나 해임할 수 있습니다. 대표 점주 지정·교체는 본사에서만 가능합니다.</p>'+
    '<div style="display:grid;gap:8px;margin:12px 0">'+rows.map(x=>
     '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid var(--border);border-radius:10px;padding:10px">'+
     '<div><strong>'+esc(x.email)+'</strong><div style="font-size:.76rem;color:var(--text-muted)">'+(x.manager_role==="OWNER"?"대표 점주":"추가 관리자")+'</div></div>'+
     (owner&&x.manager_role!=="OWNER"&&x.user_id!==user?.id?'<button type="button" class="btn btn-secondary btn-sm" data-revoke="'+esc(x.user_id)+'">해임</button>':"")+'</div>').join("")+'</div>'+
    (owner?'<form id="storeManagerAdd"><label for="storeManagerEmail">추가 관리자 이메일 (가입 및 이메일 인증 완료 계정)</label><input id="storeManagerEmail" type="email" class="form-control" required autocomplete="off" placeholder="manager@example.com"><button class="btn btn-primary" style="margin-top:9px" type="submit">관리자 권한 부여</button></form>':
    '<p style="font-size:.8rem;color:var(--text-muted)">추가 관리자 등록·해임은 대표 점주만 가능합니다.</p>');
   mount.querySelector("#storeManagerAdd")?.addEventListener("submit",async e=>{
    e.preventDefault();const email=mount.querySelector("#storeManagerEmail").value.trim();
    try{await rpc("store_delegated_manager_change",{p_store_id:storeId,p_email:email,p_user_id:null,p_action:"ADD"});await refresh();}
    catch(error){alert("관리자 등록 실패: "+error.message);}
   });
   mount.querySelectorAll("[data-revoke]").forEach(b=>b.addEventListener("click",async()=>{
    if(!confirm("이 관리자의 지점 접근 권한을 해임하시겠습니까?"))return;
    try{await rpc("store_delegated_manager_change",{p_store_id:storeId,p_email:null,p_user_id:b.dataset.revoke,p_action:"REVOKE"});await refresh();}
    catch(error){alert("관리자 해임 실패: "+error.message);}
   }));
  }catch(error){mount.textContent="관리자 계정 조회 실패: "+error.message;}
 }
 tab.onclick=()=>{oldTabs.forEach(b=>{b.classList.remove("on");b.setAttribute("aria-selected","false");});
  tab.classList.add("on");tab.setAttribute("aria-selected","true");
  if(employeeList)employeeList.hidden=true;mount.hidden=false;refresh();};
};
})();
