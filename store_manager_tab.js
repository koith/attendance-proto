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
  if(!tabs||!panel||document.getElementById("storeManagerPanel"))return;
  const storeId=Number(CURRENT_STORE_ID||1);
  if(!Number.isSafeInteger(storeId)||storeId<1)return;
  const mount=document.createElement("section");
  mount.id="storeManagerPanel";mount.className="store-manager-section";
  mount.setAttribute("aria-label","지점 관리자 관리");
  mount.innerHTML='<div class="store-manager-section-head"><div><h3>관리자 관리</h3>'+
    '<p>대표 점주 및 추가 관리자 계정</p></div>'+
    '<button type="button" class="btn btn-secondary" id="storeManagerReload">새로고침</button></div>'+
    '<div id="storeManagerContent" class="store-manager-section-body" aria-live="polite">관리자 정보를 불러오는 중…</div>';
  panel.insertAdjacentElement("afterend",mount);
  const content=mount.querySelector("#storeManagerContent");
  mount.querySelector("#storeManagerReload").addEventListener("click",()=>refresh());
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
    content.textContent="관리자 계정을 불러오는 중…";
    try{
      const [rows,user,isHq]=await Promise.all([
        request("store_delegated_manager_list",{p_store_id:storeId}),
        Auth.getUser(),
        request("is_hq_admin",{}).catch(()=>false)
      ]);
      if(!Array.isArray(rows))throw Error("관리자 목록 응답 오류");
      const self=rows.find(entry=>entry.user_id===user?.id);
      const isPrimary=self?.manager_role==="OWNER";
      const canManage=isPrimary||isHq===true;
      const names=rows.map(entry=>{
        const primary=entry.manager_role==="OWNER";
        const removable=canManage&&!primary&&entry.user_id!==user?.id;
        return '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;padding:11px;border:1px solid var(--border);border-radius:10px">'+
          '<div style="min-width:0;overflow-wrap:anywhere"><strong>'+esc(entry.email)+'</strong>'+
          '<div style="font-size:.8rem;color:var(--text-muted)">'+(primary?"대표 점주":"추가 관리자")+'</div></div>'+
          (removable?'<button class="btn btn-secondary btn-sm" type="button" data-manager-revoke="'+esc(entry.user_id)+'">권한 해제</button>':"")+
          '</div>';
      }).join("");
      content.innerHTML='<p style="font-size:.82rem;color:var(--text-muted);line-height:1.5">'+
        '대표 점주와 본사는 추가 관리자를 등록·해임할 수 있습니다. 대표 점주 지정과 교체는 본사에서 관리합니다.</p>'+
        '<div style="display:grid;gap:8px;margin:12px 0">'+
        (names||'<div class="store-manager-empty"><strong>등록된 관리자 계정이 없습니다.</strong><p>본사에서 점주를 초대하고 대표 점주로 지정하면 추가 관리자 관리가 활성화됩니다.</p></div>')+'</div>'+
        (canManage?'<form id="storeManagerExistingForm" style="display:grid;gap:7px;margin-top:15px">'+
          '<label for="storeManagerExistingEmail">기존 가입·인증 계정에 관리자 권한 부여</label>'+
          '<input id="storeManagerExistingEmail" type="email" class="form-control" autocomplete="off" required placeholder="manager@example.com">'+
          '<button type="submit" class="btn btn-secondary">기존 계정 연결</button></form>'+
          '<form id="storeManagerInviteForm" style="display:grid;gap:7px;margin-top:15px">'+
          '<label for="storeManagerInviteEmail">새 관리자 계정 이메일 초대</label>'+
          '<input id="storeManagerInviteEmail" type="email" class="form-control" autocomplete="off" required placeholder="manager@example.com">'+
          '<button type="submit" class="btn btn-primary">초대 이메일 발송</button>'+
          '<p style="font-size:.77rem;color:var(--text-muted)">초대받은 관리자는 이메일 인증을 완료한 뒤 로그인할 수 있습니다.</p></form>':
          '<p style="font-size:.8rem;color:var(--text-muted)">추가 관리자 등록·해임은 대표 점주에게만 허용됩니다.</p>')+
        (isHq===true?'<form id="storeManagerHqInviteForm" style="display:grid;gap:7px;margin-top:15px">'+
          '<label for="storeManagerHqEmail">본사: 신규 점주 초대</label>'+
          '<input id="storeManagerHqEmail" type="email" class="form-control" required placeholder="owner@example.com">'+
          '<button class="btn btn-primary" type="submit">점주 초대 발송</button>'+
          '<p style="font-size:.78rem;color:var(--text-muted)">초대 후 전국 지점 관리에서 대표 점주로 지정하세요.</p></form>':'');
      content.querySelector("#storeManagerHqInviteForm")?.addEventListener("submit",event=>{
        event.preventDefault();
        const email=content.querySelector("#storeManagerHqEmail").value.trim().toLowerCase();
        if(!confirm(email+" 주소로 점주 초대장을 보내시겠습니까?"))return;
        run(async()=>{
          const response=await fetch(CONFIG.SUPABASE_URL+"/functions/v1/server-sync-sheet",{
            method:"POST",headers:{Authorization:"Bearer "+Auth.token,"Content-Type":"application/json"},
            body:JSON.stringify({mode:"invite_store_manager",email,store_id:storeId})
          });
          const data=await response.json().catch(()=>null);
          if(!response.ok||data?.ok!==true)throw Error(data?.error||"점주 초대 실패");
          notify("점주 초대 메일을 발송했습니다. 본사에서 대표 점주를 지정하세요.");
        });
      });
      content.querySelector("#storeManagerExistingForm")?.addEventListener("submit",event=>{
        event.preventDefault();
        const email=content.querySelector("#storeManagerExistingEmail").value.trim().toLowerCase();
        if(!confirm(email+" 계정에 이 지점의 관리자 권한을 부여하시겠습니까?"))return;
        run(async()=>{
          const result=await request("store_delegated_manager_change",{
            p_store_id:storeId,p_email:email,p_user_id:null,p_action:"ADD"
          });
          if(result?.ok!==true)throw Error("권한 부여 결과 확인 실패");
          notify("관리자 권한이 부여됐습니다.");
        });
      });
      content.querySelector("#storeManagerInviteForm")?.addEventListener("submit",event=>{
        event.preventDefault();
        const email=content.querySelector("#storeManagerInviteEmail").value.trim().toLowerCase();
        if(!confirm(email+" 주소로 이 지점 관리자 초대 메일을 보내시겠습니까?"))return;
        run(async()=>{await invite(email,storeId);notify("관리자 초대 메일을 발송했습니다.");});
      });
      content.querySelectorAll("[data-manager-revoke]").forEach(button=>button.addEventListener("click",()=>{
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
      content.textContent="관리자 계정 조회 실패: "+String(e?.message||e);
    }
  }
  refresh();
};
})();
