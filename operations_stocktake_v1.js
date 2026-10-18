/* Optional manager-only physical stocktake. Opening this panel never changes inventory.
   A draft records evidence only; a separate confirmed post appends signed ledger deltas. */
(function(){
"use strict";
const esc=value=>String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const qty=value=>Number(value||0).toLocaleString("ko-KR",{maximumFractionDigits:3});
// Filter only the already authorized catalog returned for this store.
// Never replace missing on-hand data or publish inventory through public routes.
function stocktakeMatchingCatalog(rows,term){
 const q=String(term||"").trim().toLocaleLowerCase("ko-KR");
 return q?rows.filter(x=>String(x.name||"").toLocaleLowerCase("ko-KR").includes(q)):rows;
}
// Local-only draft editing; always revalidates the authorized catalog item.
// Recounting the same item replaces its unsaved count, never writes to DB.
function upsertStocktakeSelection(selected,item,raw){
 const id=Number(item?.id),text=String(raw??"").trim();
 if(!item||!Number.isSafeInteger(id)||id<=0)throw Error("실사 가능한 품목을 선택하세요.");
 if(!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(text)||
    !Number.isFinite(Number(text))||Number(text)>1000000000)
  throw Error("실제 수량은 0 이상 10억 이하, 소수 셋째 자리까지 입력하세요.");
 if(!selected.has(id)&&selected.size>=100)throw Error("한 번에 최대 100개 품목만 실사할 수 있습니다.");
 const updated=selected.has(id);
 selected.set(id,{item_id:id,name:String(item.name),unit:String(item.unit),counted_quantity:Number(text)});
 return {updated,count:selected.size};
}
window.openStoreInventoryStocktake=async function(){
 let catalog=[],history=[];
 try{
  [catalog,history]=await Promise.all([BE.inventoryStocktakeCatalog(),BE.inventoryStocktakeList()]);
  if(!Array.isArray(catalog)||!Array.isArray(history))throw Error("STOCKTAKE_INVALID_RESPONSE");
 }catch(error){alert("재고 실사 정보를 불러오지 못했습니다: "+error.message);return;}
 const selected=new Map();
 const modal=document.createElement("div");modal.className="ops-modal";
 modal.innerHTML='<div class="ops-modal-sheet" style="max-width:720px">'+
  '<div class="ops-modal-head"><b>표준 품목 재고 실사</b><button type="button" class="ops-modal-close" aria-label="닫기">×</button></div>'+
  '<div class="ops-modal-body" style="display:grid;gap:12px">'+
  '<div style="font-size:.84rem">실사 초안은 재고를 변경하지 않습니다. 수량과 차이를 확인한 뒤 <b>확정 반영</b>해야만 장부에 조정 이력이 추가됩니다. 샘플·데모 품목 및 시연 재고는 제외됩니다.</div>'+
  '<label>품목명 검색<input id="opsStocktakeSearch" class="form-control" type="search" autocomplete="off" placeholder="예: 원두, 우유"></label>'+
  '<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(110px,160px);gap:8px">'+
  '<label>실사할 품목<select id="opsStocktakeItem" class="form-control"></select></label>'+
  '<label>실제 수량<input id="opsStocktakeQty" class="form-control" type="number" min="0" max="1000000000" step="0.001" placeholder="0"></label></div>'+
  '<button type="button" class="btn btn-secondary" id="opsStocktakeAdd">실사 품목 추가</button><small id="opsStocktakeEntryStatus" role="status" aria-live="polite">수량 입력 후 추가하세요. 같은 품목은 다시 입력해 수정할 수 있습니다.</small>'+
  '<div id="opsStocktakeSelection"></div>'+
  '<label>실사 메모 (선택)<textarea id="opsStocktakeNote" class="form-control" maxlength="500" rows="2"></textarea></label>'+
  '<button type="button" class="btn btn-primary" id="opsStocktakeDraft" disabled>실사 초안 저장 (재고 변경 없음)</button>'+
  '<div id="opsStocktakeReview"></div>'+
  '<div><b>최근 실사 기록</b><div id="opsStocktakeHistory"></div></div>'+
  '</div></div>';
 document.body.appendChild(modal);
 const close=()=>modal.remove();
 modal.querySelector(".ops-modal-close").onclick=close;
 modal.onclick=e=>{if(e.target===modal)close()};
 const find=selector=>modal.querySelector(selector);
 const picker=find("#opsStocktakeItem"),quantity=find("#opsStocktakeQty"),search=find("#opsStocktakeSearch");
 function renderPicker(){
  const matches=stocktakeMatchingCatalog(catalog,search.value),previous=picker.value;
  picker.innerHTML=matches.length?matches.map(x=>'<option value="'+Number(x.id)+'">'+esc(x.name)+' ('+esc(x.unit)+')</option>').join(""):'<option value="">검색되는 표준 품목 없음</option>';
  picker.disabled=matches.length===0;
  find("#opsStocktakeAdd").disabled=matches.length===0;
  if(matches.some(x=>String(x.id)===previous))picker.value=previous;
  find("#opsStocktakeAdd").textContent=selected.has(Number(picker.value))?"선택 품목 실사 수량 수정":"실사 품목 추가";
 }
 search.addEventListener("input",renderPicker);
 picker.addEventListener("change",renderPicker);
 renderPicker();
 const busy=(value)=>{find("#opsStocktakeAdd").disabled=value||picker.disabled;find("#opsStocktakeDraft").disabled=value||selected.size===0;};
 function renderSelected(){
  const rows=[...selected.values()];
  find("#opsStocktakeSelection").innerHTML=rows.length?
   '<div style="display:grid;gap:6px">'+rows.map(row=>
    '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px">'+
    '<span style="min-width:0">'+esc(row.name)+' · '+qty(row.counted_quantity)+' '+esc(row.unit)+'</span>'+
    '<button type="button" class="btn btn-secondary btn-sm" data-remove="'+row.item_id+'">제외</button></div>'
   ).join("")+'</div>':'<div class="ops-empty">실사할 품목을 추가하세요. 최대 100개 품목을 한 번에 기록할 수 있습니다.</div>';
  find("#opsStocktakeDraft").disabled=rows.length===0;
  find("#opsStocktakeSelection").querySelectorAll("[data-remove]").forEach(button=>
   button.onclick=()=>{selected.delete(Number(button.dataset.remove));renderSelected()});
 }
 quantity.addEventListener("keydown",event=>{if(event.key==="Enter"){event.preventDefault();find("#opsStocktakeAdd").click();}});
 find("#opsStocktakeAdd").onclick=()=>{
  const itemId=Number(picker.value),item=catalog.find(x=>Number(x.id)===itemId);
  const raw=String(quantity.value??"").trim();
  try{
   const result=upsertStocktakeSelection(selected,item,raw);
   quantity.value="";search.value="";renderPicker();renderSelected();
   // Mobile next-item workflow: return to search without revisiting the dropdown.
   search.focus();
   if(result.updated)find("#opsStocktakeEntryStatus").textContent="실사 수량을 수정했습니다. 초안 저장 전까지 장부는 변경되지 않습니다.";
   else find("#opsStocktakeEntryStatus").textContent="품목이 추가되었습니다. 다음 품목을 검색하세요.";
  }catch(error){alert(error.message);}
 };
 async function refreshHistory(){
  const rows=await BE.inventoryStocktakeList();
  if(!Array.isArray(rows))throw Error("STOCKTAKE_LIST_INVALID");
  history=rows;
  find("#opsStocktakeHistory").innerHTML=rows.length?
   '<div style="display:grid;gap:6px;margin-top:8px">'+rows.map(h=>
    '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px">'+
    '<span>'+esc(h.counted_on)+' · #'+Number(h.id)+' · '+esc(h.status)+' · '+Number(h.line_count)+'개 품목</span>'+
    '<button type="button" class="btn btn-secondary btn-sm" data-stocktake-detail="'+Number(h.id)+'">내용 확인</button></div>'
   ).join("")+'</div>':'<div class="ops-empty">작성된 실사 기록이 없습니다.</div>';
  find("#opsStocktakeHistory").querySelectorAll("[data-stocktake-detail]").forEach(button=>
   button.onclick=()=>showDetails(Number(button.dataset.stocktakeDetail)));
 }
 async function showDetails(id){
  const data=await BE.inventoryStocktakeDetail(id);
  if(!data||!Array.isArray(data.lines)||Number(data.id)!==id)throw Error("STOCKTAKE_DETAIL_INVALID");
  const changes=data.lines.filter(line=>Number(line.variance)!==0);
  find("#opsStocktakeReview").innerHTML='<div class="ops-card" style="display:grid;gap:8px">'+
   '<b>실사 #'+id+' · '+esc(data.status)+'</b>'+
   '<small>예상재고와 실사수량의 차이만 장부에 기록됩니다. 다른 품목은 변경하지 않습니다.</small>'+
   data.lines.map(line=>'<div style="display:flex;justify-content:space-between;gap:6px"><span>'+
     esc(line.name)+' · 예상 '+qty(line.expected_quantity)+' '+esc(line.unit)+'</span><b>실사 '+
     qty(line.counted_quantity)+' · 차이 '+qty(line.variance)+'</b></div>').join("")+
   '<div>조정 대상 '+changes.length+'개 / 전체 '+data.lines.length+'개</div>'+
   (data.status==="DRAFT"?'<button type="button" class="btn btn-primary" id="opsStocktakeConfirm">검토한 실사 확정 반영</button>':'')+
   '</div>';
  const confirmButton=find("#opsStocktakeConfirm");
  if(confirmButton)confirmButton.onclick=async()=>{
   if(!confirm("실사 #"+id+"의 수량을 확인했습니까? 확정하면 재고 장부에 조정 이력이 추가되며 되돌릴 수 없습니다."))return;
   confirmButton.disabled=true;
   try{
    const result=await BE.inventoryStocktakePost(id);
    if(result?.ok!==true||result?.status!=="POSTED")throw Error("STOCKTAKE_POST_NOT_CONFIRMED");
    await refreshHistory();await showDetails(id);
    alert("재고 실사 확정 완료 · 조정 기록 "+Number(result.adjustments||0)+"건. 원본 이동 내역은 보존되었습니다.");
   }catch(error){alert("실사 확정 실패: "+error.message);confirmButton.disabled=false;}
  };
 }
 find("#opsStocktakeDraft").onclick=async()=>{
  if(selected.size===0)return;
  const lines=[...selected.values()].map(({item_id,counted_quantity})=>({item_id,counted_quantity}));
  busy(true);
  try{
   const draft=await BE.inventoryStocktakeDraft(lines,find("#opsStocktakeNote").value.trim());
   if(!draft||draft.status!=="DRAFT"||!Number.isSafeInteger(Number(draft.id)))throw Error("STOCKTAKE_DRAFT_NOT_CONFIRMED");
   selected.clear();renderSelected();await refreshHistory();await showDetails(Number(draft.id));
   alert("실사 초안이 저장되었습니다. 아직 재고 수량은 변경되지 않았습니다.");
  }catch(error){alert("실사 초안 저장 실패: "+error.message)}
  finally{busy(false)}
 };
 renderSelected();
 await refreshHistory().catch(error=>{find("#opsStocktakeHistory").textContent="실사 기록 조회 실패: "+error.message;});
};
})();
