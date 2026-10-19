/* #1175 MTG-11: authenticated manager's INTERNAL order handoff ONLY.
 * CJ supplier order/cart/checkout are NOT triggered. The manager checks each
 * already-entered internal order ID and manually approves the copy action.
 * No guessed vendor SKU, auto-cart API, actual supplier authentication or writes.
 */
(function(){
"use strict";
const statuses=new Set(["ORDERED","PARTIAL"]);
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function amount(value){
 if(value==null||typeof value==="boolean"||
    !/^(?:0|[1-9]\d{0,9})(?:\.\d{1,3})?$/.test(String(value).trim()))
  throw Error("SUPPLIER_HANDOFF_INVALID_QUANTITY");
 return Math.round(Number(value)*1000);
}
function verifiedSupplierOrderCandidates(orders,storeId){
 if(!Array.isArray(orders)||orders.length>500||!Number.isSafeInteger(Number(storeId))||Number(storeId)<=0)
  throw Error("SUPPLIER_HANDOFF_INVALID_SOURCE");
 const rows=[],ids=new Set();
 for(const row of orders){
  if(!statuses.has(String(row?.status||"").toUpperCase()))continue;
  const id=Number(row.id),store=Number(row.store_id);
  if(!Number.isSafeInteger(id)||id<=0||ids.has(id)||store!==Number(storeId)||row.is_demo===true)
   throw Error("SUPPLIER_HANDOFF_INVALID_ORDER");
  ids.add(id);
  const itemId=Number(row.item_id),manualId=Number(row.manual_item_id);
  if((Number.isSafeInteger(itemId)&&itemId>0)===(Number.isSafeInteger(manualId)&&manualId>0))
   throw Error("SUPPLIER_HANDOFF_INVALID_ITEM");
  const rawName=String(row.item_name??""),rawUnit=String(row.order_unit??row.unit??"");
  const name=rawName.trim(),unit=rawUnit.trim();
  // Inspect the unsanitized source before trim: a leading CR/LF is a prompt
  // instruction injection risk when pasting into the supplier's AI cart.
  if(/[\r\n\t\x00-\x1f]/.test(rawName)||/[\r\n\t\x00-\x1f]/.test(rawUnit)||
     !name||name.length>140||!unit||unit.length>24||
     (row.order_unit&&row.unit&&String(row.order_unit)!==String(row.unit)))
   throw Error("SUPPLIER_HANDOFF_INVALID_ITEM");
  const ordered=amount(row.ordered_quantity),received=amount(row.received_quantity);
  if(ordered<=0||received>ordered||ordered===received)throw Error("SUPPLIER_HANDOFF_INVALID_QUANTITY");
  const remain=(ordered-received)/1000;
  rows.push({id,name,unit,remaining:remain,original:ordered/1000,received:received/1000});
 }
 return rows.sort((a,b)=>a.id-b.id);
}
function supplierHandoffText(orders,storeId,selectedIds){
 const rows=verifiedSupplierOrderCandidates(orders,storeId);
 if(!Array.isArray(selectedIds)||selectedIds.length<1||selectedIds.length>200)
  throw Error("SUPPLIER_HANDOFF_SELECTION_REQUIRED");
 const selected=new Set(selectedIds.map(Number));
 if(selected.size!==selectedIds.length||[...selected].some(id=>!Number.isSafeInteger(id)||id<=0))
  throw Error("SUPPLIER_HANDOFF_SELECTION_INVALID");
 const chosen=rows.filter(row=>selected.has(row.id));
 if(chosen.length!==selected.size)throw Error("SUPPLIER_HANDOFF_SELECTION_INVALID");
 const clean=n=>n.toLocaleString("ko-KR",{maximumFractionDigits:3});
 return "CJ프레시웨이 주문 입력 전 확인용 (온리원푸드넷/프레시엔)\n"+
  "내부 발주 기록을 수동으로 옮기기 위한 목록이며 공급사 장바구니 반영 또는 실제 주문이 아닙니다.\n"+
  "지점 ID: "+storeId+"\n"+
  "공급사 상품 코드·규격·입고일·이미 주문 여부는 반드시 주문 사이트에서 재확인하세요.\n"+
  chosen.map(row=>"내부발주 #"+row.id+" · "+row.name+" · 미입고 "+
   clean(row.remaining)+" "+row.unit).join("\n")+
  "\n※ 점주가 선택·복사한 목록으로, 외부 주문 확정 전까지 어떠한 구매도 이루어지지 않습니다.";
}
window.verifiedSupplierOrderCandidates=verifiedSupplierOrderCandidates;
window.supplierHandoffText=supplierHandoffText;
window.openSupplierOrderHandoff=function(orders,storeId){
 if(!Auth?.isLoggedIn?.())throw Error("SUPPLIER_HANDOFF_MANAGER_AUTH_REQUIRED");
 const candidates=verifiedSupplierOrderCandidates(orders,storeId);
 const modal=document.createElement("div");
 modal.className="ops-modal";
 modal.innerHTML='<div class="ops-modal-sheet ops-unified-sheet" style="max-width:720px">'+
 '<div class="ops-modal-head"><b>공급사 주문 입력 준비</b><button type="button" id="opsHandoffClose" aria-label="닫기">×</button></div>'+
 '<div class="ops-modal-body" style="display:grid;gap:12px">'+
 '<p>내부 발주는 실제 CJ프레시웨이 주문과 별개입니다. 온리원푸드넷/프레시엔에서 상품 규격과 기존 주문 중복을 확인한 뒤 직접 최종 주문하세요.</p>'+
 '<small>이미 공급사에 주문한 항목은 선택하지 마세요. 체크하지 않은 품목은 복사하지 않습니다.</small>'+
 '<div id="opsHandoffCandidates" style="display:grid;gap:8px">'+
 (candidates.length?candidates.map(r=>
  '<label class="ops-card" style="display:flex;align-items:center;gap:8px">'+
  '<input type="checkbox" data-handoff-order="'+r.id+'" style="width:20px;height:20px">'+
  '<span>내부발주 #'+r.id+' · <b>'+escapeHtml(r.name)+'</b> · 미입고 '+
  escapeHtml(String(r.remaining))+' '+escapeHtml(r.unit)+'</span></label>').join(""):
  '<p>입고 대기 중인 유효한 내부 발주가 없습니다.</p>')+'</div>'+
 '<button type="button" class="btn btn-secondary" id="opsHandoffCopy" disabled>선택 품목 복사 · 공급사 주문 아님</button>'+
 '<textarea id="opsHandoffFallback" rows="5" readonly style="display:none;width:100%" aria-label="공급사 입력 목록 수동 복사용"></textarea>'+
 '<div id="opsHandoffStatus" role="status" aria-live="polite">선택한 항목만 공급사 입력용으로 복사합니다.</div>'+
 '</div></div>';
 document.body.appendChild(modal);
 const copy=modal.querySelector("#opsHandoffCopy"),status=modal.querySelector("#opsHandoffStatus");
 const selected=()=>[...modal.querySelectorAll("[data-handoff-order]:checked")]
  .map(node=>Number(node.dataset.handoffOrder));
 modal.querySelector("#opsHandoffClose").onclick=()=>modal.remove();
 modal.onclick=e=>{if(e.target===modal)modal.remove()};
 modal.querySelector("#opsHandoffCandidates").onchange=()=>{copy.disabled=!selected().length};
 copy.onclick=async()=>{
  const choice=selected();
  if(!choice.length||copy.disabled)return;
  if((Number(CURRENT_STORE_ID)||1)!==Number(storeId)){
   status.textContent="지점이 바뀌었습니다. 다시 조회해 주세요.";return;
  }
  if(!window.confirm("점주가 선택한 내부 발주를 확인했으며, 공급사 중복 주문과 상품·단위를 직접 확인할 예정입니까?"))return;
  let text;
  try{
   const previous=supplierHandoffText(orders,storeId,choice);
   // A manager may receive stock while the modal is open. Re-read the server
   // before copying: no stale/duplicate supplier request amounts.
   const live=await BE.inventoryPurchaseOrders();
   if(!modal.isConnected||(Number(CURRENT_STORE_ID)||1)!==Number(storeId))
    throw Error("SUPPLIER_HANDOFF_STORE_CHANGED");
   const current=supplierHandoffText(live,storeId,choice);
   if(current!==previous)throw Error("SUPPLIER_HANDOFF_STALE_ORDERS");
   text=current;
  }catch(e){
   status.textContent="복사할 수 없습니다. 입고 또는 발주 상태를 재조회해 주세요: "+String(e.message||e);return;
  }
  try{
   await navigator.clipboard.writeText(text);
   status.textContent="선택 "+choice.length+"건을 복사했습니다. 공급사 장바구니 반영·결제는 하지 않았습니다.";
  }catch(error){
   const box=modal.querySelector("#opsHandoffFallback");
   box.style.display="block";box.value=text;box.focus();box.select();
   status.textContent="자동 복사가 차단되어 아래 목록을 직접 복사해야 합니다. 외부 주문은 이루어지지 않았습니다.";
  }
 };
};
})();