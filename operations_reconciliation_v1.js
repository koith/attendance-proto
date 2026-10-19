/* Store-scoped read-only import and transaction reconciliation review.
   No raw records, transactions, payroll, employee or inventory rows are changed. */
(function(){
"use strict";
const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
function parseCrossSourceSuspects(rows){
 if(!Array.isArray(rows)||rows.length>100)throw Error("SUSPECTS_INVALID_RESPONSE");
 return rows.map(x=>{
  const pos=Number(x.pos_transaction_id),delivery=Number(x.delivery_transaction_id),
   amount=Number(x.total_amount),gap=Number(x.gap_seconds);
  if(!Number.isSafeInteger(pos)||pos<=0||!Number.isSafeInteger(delivery)||delivery<=0||
    pos===delivery||!Number.isSafeInteger(amount)||amount<=0||
    !Number.isSafeInteger(gap)||gap<0||gap>300||
    !/^\d{4}-\d{2}-\d{2}$/.test(String(x.business_date||""))||
    !["BAEMIN","COUPANG_EATS","COUPANGEATS"].includes(x.delivery_source))
   throw Error("SUSPECTS_INVALID_ROW");
  return {pos,delivery,amount,gap,date:x.business_date,source:x.delivery_source,
   posKey:String(x.pos_key||""),deliveryKey:String(x.delivery_key||"")};
 });
}
window.openStoreOperationsReconciliation=async function(){
 const from=document.getElementById("opsFrom")?.value;
 const to=document.getElementById("opsTo")?.value;
 if(!from||!to||to<from){alert("대사 조회 기간을 확인하세요.");return;}
 const trigger=document.getElementById("opsReconciliationOpen");
 const requestedStore=String(typeof CURRENT_STORE_ID==="undefined"?"":CURRENT_STORE_ID);
 const sameContext=()=>String(typeof CURRENT_STORE_ID==="undefined"?"":CURRENT_STORE_ID)===requestedStore &&
  document.getElementById("opsFrom")?.value===from &&
  document.getElementById("opsTo")?.value===to &&
  document.getElementById("opsReconciliationOpen")===trigger;
 if(trigger?.disabled)return;
 if(trigger)trigger.disabled=true;
 try{
 let issues;
 try{
  issues=await BE.storeReconciliationIssues(from,to);
  if(!sameContext())return;
  if(!Array.isArray(issues)||issues.length>2000)throw Error("RECONCILIATION_INVALID_RESPONSE");
 }catch(error){
  if(!sameContext())return;

  alert("대사 내역 조회 실패: "+error.message);
  return;
 }

 let suspects=[],suspectError="";
 try{ suspects=parseCrossSourceSuspects(await BE.storeCrossSourceSuspects(from,to)); }
 catch(e){ suspectError=String(e.message||e); }
 if(!sameContext())return;
 const modal=document.createElement("div");modal.className="ops-modal";
 const rows=issues.map(x=>'<tr><td>'+esc(x.business_date||"-")+'</td>'+
   '<td>'+esc(x.issue_type==="IMPORT_FAILED"?"수집 실패":x.issue_type==="RAW_NOT_CONFIRMED"?"미확정 원천":x.issue_type)+'</td>'+
   '<td>'+esc(x.left_source||"-")+'</td>'+
   '<td>'+esc(x.left_key||"-")+'</td>'+
   '<td>'+esc(x.status||"OPEN")+'</td></tr>').join("");
 const suspectRows=suspects.map(x=>
   '<tr><td>'+esc(x.date)+'</td><td>'+esc(x.source)+'</td>'+
   '<td>'+esc(x.posKey)+'</td><td>'+esc(x.deliveryKey)+'</td>'+
   '<td>'+x.amount.toLocaleString("ko-KR")+'원</td><td>'+x.gap+'초</td></tr>').join("");
  modal.innerHTML='<div class="ops-modal-sheet" style="max-width:840px">'+
   '<div class="ops-modal-head"><b>미해결 대사 · '+esc(from)+' ~ '+esc(to)+'</b>'+
   '<button type="button" class="ops-modal-close" aria-label="닫기">×</button></div>'+
   '<div class="ops-modal-body" style="max-height:70vh;overflow:auto">'+
   '<div style="font-size:.84rem;margin-bottom:12px">첫 표는 미확정 원천/실패한 업로드, 두 번째는 금액·시각이 겹치는 POS/배달 실거래 의심 후보입니다. <b>후보는 확정 중복이 아니며 자동 차감·삭제하지 않습니다.</b> 지점 원본을 변경하지 않습니다.</div>'+
   '<div style="margin-bottom:8px">미해결 '+issues.length.toLocaleString("ko-KR")+
   '건'+(issues.length>=2000?' · 표시 상한 2,000건이므로 기간을 줄여 주세요.':'')+'</div>'+
   (issues.length?'<div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>일자</th><th>사유</th><th>원천</th><th>기록키</th><th>상태</th></tr></thead><tbody>'+rows+'</tbody></table></div>':
      '<div class="ops-empty">해당 기간에 미해결 수집·정규화 문제가 없습니다.</div>')+
   '<h3 style="margin:20px 0 8px">POS·배달 교차 원천 중복 의심 후보</h3>'+
   '<p class="ops-note">서로 다른 원천에서 같은 지점·날짜·금액에 5분 이내 발생한 확정 실매출을 점검 후보로만 표시합니다. 같은 가격의 정상 주문일 수도 있으므로 판매량/합계를 자동 조정하지 않습니다.</p>'+
   (suspectError?'<p class="ops-note">중복 의심 조회 실패 · 원본 유지: '+esc(suspectError)+'</p>':
     suspects.length?'<div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>일자</th><th>배달원천</th><th>POS 키</th><th>배달 키</th><th>총액</th><th>시각차</th></tr></thead><tbody>'+suspectRows+'</tbody></table></div>':
     '<div class="ops-empty">의심 후보 없음 · 중복이 전혀 없다는 뜻은 아닙니다.</div>')+
   '</div></div>';
 if(!sameContext())return;
 document.body.appendChild(modal);
 const close=()=>modal.remove();
 modal.querySelector(".ops-modal-close").onclick=close;
 modal.onclick=e=>{if(e.target===modal)close()};
 }finally{
  // Release the original mounted control after both lookups and all error paths.
  if(trigger&&document.getElementById("opsReconciliationOpen")===trigger)trigger.disabled=false;
 }
};
})();
