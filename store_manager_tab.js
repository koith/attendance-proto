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
  mount.innerHTML='<style>#storeManagerPanel .store-manager-section-body{min-height:0;padding:0 14px 12px}#storeManagerPanel .smt-who{padding:12px 2px;font-size:.8rem;color:var(--text-muted)}#storeManagerPanel .smt-table{border:1px solid var(--border);border-radius:12px;overflow:hidden}#storeManagerPanel .smt-columns,#storeManagerPanel .smt-summary{display:grid;grid-template-columns:minmax(0,1fr) 62px 14px;gap:7px;align-items:center}#storeManagerPanel .smt-columns{padding:9px 12px;background:var(--surface-muted);color:var(--text-muted);font-size:.75rem;border-bottom:1px solid var(--border)}#storeManagerPanel .smt-entry:not(:last-child){border-bottom:1px solid var(--border)}#storeManagerPanel .smt-summary{padding:10px 12px;min-height:58px;list-style:none;cursor:pointer}#storeManagerPanel .smt-summary::-webkit-details-marker{display:none}#storeManagerPanel .smt-summary:focus-visible,#storeManagerPanel .smt-add summary:focus-visible{outline:2px solid var(--brand-700);outline-offset:-2px}#storeManagerPanel .smt-name{font-weight:650;font-size:.85rem;overflow-wrap:anywhere}#storeManagerPanel .smt-name.muted{font-weight:500;color:var(--text-muted)}#storeManagerPanel .smt-role{text-align:right;color:var(--text-muted);font-size:.77rem}#storeManagerPanel .smt-arrow{font-size:1.18rem;color:var(--text-muted)}#storeManagerPanel .smt-entry[open] .smt-arrow{transform:rotate(90deg)}#storeManagerPanel .smt-detail{padding:12px;background:var(--surface-muted);border-top:1px solid var(--border);color:var(--text-muted);font-size:.82rem;line-height:1.55}#storeManagerPanel .smt-permissions{display:grid;gap:10px;color:var(--text)}#storeManagerPanel .smt-permissions label{display:flex;gap:8px;align-items:center}#storeManagerPanel .smt-permissions input{width:18px;height:18px;flex:none}#storeManagerPanel .smt-add{border:1px solid var(--border);border-radius:12px;margin-top:12px}#storeManagerPanel .smt-add>summary{list-style:none;cursor:pointer;padding:12px;color:var(--brand-700);font-weight:650}#storeManagerPanel .smt-add>summary::-webkit-details-marker{display:none}#storeManagerPanel .smt-add-body{padding:12px;border-top:1px solid var(--border);display:grid;gap:14px}#storeManagerPanel .smt-add-body form{display:grid;gap:7px}#storeManagerPanel .smt-small{font-size:.77rem;color:var(--text-muted);margin:0}@media(max-width:430px){#storeManagerPanel .smt-columns,#storeManagerPanel .smt-summary{grid-template-columns:minmax(0,1fr) 54px 12px}#storeManagerPanel .smt-name{font-size:.81rem}}</style>'+
    '<div class="store-manager-section-head"><h3>관리자 관리</h3>'+
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
      const currentRole=isHq===true?"본사 관리자":isPrimary?"대표 점주":self?"보조 관리자":"관리자 권한 없음";
      // Square/Shopify pattern: compact user/role roster; select a person for their details.
      const roleSummary='<div class="smt-who">내 계정 · '+esc(currentRole)+'</div>';
      const ownerRow='<details class="smt-entry" data-manager-kind="owner">'+
        '<summary class="smt-summary"><span class="smt-name'+(owner?'':' muted')+'">'+(owner?esc(owner.email)+(owner.user_id===user?.id?" · 나":""):"대표 점주 미지정")+'</span>'+
        '<span class="smt-role">대표</span><span class="smt-arrow" aria-hidden="true">›</span></summary>'+
        '<div class="smt-detail">'+(owner?"매장 대표 관리자입니다. 대표 점주 지정·교체는 본사 대시보드에서만 가능합니다.":"대표 점주가 지정되면 이곳에 계정이 표시됩니다. 지정은 본사 대시보드에서 합니다.")+'</div></details>';
      const delegateRows=delegates.map(entry=>{
        const editable=canManage&&entry.user_id!==user?.id;
        const rights=managerPermissions.find(p=>p.user_id===entry.user_id)||{staff_edit:false,attendance_approve:false,payroll_view:false};
        const checks=editable?
          '<div data-manager-rights="'+esc(entry.user_id)+'" class="smt-permissions">'+
          '<div style="font-weight:650">허용 업무</div>'+
          '<label><input data-allow="staff" type="checkbox" '+(rights.staff_edit?'checked':'')+'> 직원 기본정보 수정</label>'+
          '<label><input data-allow="attendance" type="checkbox" '+(rights.attendance_approve?'checked':'')+'> 근태 정정 승인</label>'+
          '<label><input data-allow="payroll" type="checkbox" '+(rights.payroll_view?'checked':'')+'> 확정 급여 열람</label>'+
          '<p class="smt-small">세 항목을 모두 체크해도 전체 관리자 권한이나 본사 권한은 부여되지 않습니다.</p>'+
          '<button type="button" class="btn btn-secondary btn-sm" data-permission-save="'+esc(entry.user_id)+'">권한 변경 저장</button>'+
          '<button type="button" class="btn btn-secondary btn-sm" data-manager-revoke="'+esc(entry.user_id)+'">이 지점 관리자 해임</button></div>':
          '보조 관리자의 업무 권한은 대표 점주가 설정합니다.';
        return '<details class="smt-entry" data-manager-kind="delegate">'+
          '<summary class="smt-summary"><span class="smt-name">'+esc(entry.email)+(entry.user_id===user?.id?" · 나":"")+'</span>'+
          '<span class="smt-role">보조</span><span class="smt-arrow" aria-hidden="true">›</span></summary>'+
          '<div class="smt-detail">'+checks+'</div></details>';
      }).join("");
      content.innerHTML=roleSummary+
        '<div class="smt-table" role="group" aria-label="매장 관리자 목록">'+
        '<div class="smt-columns"><span>계정</span><span style="text-align:right">역할</span><span></span></div>'+
        ownerRow+delegateRows+'</div>'+
        (isPrimary?'<details class="smt-add"><summary>+ 보조 관리자 추가</summary><div class="smt-add-body">'+
          '<form id="storeManagerExistingForm"><label for="storeManagerExistingEmail">기존 가입 계정 연결</label>'+
          '<input id="storeManagerExistingEmail" type="email" class="form-control" autocomplete="off" required placeholder="manager@example.com">'+
          '<button type="submit" class="btn btn-secondary">기존 계정 연결</button></form>'+
          '<form id="storeManagerInviteForm"><label for="storeManagerInviteEmail">새 관리자 이메일 초대</label>'+
          '<input id="storeManagerInviteEmail" type="email" class="form-control" autocomplete="off" required placeholder="manager@example.com">'+
          '<button type="submit" class="btn btn-primary">초대 이메일 발송</button>'+
          '<p class="smt-small">초대받은 관리자는 이메일 인증 후 로그인할 수 있습니다.</p></form></div></details>':'');
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
