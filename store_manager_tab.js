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
  mount.innerHTML='<style>#storeManagerPanel .store-manager-section-body{min-height:0;padding:0 14px 14px}#storeManagerPanel .smt-who{font-size:.78rem;color:var(--text-muted);padding:10px 2px 13px}#storeManagerPanel .smt-roster{display:grid;gap:8px}#storeManagerPanel .smt-member{border:1px solid var(--border);border-radius:12px;background:var(--surface);overflow:hidden}#storeManagerPanel .smt-member[open]{border-color:var(--brand-700)}#storeManagerPanel .smt-member>summary{list-style:none;display:flex;align-items:center;gap:11px;min-height:62px;padding:11px 12px;cursor:pointer}#storeManagerPanel .smt-member>summary::-webkit-details-marker{display:none}#storeManagerPanel .smt-member>summary:focus-visible,#storeManagerPanel .smt-add>summary:focus-visible{outline:2px solid var(--brand-700);outline-offset:-2px}#storeManagerPanel .smt-avatar{width:37px;height:37px;flex:none;display:grid;place-items:center;border-radius:11px;background:var(--surface-muted);font-size:1.15rem}#storeManagerPanel .smt-owner .smt-avatar{background:#fff5d9}#storeManagerPanel .smt-person{min-width:0;flex:1;display:grid;gap:3px}#storeManagerPanel .smt-person strong{font-size:.85rem;overflow-wrap:anywhere}#storeManagerPanel .smt-person small{font-size:.74rem;color:var(--text-muted)}#storeManagerPanel .smt-role{border:1px solid var(--border);border-radius:999px;padding:3px 9px;font-size:.72rem;white-space:nowrap;color:var(--text-muted)}#storeManagerPanel .smt-owner .smt-role{background:#fff5d9;color:#74531c;border-color:#e9d29a}#storeManagerPanel .smt-arrow{color:var(--text-muted);font-size:1.15rem}#storeManagerPanel .smt-member[open] .smt-arrow{transform:rotate(90deg)}#storeManagerPanel .smt-delegates{border-left:2px solid var(--border);margin-left:18px;padding-left:12px;display:grid;gap:8px}#storeManagerPanel .smt-delegate>summary{min-height:57px}#storeManagerPanel .smt-detail{padding:12px;border-top:1px solid var(--border);font-size:.82rem;line-height:1.5;color:var(--text-muted);background:var(--surface-muted)}#storeManagerPanel .smt-permissions{display:grid;gap:10px;color:var(--text)}#storeManagerPanel .smt-permissions label{display:flex;gap:8px;align-items:center}#storeManagerPanel .smt-permissions label input{flex:none;width:18px;height:18px}#storeManagerPanel .smt-add{margin-top:12px;border:1px solid var(--border);border-radius:11px}#storeManagerPanel .smt-add>summary{list-style:none;cursor:pointer;padding:12px;color:var(--brand-700);font-weight:650}#storeManagerPanel .smt-add>summary::-webkit-details-marker{display:none}#storeManagerPanel .smt-add-body{padding:12px;border-top:1px solid var(--border);display:grid;gap:14px}#storeManagerPanel .smt-add-body form{display:grid;gap:7px}#storeManagerPanel .smt-small{font-size:.77rem;color:var(--text-muted);margin:0}@media(max-width:430px){#storeManagerPanel .store-manager-section-body{padding:0 11px 12px}#storeManagerPanel .smt-member>summary{gap:8px;padding:9px}#storeManagerPanel .smt-person strong{font-size:.8rem}#storeManagerPanel .smt-role{padding:3px 7px}}</style>'+
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
      // Guilded/Discord-style roster: the owner leads; delegates nest below.
      // The HQ role is only the viewing context, not a member of this store hierarchy.
      const roleSummary='<div class="smt-who">현재 접속 · '+esc(currentRole)+'</div>';
      const ownerRow='<details class="smt-member smt-owner" data-manager-kind="owner">'+
        '<summary><span class="smt-avatar" aria-hidden="true">♛</span>'+
        '<span class="smt-person"><strong>'+(owner?esc(owner.email)+(owner.user_id===user?.id?" · 나":""):"대표 관리자 미지정")+'</strong>'+
        '<small>대표 관리자 · 지점 최고 관리자</small></span>'+
        '<span class="smt-role">대표</span><span class="smt-arrow" aria-hidden="true">›</span></summary>'+
        '<div class="smt-detail">'+(owner?"대표 관리자 지정·교체는 본사 대시보드에서만 가능합니다.":"대표 관리자가 아직 지정되지 않았습니다. 지정은 본사 대시보드에서 합니다.")+'</div></details>';
      const delegateRows=delegates.map(entry=>{
        const editable=canManage&&entry.user_id!==user?.id;
        const rights=managerPermissions.find(p=>p.user_id===entry.user_id)||{staff_edit:false,attendance_approve:false,payroll_view:false};
        const checks=editable?
          '<div data-manager-rights="'+esc(entry.user_id)+'" class="smt-permissions">'+
          '<strong>허용 업무</strong>'+
          '<label><input data-allow="staff" type="checkbox" '+(rights.staff_edit?'checked':'')+'> 직원 기본정보 수정</label>'+
          '<label><input data-allow="attendance" type="checkbox" '+(rights.attendance_approve?'checked':'')+'> 근태 정정 승인</label>'+
          '<label><input data-allow="payroll" type="checkbox" '+(rights.payroll_view?'checked':'')+'> 확정 급여 열람</label>'+
          '<p class="smt-small">세 항목을 모두 체크해도 전체 관리자 권한이나 본사 권한은 부여되지 않습니다.</p>'+
          '<button type="button" class="btn btn-secondary btn-sm" data-permission-save="'+esc(entry.user_id)+'">권한 변경 저장</button>'+
          '<button type="button" class="btn btn-secondary btn-sm" data-manager-revoke="'+esc(entry.user_id)+'">이 지점 관리자 해임</button></div>':
          '보조 관리자의 허용 업무는 대표 관리자가 설정합니다.';
        return '<details class="smt-member smt-delegate" data-manager-kind="delegate">'+
          '<summary><span class="smt-avatar" aria-hidden="true">♙</span>'+
          '<span class="smt-person"><strong>'+esc(entry.email)+(entry.user_id===user?.id?" · 나":"")+'</strong>'+
          '<small>보조 관리자</small></span><span class="smt-role">보조</span>'+
          '<span class="smt-arrow" aria-hidden="true">›</span></summary>'+
          '<div class="smt-detail">'+checks+'</div></details>';
      }).join("");
      content.innerHTML=roleSummary+
        '<div class="smt-roster" role="group" aria-label="지점 관리자 멤버 목록">'+
        ownerRow+'<div class="smt-delegates">'+delegateRows+'</div></div>'+
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
