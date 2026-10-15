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
      const canManage=isPrimary; // HQ appoints owners exclusively from the nationwide HQ dashboard.
      const managerPermissions=isPrimary?await request("store_delegated_permissions_list",{p_store_id:storeId}):[];
      const owner=rows.find(entry=>entry.manager_role==="OWNER");
      const delegates=rows.filter(entry=>entry.manager_role!=="OWNER");
      const currentRole=isHq===true?"본사 관리자":isPrimary?"대표 점주":self?"보조 관리자":"조회 권한";
      const rightsLabel=entry=>{
        const rights=managerPermissions.find(p=>p.user_id===entry.user_id);
        if(!rights)return "권한 정보는 대표 점주가 확인할 수 있습니다.";
        return ["직원 정보 수정","근태 정정 승인","확정 급여 열람"].filter((_,i)=>[rights.staff_edit,rights.attendance_approve,rights.payroll_view][i]).join(" · ")||"허용된 업무 없음";
      };
      const delegateCards=delegates.map(entry=>{
        const removable=canManage&&entry.user_id!==user?.id;
        const rights=managerPermissions.find(p=>p.user_id===entry.user_id)||{staff_edit:false,attendance_approve:false,payroll_view:false};
        return '<article class="store-manager-person" style="border:1px solid var(--border);border-radius:12px;padding:13px;display:grid;gap:9px">'+
          '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px"><div style="min-width:0"><strong style="overflow-wrap:anywhere">'+esc(entry.email)+'</strong><div style="font-size:.8rem;color:var(--text-muted);margin-top:4px">보조 관리자'+(entry.user_id===user?.id?" · 나":"")+'</div></div><span style="border:1px solid var(--border);border-radius:999px;padding:4px 9px;font-size:.75rem;white-space:nowrap">보조</span></div>'+
          '<div style="font-size:.8rem;color:var(--text-muted)">사용 가능한 업무: '+esc(rightsLabel(entry))+'</div>'+
          (removable?'<details style="border-top:1px solid var(--border);padding-top:10px"><summary style="cursor:pointer;font-weight:600;color:var(--brand-700)">권한 및 계정 관리</summary>'+
          '<div data-manager-rights="'+esc(entry.user_id)+'" style="display:grid;gap:10px;margin-top:12px">'+
          '<label><input data-allow="staff" type="checkbox" '+(rights.staff_edit?'checked':'')+'> 직원 기본정보 수정</label>'+
          '<label><input data-allow="attendance" type="checkbox" '+(rights.attendance_approve?'checked':'')+'> 근태 정정 승인</label>'+
          '<label><input data-allow="payroll" type="checkbox" '+(rights.payroll_view?'checked':'')+'> 확정 급여 열람</label>'+
          '<button type="button" class="btn btn-secondary btn-sm" data-permission-save="'+esc(entry.user_id)+'">권한 변경 저장</button>'+
          '<button type="button" class="btn btn-secondary btn-sm" data-manager-revoke="'+esc(entry.user_id)+'">이 지점 관리자 해임</button></div></details>':'')+
          '</article>';
      }).join("");
      const ownerCard=owner?'<article class="store-manager-person" style="border:1px solid var(--border);border-radius:12px;padding:13px;display:flex;justify-content:space-between;gap:10px"><div style="min-width:0"><strong style="overflow-wrap:anywhere">'+esc(owner.email)+'</strong><div style="font-size:.8rem;color:var(--text-muted);margin-top:5px">대표 점주'+(owner.user_id===user?.id?" · 나":"")+'</div></div><span style="border-radius:999px;background:var(--brand-050);color:var(--brand-700);padding:5px 10px;height:max-content;font-size:.75rem;white-space:nowrap">대표</span></article>':
        '<div class="store-manager-empty"><strong>대표 점주가 아직 지정되지 않았습니다.</strong><p>본사 대시보드에서 대표 점주를 지정할 수 있습니다.</p></div>';
      content.innerHTML=
        '<section style="border:1px solid var(--border);border-radius:12px;padding:14px;background:var(--surface-muted);margin-bottom:16px">'+
        '<div style="font-size:.8rem;color:var(--text-muted)">현재 내 권한</div><strong style="display:block;font-size:1.06rem;margin:5px 0">'+esc(currentRole)+'</strong>'+
        '<div style="font-size:.82rem;line-height:1.6">'+(isPrimary?"직원·근태·급여를 관리하고 보조 관리자를 초대하거나 해임할 수 있습니다.":isHq===true?"본사 관리자는 전국 지점 운영에서 대표 점주를 지정·교체합니다.":self?"대표 점주가 허용한 업무만 이용할 수 있습니다.":"이 지점의 관리자 권한이 확인되지 않았습니다.")+'</div></section>'+
        '<section style="margin-bottom:18px"><h4 style="margin:0 0 9px">대표 점주</h4>'+ownerCard+
        '<p style="font-size:.78rem;color:var(--text-muted);margin:9px 0 0">대표 점주 지정·교체는 본사 대시보드에서만 가능합니다.</p></section>'+
        '<section><div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:9px"><h4 style="margin:0">보조 관리자</h4><span style="font-size:.8rem;color:var(--text-muted)">'+delegates.length+'명</span></div>'+
        '<div style="display:grid;gap:9px">'+(delegateCards||'<div class="store-manager-empty">등록된 보조 관리자가 없습니다.</div>')+'</div></section>'+
        (isPrimary?'<details style="margin-top:18px;border:1px solid var(--border);border-radius:12px;padding:13px"><summary style="cursor:pointer;font-weight:600">+ 보조 관리자 추가</summary><div style="margin-top:13px;display:grid;gap:12px">'+
          '<form id="storeManagerExistingForm" style="display:grid;gap:7px"><label for="storeManagerExistingEmail">이미 가입한 계정 연결</label><input id="storeManagerExistingEmail" type="email" class="form-control" autocomplete="off" required placeholder="manager@example.com"><button type="submit" class="btn btn-secondary">기존 계정 연결</button></form>'+
          '<form id="storeManagerInviteForm" style="display:grid;gap:7px"><label for="storeManagerInviteEmail">새 계정 이메일 초대</label><input id="storeManagerInviteEmail" type="email" class="form-control" autocomplete="off" required placeholder="manager@example.com"><button type="submit" class="btn btn-primary">초대 이메일 발송</button><p style="font-size:.77rem;color:var(--text-muted)">초대받은 관리자는 이메일 인증 후 로그인할 수 있습니다.</p></form></div></details>':'')+
        (isHq===true?'<p class="store-manager-hq-note" style="margin-top:14px">본사 관리자: 대표 점주 초대·지정·교체는 <strong>본사 대시보드 → 전국 지점 운영</strong>에서 처리합니다.</p>':'');
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
      content.querySelectorAll("[data-permission-save]").forEach(button=>button.addEventListener("click",()=>{
        const id=button.dataset.permissionSave,section=button.closest("[data-manager-rights]");
        if(!section)return;
        const staff=section.querySelector('[data-allow="staff"]').checked;
        const attendance=section.querySelector('[data-allow="attendance"]').checked;
        const payroll=section.querySelector('[data-allow="payroll"]').checked;
        if(!confirm("이 관리자의 허용 업무를 변경하시겠습니까? 권한 제한은 즉시 반영됩니다."))return;
        run(async()=>{
          const result=await request("store_delegated_permissions_set",{
            p_store_id:storeId,p_user_id:id,p_staff_edit:staff,p_attendance_approve:attendance,p_payroll_view:payroll
          });
          if(result?.ok!==true)throw Error("권한 변경 결과 확인 실패");
          notify("보조 관리자 권한이 변경됐습니다.");
        });
      }));
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
