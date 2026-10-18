/* #1076 / MTG-14: read-only, branch-scoped aging review; never claim expired. */
(function(){
"use strict";
const esc=x=>String(x??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const number=x=>Number(x).toLocaleString("ko-KR",{maximumFractionDigits:3});
function ageReviewRows(data){
 if(!Array.isArray(data)||data.length>200)throw Error("AGE_REVIEW_INVALID_RESPONSE");
 return data.map(x=>{
  // Missing stock measurements MUST NOT be coerced to a valid zero.
  // Number(null) and Number(" ") both equal zero, concealing bad RPC rows.
  const numeric=v=>(typeof v==="number"&&Number.isFinite(v))||
    (typeof v==="string"&&v.trim()!==""&&Number.isFinite(Number(v)));
  if(!x||typeof x!=="object"||
     ![x.item_id,x.days_since_receipt,x.on_hand].every(numeric))
   throw Error("AGE_REVIEW_INVALID_ROW");
  const id=Number(x.item_id),days=Number(x.days_since_receipt),balance=Number(x.on_hand);
  if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(days)||days<0||
     !Number.isFinite(balance)||balance<=0||!/^\d{4}-\d{2}-\d{2}$/.test(x.last_receipt_on||""))
   throw Error("AGE_REVIEW_INVALID_ROW");
  return {id,days,balance,unit:String(x.unit||""),name:String(x.item_name||""),
   receipt:String(x.last_receipt_on),usage:x.last_usage_on?String(x.last_usage_on):null};
 });
}
// Show verified ledger alerts automatically when managers open the inventory screen.
// Cached briefly to avoid one RPC for every search keystroke; an empty ledger is NOT
// evidence of safe physical expiry dates.
let ageReviewCache={store:null,expiresAt:0,rows:null,pending:null};
async function cachedAgeReview(store){
 const now=Date.now();
 if(ageReviewCache.store===store&&ageReviewCache.rows&&now<ageReviewCache.expiresAt)
  return ageReviewCache.rows;
 if(ageReviewCache.store===store&&ageReviewCache.pending)return ageReviewCache.pending;
 const pending=BE.inventoryAgeReview(60).then(ageReviewRows);
 ageReviewCache={store,expiresAt:0,rows:null,pending};
 try{
  const rows=await pending;
  ageReviewCache={store,expiresAt:Date.now()+60000,rows,pending:null};
  return rows;
 }catch(error){
  if(ageReviewCache.store===store)ageReviewCache={store:null,expiresAt:0,rows:null,pending:null};
  throw error;
 }
}
window.refreshStoreInventoryAgeAlert=async function(){
 const display=document.getElementById("opsInventoryAgeAlert");
 if(!display)return;
 const scope=Number(CURRENT_STORE_ID)||1;
 display.textContent="장기 체류 재고 점검 중…";
 try{
  const rows=await cachedAgeReview(scope);
  if(!display.isConnected)return;
  display.textContent=rows.length?
   "장기 체류 가능 재고 "+rows.length+"개 · 입고/사용 이력 현장 점검 권장 (소비기한 확정 아님)":
   "장기 체류 점검 대상 없음 · 입고 이력 누락 시 판정 불가";
 }catch(error){
  if(display.isConnected)display.textContent="장기 체류 점검 자료 확인 실패 · 안전 판정 불가";
 }
};
window.openStoreInventoryAgeReview=async function(){
 const modal=document.createElement("div");
 modal.className="ops-modal";
 modal.innerHTML='<div class="ops-modal-sheet ops-unified-sheet" style="max-width:720px">'+
 '<div class="ops-modal-head"><b>장기 체류 가능 재고 점검</b><button type="button" class="ops-modal-close" aria-label="닫기">×</button></div>'+
 '<div class="ops-modal-body" style="display:grid;gap:12px">'+
 '<p>실제 입고·사용 이력과 장부 잔량을 기준으로 확인이 필요한 품목을 찾습니다. <b>실물 소비기한 만료를 의미하지 않습니다.</b> 제조·개봉·보관 상태는 현장에서 따로 확인하세요.</p>'+
 '<label>마지막 입고 이후 경과 기간<select id="opsAgeDays" class="form-control"><option value="30">30일 이상</option><option value="60" selected>60일 이상</option><option value="90">90일 이상</option><option value="180">180일 이상</option></select></label>'+
 '<div id="opsAgeResults" aria-live="polite">조회 중…</div>'+
 '</div></div>';
 document.body.appendChild(modal);
 const close=()=>modal.remove(),output=modal.querySelector("#opsAgeResults");
 modal.querySelector(".ops-modal-close").onclick=close;
 modal.onclick=e=>{if(e.target===modal)close()};
 const picker=modal.querySelector("#opsAgeDays");
 let seq=0;
 const load=async()=>{
  const run=++seq,days=Number(picker.value);
  if(![30,60,90,180].includes(days))throw Error("AGE_REVIEW_INVALID_DAYS");
  output.textContent="조회 중…";picker.disabled=true;
  try{
   // Only the existing authenticated store-manager/HQ RPC is allowed.
   const rows=ageReviewRows(await BE.inventoryAgeReview(days));
   if(run!==seq||!modal.isConnected)return;
   output.innerHTML=rows.length?'<div style="display:grid;gap:8px">'+rows.map(x=>
    '<div class="ops-card" style="display:grid;gap:5px"><b>'+esc(x.name)+'</b>'+
    '<div>장부 잔량 '+number(x.balance)+' '+esc(x.unit)+'</div>'+
    '<small>마지막 입고 '+esc(x.receipt)+' · '+x.days+'일 경과'+
      (x.usage?' · 마지막 사용기록 '+esc(x.usage):' · 사용기록 없음')+'</small>'+
    '<small>점검 권장 · 소비기한 확정 아님</small></div>'
   ).join("")+'</div>':
    '<div class="ops-empty">기준에 해당하는 품목이 없습니다. 입고·사용 자료가 없다면 판정할 수 없으며 안전성이 확인된 것은 아닙니다.</div>';
  }catch(e){
   if(run===seq&&modal.isConnected)output.textContent="입고·사용 이력 점검 실패: "+String(e.message||e);
  }finally{
   if(run===seq&&modal.isConnected)picker.disabled=false;
  }
 };
 picker.onchange=()=>void load();
 await load();
};
})();
