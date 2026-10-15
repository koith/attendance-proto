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
  mount.innerHTML='<style>#storeManagerPanel .store-manager-section-body{padding:0 15px 14px;min-height:0}#storeManagerPanel .smt-who{padding:12px 2px;font-size:.8rem;color:var(--text-muted)}#storeManagerPanel .smt-table{border:1px solid var(--border);border-radius:11px;overflow:hidden}#storeManagerPanel .smt-columns,#storeManagerPanel .smt-summary{display:grid;grid-template-columns:minmax(0,1fr) 65px 12px;gap:9px;align-items:center}#storeManagerPanel .smt-columns{padding:9px 12px;background:var(--surface-muted);font-size:.75rem;color:var(--text-muted);border-bottom:1px solid var(--border)}#storeManagerPanel .smt-entry:not(:last-child){border-bottom:1px solid var(--border)}#storeManagerPanel .smt-summary{min-height:58px;padding:10px 12px;list-style:none;cursor:pointer}#storeManagerPanel .smt-summary::-webkit-details-marker{display:none}#storeManagerPanel .smt-summary:focus-visible,#storeManagerPanel .smt-add summary:focus-visible{outline:2px solid var(--brand-700);outline-offset:-2px}#storeManagerPanel .smt-name{font-size:.86rem;font-weight:650;overflow-wrap:anywhere}#storeManagerPanel .smt-name.muted{font-weight:500;color:var(--text-muted)}#storeManagerPanel .smt-role{text-align:right;font-size:.77rem;color:var(--text-muted);white-space:nowrap}#storeManagerPanel .smt-arrow{color:var(--text-muted);font-size:1.2rem;line-height:1;transition:transform .12s ease}#storeManagerPanel .smt-entry[open] .smt-arrow{transform:rotate(90deg)}#storeManagerPanel .smt-detail{padding:12px;border-top:1px solid var(--border);background:var(--surface-muted);font-size:.81rem;line-height:1.55;color:var(--text-muted)}#storeManagerPanel .smt-permissions{display:gri      const owner=rows.find(entry=>entry.manager_role==="OWNER");
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
);margin-top:5px">대표 점주'+(owner.user_id===user?.id?" · 나":"")+'</div></div><span style="border-radius:999px;background:var(--brand-050);color:var(--brand-700);padding:5px 10px;height:max-content;font-size:.75rem;white-space:nowrap">대표</span></article>':
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
