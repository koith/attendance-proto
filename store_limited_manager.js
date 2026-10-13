/* Restricted store-manager portal: no legacy administrative RPC calls.
   Server authorization is enforced again for every operation. */
(function(){"use strict";
const e=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const rpc=async(fn,body)=>{
  if(!Auth.token)throw Error("로그인이 필요합니다.");
  const r=await fetch(CONFIG.SUPABASE_URL+"/rest/v1/rpc/"+fn,{
    method:"POST",headers:{apikey:CONFIG.SUPABASE_ANON_KEY,Authorization:"Bearer "+Auth.token,"Content-Type":"application/json"},
    body:JSON.stringify(body||{})});
  const d=await r.json().catch(()=>null);
  if(!r.ok)throw Error(d?.message||d?.error||fn+" 요청 실패");
  return d;
};
const notify=(s,bad=false)=>{const box=document.getElementById("limitedManagerNotice");if(box){box.textContent=s;box.style.color=bad?"var(--warn)":"var(--text-muted)";}};
window.mountScopedManagerPortal=async function(scope,storeId){
  const target=document.getElementById("view");
  if(!target)return;
  if(!Number.isSafeInteger(storeId)||storeId<1){target.textContent="매장 권한을 확인할 수 없습니다.";return;}
  target.innerHTML='<section class="store-manager-limited">'+
    '<div class="page-title-row"><h2 class="page-title">보조 관리자 업무</h2><button type="button" id="limitedManagerLogout" class="btn btn-secondary">로그아웃</button></div>'+
    '<p class="muted" style="margin-bottom:12px">대표 점주가 허용한 업무만 사용할 수 있습니다. 권한 변경은 대표 점주에게 문의하세요.</p>'+
    '<div id="limitedManagerNotice" role="status" aria-live="polite"></div>'+
    (scope.staff_edit?'<section class="store-manager-section"><div class="store-manager-section-head"><h3>직원 기본정보 수정</h3></div><div class="store-manager-section-body" id="limitedStaff">직원 정보를 불러오는 중…</div></section>':'')+
    (scope.attendance_approve?'<section class="store-manager-section"><div class="store-manager-section-head"><h3>근태 정정 승인</h3></div><div class="store-manager-section-body" id="limitedRequests">요청을 불러오는 중…</div></section>':'')+
    (scope.payroll_view?'<section class="store-manager-section"><div class="store-manager-section-head"><h3>확정 급여 열람</h3></div><div class="store-manager-section-body"><label for="limitedPayrollMonth">조회 월</label> <input id="limitedPayrollMonth" type="month" class="form-control" style="max-width:220px"><button class="btn btn-secondary" type="button" id="limitedPayrollLoad">조회</button><div id="limitedPayrollRows" style="margin-top:12px">월을 선택하세요.</div></div></section>':'')+
    (!scope.staff_edit&&!scope.attendance_approve&&!scope.payroll_view?'<p class="empty">부여된 업무 권한이 없습니다.</p>':'')+'</section>';
  document.getElementById("limitedManagerLogout").onclick=()=>{Auth.clear();location.reload()};
  const current=()=>document.getElementById("view")===target&&target.querySelector(".store-manager-limited");
  async function staff(){
    const holder=document.getElementById("limitedStaff");if(!holder)return;
    try{
      const items=await rpc("store_limited_employee_list",{p_store_id:storeId});if(!current()||!Array.isArray(items))return;
      holder.innerHTML=items.length?items.map(item=>'<form class="limited-staff-form" data-employee-id="'+e(item.id)+'" style="padding:12px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px">'+
        '<label>이름 <input type="text" name="name" class="form-control" maxlength="80" required value="'+e(item.name)+'"></label>'+
        '<label>메모 <input type="text" name="memo" class="form-control" maxlength="500" value="'+e(item.memo)+'"></label>'+
        '<div style="margin-top:6px;display:flex;justify-content:space-between"><small>'+e(item.employee_no)+' · '+(item.is_active?"재직":"퇴직")+'</small><button type="submit" class="btn btn-secondary">수정 저장</button></div></form>').join(""):'<p>표시할 직원이 없습니다.</p>';
      holder.querySelectorAll("form").forEach(form=>form.onsubmit=async event=>{
        event.preventDefault();const b=form.querySelector("button");b.disabled=true;
        try{await rpc("store_limited_employee_update",{p_store_id:storeId,p_employee_id:Number(form.dataset.employeeId),p_name:form.elements.name.value,p_memo:form.elements.memo.value});notify("직원 기본정보를 수정했습니다.");}
        catch(err){notify(String(err.message||err),true)}finally{b.disabled=false}
      });
    }catch(err){holder.textContent="직원 조회 실패: "+String(err.message||err)}
  }
  async function attendance(){
    const holder=document.getElementById("limitedRequests");if(!holder)return;
    try{
      const items=await rpc("store_limited_pending_requests",{p_store_id:storeId});if(!current()||!Array.isArray(items))return;
      holder.innerHTML=items.length?items.map(item=>'<div class="limited-request" data-request-id="'+e(item.id)+'" style="padding:12px;border:1px solid var(--border);border-radius:10px;margin-bottom:8px">'+
        '<strong>'+e(item.employee_name)+'</strong> · '+e(item.kind)+'<p>'+e(item.note)+'</p>'+
        '<input class="form-control" data-reason placeholder="반려할 경우 사유 입력">'+
        '<div style="display:flex;gap:8px;margin-top:8px"><button type="button" class="btn btn-primary" data-decision="approve">승인</button><button type="button" class="btn btn-secondary" data-decision="reject">반려</button></div></div>').join(""):'<p>대기 중인 정정요청이 없습니다.</p>';
      holder.querySelectorAll("[data-decision]").forEach(button=>button.onclick=async()=>{
        const card=button.closest(".limited-request"),approve=button.dataset.decision==="approve",reason=card.querySelector("[data-reason]").value.trim();
        if(!approve&&reason.length<3){notify("반려 사유는 3자 이상 입력하세요.",true);return;}
        if(!confirm(approve?"요청을 승인하시겠습니까?":"요청을 반려하시겠습니까?"))return;
        card.querySelectorAll("button").forEach(x=>x.disabled=true);
        try{await rpc("store_limited_correction_decide",{p_store_id:storeId,p_request_id:Number(card.dataset.requestId),p_approve:approve,p_reject_reason:reason});notify("근태 정정요청을 처리했습니다.");await attendance();}
        catch(err){notify(String(err.message||err),true);card.querySelectorAll("button").forEach(x=>x.disabled=false);}
      });
    }catch(err){holder.textContent="근태 요청 조회 실패: "+String(err.message||err)}
  }
  async function payroll(){
    const holder=document.getElementById("limitedPayrollRows");if(!holder)return;
    const ym=document.getElementById("limitedPayrollMonth").value;
    if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(ym)){notify("월을 선택하세요.",true);return;}
    holder.textContent="확정 급여를 조회하는 중…";
    try{
      const items=await rpc("store_limited_payroll_read",{p_store_id:storeId,p_ym:ym});if(!current()||!Array.isArray(items))return;
      holder.innerHTML=items.length?'<div style="display:grid;gap:8px">'+items.map(item=>'<div style="padding:12px;border:1px solid var(--border);border-radius:10px"><strong>'+e(item.employee_name)+'</strong><div>세전 '+Number(item.gross_pay||0).toLocaleString()+'원 · 세후 '+Number(item.net_pay||0).toLocaleString()+'원</div></div>').join("")+'</div>':'<p>확정된 급여 자료가 없습니다. 미마감 월은 조회되지 않습니다.</p>';
    }catch(err){holder.textContent="급여 조회 실패: "+String(err.message||err)}
  }
  if(scope.payroll_view){document.getElementById("limitedPayrollMonth").value=new Date().toLocaleDateString("sv-SE",{timeZone:"Asia/Seoul"}).slice(0,7);document.getElementById("limitedPayrollLoad").onclick=payroll;}
  if(scope.staff_edit)void staff();
  if(scope.attendance_approve)void attendance();
};
})();