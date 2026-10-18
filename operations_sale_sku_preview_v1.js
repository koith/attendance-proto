/* MTG-07: read-only manager preview for real approved HQ product aliases.
   Never auto-insert POS sales, edit a recipe or merge litre variants. */
(function(){
"use strict";
const escapeText=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
function parseSkuPreview(rows,names){
 if(!Array.isArray(rows)||rows.length!==names.length)throw Error("SKU_RESPONSE_COUNT_MISMATCH");
 const statuses=new Set(["EXACT","PROMOTION","AMBIGUOUS","UNMAPPED"]);
 return rows.map((r,i)=>{
  if(!r||Number(r.input_index)!==i+1||!statuses.has(r.match_status)||
    String(r.sale_name)!==names[i])throw Error("SKU_RESPONSE_INVALID");
  const matched=["EXACT","PROMOTION"].includes(r.match_status);
  const id=r.product_id==null?null:Number(r.product_id);
  if((matched&&(!Number.isSafeInteger(id)||id<=0))||
     (!matched&&id!==null))throw Error("SKU_RESPONSE_INVALID_PRODUCT");
  return {name:names[i],status:r.match_status,product:id,
   productName:matched?String(r.product_name||""):"",alias:matched?String(r.matched_alias||""):""};
 });
}
window.openStoreSaleSkuPreview=function(){
 const modal=document.createElement("div");
 modal.className="ops-modal";
 modal.innerHTML='<div class="ops-modal-sheet ops-unified-sheet" style="max-width:720px">'+
 '<div class="ops-modal-head"><b>판매 메뉴명 ↔ 품목(SKU) 매핑 점검</b><button class="ops-modal-close" type="button" aria-label="닫기">×</button></div>'+
 '<div class="ops-modal-body" style="display:grid;gap:12px">'+
 '<p>POS·배달 판매 메뉴명을 한 줄에 하나씩 붙여넣으세요. 승인된 지점 품목 별칭만 확인하며 <b>레시피·실매출·재고는 변경하지 않습니다.</b> 행사 명칭은 검토용이며 1L 등 별도 SKU는 자동 통합하지 않습니다.</p>'+
 '<textarea id="opsSaleNames" rows="6" placeholder="아메리카노&#10;행사 아메리카노&#10;아메리카노 1L"></textarea>'+
 '<button type="button" class="btn btn-primary" id="opsSaleSkuRun">지점 품목 매핑 검사</button>'+
 '<div role="status" aria-live="polite" id="opsSaleSkuResult">조회 전 · 미확인 메뉴는 자동 연결하지 않습니다.</div>'+
 '</div></div>';
 document.body.appendChild(modal);
 const close=()=>modal.remove();
 modal.querySelector(".ops-modal-close").onclick=close;
 modal.onclick=e=>{if(e.target===modal)close()};
 const run=modal.querySelector("#opsSaleSkuRun"),output=modal.querySelector("#opsSaleSkuResult");
 run.onclick=async()=>{
  const names=modal.querySelector("#opsSaleNames").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!names.length||names.length>100||names.some(x=>x.length>120)){
   output.textContent="판매명 1~100개를 입력하고 항목별 120자 이내로 제한해 주세요.";return;
  }
  run.disabled=true;output.textContent="승인된 지점 품목 매핑 확인 중…";
  try{
   const rows=parseSkuPreview(await BE.saleSkuPreview(names),names);
   if(!modal.isConnected)return;
   const labels={EXACT:"지점 승인 별칭 일치",PROMOTION:"행사명 후보 (확인 필요)",
    AMBIGUOUS:"복수 품목 충돌 · 수동 검토",UNMAPPED:"매핑 미확인 · 판매량 반영 금지"};
   output.innerHTML='<div style="display:grid;gap:8px">'+rows.map(x=>
     '<div class="ops-card" style="display:grid;gap:4px"><b>'+escapeText(x.name)+'</b>'+
     '<span>'+labels[x.status]+'</span>'+
     (x.product?'<small>SKU #'+x.product+' · '+escapeText(x.productName)+' (별칭: '+escapeText(x.alias)+')</small>':'')+
     '</div>').join("")+'</div>';
  }catch(e){
   if(modal.isConnected)output.textContent="품목 매핑 조회 실패 · 원본 거래를 수정하지 않았습니다: "+String(e.message||e);
  }finally{if(modal.isConnected)run.disabled=false}
 };
};
})();
