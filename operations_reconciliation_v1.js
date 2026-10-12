/* Store-scoped read-only import and transaction reconciliation review.
   No raw records, transactions, payroll, employee or inventory rows are changed. */
(function(){
"use strict";
const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
window.openStoreOperationsReconciliation=async function(){
 const from=document.getElementById("opsFrom")?.value;
 const to=document.getElementById("opsTo")?.value;
 if(!from||!to||to<from){alert("대사 조회 기간을 확인하세요.");return;}
 const trigger=document.getElementById("opsReconciliationOpen");
 if(trigger?.disabled)return;
 if(trigger)trigger.disabled=true;
 let issues;
 try{
  issues=await BE.storeReconciliationIssues(from,to);
  if(!Array.isArray(issues)||issues.length>2000)throw Error("RECONCILIATION_INVALID_RESPONSE");
 }catch(error){
  if(trigger)trigger.disabled=false;
  alert("대사 내역 조회 실패: "+error.message);
  return;
 }
 if(trigger)trigger.disabled=false;
 const modal=document.createElement("div");modal.className="ops-modal";
 const rows=issues.map(x=>'<tr><td>'+esc(x.business_date||"-")+'</td>'+
   '<td>'+esc(x.issue_type==="IMPORT_FAILED"?"수집 실패":x.issue_type==="RAW_NOT_CONFIRMED"?"미확정 원천":x.issue_type)+'</td>'+
   '<td>'+esc(x.left_source||"-")+'</td>'+
   '<td>'+esc(x.left_key||"-")+'</td>'+
   '<td>'+esc(x.status||"OPEN")+'</td></tr>').join("");
 modal.innerHTML='<div class="ops-modal-sheet" style="max-width:840px">'+
   '<div class="ops-modal-head"><b>미해결 대사 · '+esc(from)+' ~ '+esc(to)+'</b>'+
   '<button type="button" class="ops-modal-close" aria-label="닫기">×</button></div>'+
   '<div class="ops-modal-body" style="max-height:70vh;overflow:auto">'+
   '<div style="font-size:.84rem;margin-bottom:12px">정규화되지 않은 수집 원천과 실패한 업로드만 표시합니다. 다른 지점의 거래 내역은 포함하지 않으며 이 화면에서는 원본을 변경하지 않습니다.</div>'+
   '<div style="margin-bottom:8px">미해결 '+issues.length.toLocaleString("ko-KR")+
   '건'+(issues.length>=2000?' · 표시 상한 2,000건이므로 기간을 줄여 주세요.':'')+'</div>'+
   (issues.length?'<div class="ops-table-wrap"><table class="ops-table"><thead><tr><th>일자</th><th>사유</th><th>원천</th><th>기록키</th><th>상태</th></tr></thead><tbody>'+rows+'</tbody></table></div>':
      '<div class="ops-empty">해당 기간에 미해결 수집·정규화 문제가 없습니다.</div>')+
   '</div></div>';
 document.body.appendChild(modal);
 const close=()=>modal.remove();
 modal.querySelector(".ops-modal-close").onclick=close;
 modal.onclick=e=>{if(e.target===modal)close()};
};
})();
