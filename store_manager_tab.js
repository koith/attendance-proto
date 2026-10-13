/* Delegated administrators for ALL store employee-management pages.
   Each call is authorized again by PostgreSQL / Edge, never by UI visibility. */
(function(){
"use strict";
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const request=async(fn,args)=>{
  if(!Auth.token)throw Error("로그인이 필요합니다.");
  const response=await fetch(CONFIG.SUPABASE_URL+"/rest/v1/rpc/"+fn,{
    method:"POST",headers:{apikey:CONFIG.SUPABASE_ANON_KEY,
      Authorization:"Bearer "+Auth.token,"Content-Type":"application/json"},
    body:JSON.stringify(args)
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw Error(data?.message||data?.error||fn+" 요청 실패");
  return data;
};
const invite=async(email,storeId)=>{
  if(!Auth.token)throw Error("로그인이 필요합니다.");
  const response=await fetch(CONFIG.SUPABASE_URL+"/functions/v1/server-sync-sheet",{
    method:"POST",headers:{Authorization:"Bearer "+Auth.token,"Content-Type":"application/json"},
    body:JSON.stringify({mode:"invite_store_delegated_manager",email,store_id:storeId})
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok||data?.ok!==true)throw Error(data?.error||"초대 발송 실패");
  return data;
};
window.mountStoreManagerTab=function(){
  const tabs=document.querySelector(".employee-tabs");
  const panel=document.querySelector(".employee-panel");
  if(!tabs||!panel||tabs.querySelector("#empTabManagers"))return;
  const storeId=Number(CURRENT_STORE_ID||1);
  if(!Number.isSafeInteger(storeId)||storeId<1)return;
  const list=document.getElementById("adEmps");
  const addEmployee=document.getElementById("adAdd");
  const listDisplay=list?.style.display||"";
  const tab=document.createElement("button");
  tab.type="button";tab.id="empTabManagers";tab.setAttribute("role","tab");
  tab.setAttribute("aria-selected","false");tab.textContent="관리자 관리";
  const mount=document.createElement("div");
  mount.id="storeManagerPanel";mount.hidden=true;
  mount.style.cssText="padding:14px 0;display:none";
  panel.appendChild(mount);
  tabs.appendChild(tab);
  // The employee tabs use a fixed two-column grid. Expand to three equal columns.
  tabs.style.gridTemplateColumns="repeat(3,minmax(0,1fr))";
  const employees=[...tabs.querySelectorAll("button:not(#empTabManagers)")];
  const showEmployees=()=>{
    mount.hidden=true;mount.style.display="none";
    if(list){list.hidden=false;list.style.display=listDisplay;}
    if(addEmployee)addEmployee.hidden=false;
    tab.classList.remove("on");tab.setAttribute("aria-selected","false");
  };
  employees.forEach(button=>button.addEventListener("click",showEmployees));
  const notify=(message,error=false)=>{
    if(typeof toast==="function")toast(error?"err":"in",error?"관리자 관리 오류":"관리자 관리",message);
    else if(error)alert(message);
  };
  let busy=false;
  const run=async(task)=>{
    if(busy)return;
    busy=true;
    mount.querySelectorAll("button").forEach(b=>b.disabled=true);
    try{await task();await refresh();}
    catch(e){notify(String(e?.message||e),true);await refresh().catch(()=>{});}
    finally{busy=false;}
  };
  async function refresh(){
    mount.textContent="관리자 계정을 불러오는 중…";
    try{
      const [rows,user]=await Promise.all([
        request("store_delegated_manager_list",{p_store_id:storeId}),
        Auth.getUser()
      ]);
      if(!Array.isArray(rows))throw Error("관리자 목록 응답 오류");
      const self=rows.find(entry=>entry.user_id===user?.id);
      const isPrimary=self?.manager_role==="OWNER";
      const names=rows.map(entry=>{
        const primary=entry.manager_role==="OWNER";
        const removable=isPrimary&&!primary&&entry.user_id!==user?.id;
        return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px;border:1px solid var(--border);border-radius:10px">'+
          '<div style="min-width:0;overflow-wrap:anywhere"><strong>'+esc(entry.email)+'</strong>'+
          '<div style="font-size:.8rem;color:var(--text-muted)">'+(primary?"대표 점주":"추가 관리자")+'</div></div>'+
          (removable?'<button class="btn btn-secondary btn-sm" type="button" data-manager-revoke="'+esc(entry.user_id)+'">권한 해제</button>':"")+
          '</div>';
      }).join("");
      mount.innerHTML='<p style="font-size:.82rem;color:var(--text-muted);line-height:1.5">'+
        '대표 점주만 추가 관리자를 초대·등록·해임할 수 있습니다. 대표 점주 지정과 교체는 본사에서 관리합니다.</p>'+
        '<div style="display:grid;gap:8px;margin:12px 0">'+
        (names||'<div class="empty">등록된 관리자 계정이 없습니다.</div>')+'</div>'+
        (isPrimary?'<form id="storeManagerExistingForm" style="display:grid;gap:7px;margin-top:15px">'+
          '<label for="storeManagerExistingEmail">기존 가입·인증 계정에 관리자 권한 부여</label>'+
          '<input id="storeManagerExistingEmail" type="email" class="form-control" autocomplete="off" required placeholder="manager@example.com">'+
          '<button type="submit" class="btn btn-secondary">기존 계정 연결</button></form>'+
          '<form id="storeManagerInviteForm" style="display:grid;gap:7px;margin-top:15px">'+
          '<label for="storeManagerInviteEmail">새 관리자 계정 이메일 초대</label>'+
          '<input id="storeManagerInviteEmail" type="email" class="form-control" autocomplete="off" required placeholder="manager@example.com">'+
          '<button type="submit" class="btn btn-primary">초대 이메일 발송</button>'+
          '<p style="font-size:.77rem;color:var(--text-muted)">초대받은 관리자는 이메일 인증을 완료한 뒤 로그인할 수 있습니다.</p></form>':
          '<p style="font-size:.8rem;color:var(--text-muted)">추가 관리자 임명·해임 권한은 대표 점주에게만 있습니다.</p>');
      mount.querySelector("#storeManagerExistingForm")?.addEventListener("submit",event=>{
        event.preventDefault();
        const email=mount.querySelector("#storeManagerExistingEmail").value.trim().toLowerCase();
        if(!confirm(email+" 계정에 이 지점의 관리자 권한을 부여하시겠습니까?"))return;
        run(async()=>{
          const result=await request("store_delegated_manager_change",{
            p_store_id:storeId,p_email:email,p_user_id:null,p_action:"ADD"
          });
          if(result?.ok!==true)throw Error("권한 부여 결과 확인 실패");
          notify("관리자 권한이 부여됐습니다.");
        });
      });
      mount.querySelector("#storeManagerInviteForm")?.addEventListener("submit",event=>{
        event.preventDefault();
        const email=mount.querySelector("#storeManagerInviteEmail").value.trim().toLowerCase();
        if(!confirm(email+" 주소로 이 지점 관리자 초대 메일을 보내시겠습니까?"))return;
        run(async()=>{await invite(email,storeId);notify("관리자 초대 메일을 발송했습니다.");});
      });
      mount.querySelectorAll("[data-manager-revoke]").forEach(button=>button.addEventListener("click",()=>{
        if(!confirm("이 관리자의 해당 지점 접근 권한을 해제하시겠습니까?"))return;
        run(async()=>{
          const result=await request("store_delegated_manager_change",{
            p_store_id:storeId,p_email:null,p_user_id:button.dataset.managerRevoke,p_action:"REVOKE"
          });
          if(result?.ok!==true)throw Error("권한 해제 결과 확인 실패");
          notify("관리자 권한을 해제했습니다.");
        });
      }));
    }catch(e){
      mount.textContent="관리자 계정 조회 실패: "+String(e?.message||e);
    }
  }
  tab.onclick=()=>{
    employees.forEach(b=>{b.classList.remove("on");b.setAttribute("aria-selected","false");});
    tab.classList.add("on");tab.setAttribute("aria-selected","true");
    if(list){list.hidden=true;list.style.display="none";}
    if(addEmployee)addEmployee.hidden=true;
    mount.hidden=false;mount.style.display="block";
    refresh();
  };
};
})();
