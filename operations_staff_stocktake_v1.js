/* MTG-09: public shared POS count suggestions, NEVER stock mutation.
 Staff identity/PIN/clock status is verified in every server RPC. */
(function(){
"use strict";
const esc=v=>String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
function staffCountUpsert(selected,item,raw){
 const id=Number(item?.id),text=String(raw??"").trim();
 if(!Number.isSafeInteger(id)||id<=0)throw Error("표준 품목을 선택하세요.");
 if(!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(text)||!Number.isFinite(Number(text))||
    Number(text)>1e9)throw Error("수량은 0 이상, 소수 셋째 자리까지 입력하세요.");
 if(!selected.has(id)&&selected.size>=100)throw Error("한 번에 최대 100개 품목만 가능합니다.");
 selected.set(id,{item_id:id,counted_quantity:Number(text),name:item.name,unit:item.unit});
 return selected.size;
}
// Race guard: a successful old PIN response must not reactivate the shared POS form
// after the selected employee or current PIN input changes.
function staffVerificationMatches(epoch,currentEpoch,currentEmployee,currentPin,expectedEmployee,expectedPin){
 return epoch===currentEpoch&&Number(currentEmployee)===Number(expectedEmployee)&&
   String(currentPin)===String(expectedPin);
}
window.openStaffStocktake=async function(){
 if(!LIVE){alert("지점 서버에 연결된 상태에서만 직원 실사를 제출할 수 있습니다.");return;}
 const opener=document.activeElement&&document.activeElement!==document.body?document.activeElement:document.getElementById?.("staffCountOpen");
 const dialog=document.createElement("div");dialog.className="ops-modal staff-count-modal";
 dialog.innerHTML='<div class="ops-modal-sheet staff-count-sheet" role="dialog" aria-modal="true" aria-labelledby="staffCountTitle">'+
 '<div class="ops-modal-head staff-count-head"><h2 id="staffCountTitle">재고 파악(직원용)</h2><button type="button" class="ops-modal-close" aria-label="닫기">×</button></div>'+
 '<div class="ops-modal-body staff-count-body">'+
 '<div class="staff-count-intro"><span class="staff-count-intro-icon" aria-hidden="true">✓</span><div><b>매장에 남은 수량을 알려주세요</b><p>제출한 수량은 점주가 확인·별도 확정해야 장부에 반영됩니다.</p></div></div>'+
 '<section class="staff-count-section" aria-labelledby="staffCountIdentityTitle"><div class="staff-count-section-head"><h3 id="staffCountIdentityTitle"><span>1</span> 본인 확인</h3><small>출근 중인 직원만 이용</small></div>'+
 '<div class="staff-count-identity-fields"><label for="staffCountEmployee">직원<select id="staffCountEmployee" class="form-control"></select></label>'+
 '<label for="staffCountPin">본인 PIN<input id="staffCountPin" class="form-control" type="password" autocomplete="off" inputmode="numeric" maxlength="20" placeholder="출퇴근 PIN 입력"></label></div>'+
 '<button class="btn btn-secondary staff-count-verify" type="button" id="staffCountVerify">본인 확인하고 품목 불러오기</button></section>'+
 '<section id="staffCountWorkspace" class="staff-count-section" hidden aria-labelledby="staffCountEntryTitle">'+
 '<div class="staff-count-section-head"><h3 id="staffCountEntryTitle"><span>2</span> 수량 입력</h3><small>최대 100개 품목</small></div>'+
 '<label for="staffCountSearch">품목 검색<input id="staffCountSearch" type="search" class="form-control" placeholder="우유, 원두 등 품목명으로 찾기"></label>'+
 '<div class="staff-count-quantity-fields"><label for="staffCountItem">품목<select id="staffCountItem" class="form-control"></select></label>'+
 '<label for="staffCountQty">실제 수량<input id="staffCountQty" class="form-control" type="number" inputmode="decimal" min="0" max="1000000000" step=".001" placeholder="0"></label></div>'+
 '<button type="button" id="staffCountAdd" class="btn btn-secondary staff-count-add">품목 추가</button>'+
 '<div class="staff-count-list-head"><b>입력한 품목</b><span id="staffCountLineCount">0개</span></div><div id="staffCountLines" class="staff-count-lines"></div>'+
 '<label for="staffCountNote">메모 <span class="staff-count-optional">선택</span><textarea id="staffCountNote" maxlength="500" rows="2" class="form-control" placeholder="수량 확인에 필요한 내용을 남겨주세요"></textarea></label>'+
 '</section><div id="staffCountStatus" class="staff-count-status" role="status" aria-live="polite">직원을 선택하고 본인 PIN을 입력해 주세요.</div></div>'+
 '<div id="staffCountFooter" class="staff-count-footer" hidden><p>제출만으로는 재고가 바뀌지 않습니다.</p><button type="button" id="staffCountSubmit" class="btn btn-primary" disabled>점주에게 수량 제출</button></div></div>';
 document.body.appendChild(dialog);
 const el=id=>dialog.querySelector("#"+id),close=()=>{verificationEpoch++;el("staffCountPin").value="";dialog.remove();document.removeEventListener?.("keydown",keyboard);opener?.focus?.()};
 dialog.querySelector(".ops-modal-close").onclick=close;
 dialog.onclick=e=>{if(e.target===dialog)close()};
 let catalog=[],selected=new Map(),verifiedEmployee=null,busy=false,verificationEpoch=0;
 const invalid=message=>{
  verificationEpoch++;verifiedEmployee=null;catalog=[];selected.clear();
  el("staffCountWorkspace").hidden=true;el("staffCountFooter").hidden=true;el("staffCountSubmit").disabled=true;
  el("staffCountStatus").textContent=typeof message==="string"?message:"직원 또는 PIN이 변경됐습니다. 다시 본인 확인하세요.";
 };
 const keyboard=event=>{
  if(event.key==="Escape"){event.preventDefault();close();return;}
  if(event.key!=="Tab")return;
  const nodes=[...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')].filter(x=>x.offsetParent!==null);
  const first=nodes[0],last=nodes[nodes.length-1];
  if(!dialog.contains(document.activeElement)){event.preventDefault();first?.focus();return;}
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
 };
 document.addEventListener?.("keydown",keyboard);
 dialog.querySelector(".ops-modal-close").focus();
 el("staffCountEmployee").addEventListener("change",invalid);
 el("staffCountEmployee").addEventListener("input",invalid);
 // 'change' fires only after blur; invalidate sensitive proof on every keystroke.
 el("staffCountPin").addEventListener("input",invalid);
 function renderPicker(){
  const term=el("staffCountSearch").value.trim().toLocaleLowerCase("ko-KR"),picker=el("staffCountItem");
  const matches=catalog.filter(x=>String(x.name||"").toLocaleLowerCase("ko-KR").includes(term));
  const previous=picker.value;
  picker.innerHTML=matches.length?matches.map(x=>'<option value="'+Number(x.id)+'">'+esc(x.name)+' ('+esc(x.unit)+')</option>').join(""):'<option value="">일치하는 품목 없음</option>';
  picker.disabled=!matches.length;el("staffCountAdd").disabled=!matches.length;
  if(matches.some(x=>String(x.id)===previous))picker.value=previous;
  if(!picker.disabled)el("staffCountAdd").textContent=selected.has(Number(picker.value))?"선택 품목 수량 수정":"품목 추가";
 }
 function renderLines(){
  el("staffCountLines").innerHTML=selected.size?
   [...selected.values()].map(x=>'<div class="staff-count-line"><span class="staff-count-line-name">'+esc(x.name)+
   '</span><span class="staff-count-line-qty"><b>'+Number(x.counted_quantity).toLocaleString("ko-KR")+'</b> '+esc(x.unit)+'</span>'+
   '<button class="staff-count-remove" type="button" data-remove="'+x.item_id+'" aria-label="'+esc(x.name)+' 목록에서 빼기">빼기</button></div>').join(""):
   '<div class="staff-count-empty"><b>입력한 품목이 없습니다</b><span>품목과 수량을 입력한 뒤 추가해 주세요.</span></div>';
  el("staffCountLineCount").textContent=selected.size+"개";
  el("staffCountSubmit").disabled=!selected.size||busy;
  el("staffCountLines").querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{
   selected.delete(Number(b.dataset.remove));renderLines();
  });
 }
 el("staffCountSearch").addEventListener("input",renderPicker);
 el("staffCountItem").addEventListener("change",renderPicker);
 try{
  const cards=await BE.posPublicStaffCards();
  if(!Array.isArray(cards)||!dialog.isConnected)throw Error("직원 목록 응답 오류");
  const working=cards.filter(x=>x.working===true&&Number.isSafeInteger(Number(x.id)));
  el("staffCountEmployee").innerHTML=working.length?working.map(x=>
   '<option value="'+Number(x.id)+'">'+esc(x.name)+'</option>').join(""):
   '<option value="">근무 중인 직원 없음</option>';
  el("staffCountEmployee").disabled=!working.length;
  el("staffCountVerify").disabled=!working.length;
  if(!working.length)el("staffCountStatus").textContent="근무 중 직원이 없습니다. 출근 등록 후 제출하세요.";
 }catch(e){if(dialog.isConnected)el("staffCountStatus").textContent="직원 목록 조회 실패: "+String(e.message||e)}
 el("staffCountVerify").onclick=async()=>{
  if(busy)return;invalid();
  const epoch=verificationEpoch;
  const id=Number(el("staffCountEmployee").value),pin=el("staffCountPin").value;
  if(!Number.isSafeInteger(id)||id<=0||pin.length<4){el("staffCountStatus").textContent="직원과 본인 PIN을 확인하세요.";return;}
  busy=true;el("staffCountVerify").disabled=true;
  el("staffCountStatus").textContent="직원 본인 확인 중…";
  try{
   const rows=await BE.staffStocktakeCatalog(id,pin);
   if(!Array.isArray(rows)||rows.length>500||!rows.every(x=>Number.isSafeInteger(Number(x.id))&&
     typeof x.name==="string"&&typeof x.unit==="string"))
    throw Error("품목 응답을 확인할 수 없습니다.");
   if(!dialog.isConnected||!staffVerificationMatches(epoch,verificationEpoch,
      el("staffCountEmployee").value,el("staffCountPin").value,id,pin))return;
   catalog=rows;verifiedEmployee=id;
   el("staffCountWorkspace").hidden=false;el("staffCountFooter").hidden=false;renderPicker();renderLines();
   el("staffCountStatus").textContent="본인 확인 완료 · 재고 품목을 입력하세요.";
  }catch(e){if(dialog.isConnected&&epoch===verificationEpoch)
   el("staffCountStatus").textContent="인증/조회 실패: "+String(e.message||e)}
  finally{busy=false;if(dialog.isConnected)el("staffCountVerify").disabled=false}
 };
 el("staffCountAdd").onclick=()=>{
  const item=catalog.find(x=>Number(x.id)===Number(el("staffCountItem").value));
  try{
   const updated=selected.has(Number(item?.id));
   staffCountUpsert(selected,item,el("staffCountQty").value);
   el("staffCountQty").value="";el("staffCountSearch").value="";
   renderPicker();renderLines();el("staffCountSearch").focus();
   el("staffCountStatus").textContent=updated?"수량을 수정했습니다. 제출 전까지 장부는 변경되지 않습니다.":"품목을 추가했습니다. 다음 품목을 검색하세요.";
  }catch(e){el("staffCountStatus").textContent=String(e.message||e)}
 };
 el("staffCountQty").addEventListener("keydown",event=>{
  if(event.key==="Enter"){event.preventDefault();el("staffCountAdd").click();}
 });
 el("staffCountSubmit").onclick=async()=>{
  if(busy||!selected.size||verifiedEmployee!==Number(el("staffCountEmployee").value))return;
  if(!confirm("입력한 수량을 점주에게 제출할까요? 제출만으로 실제 재고는 변경되지 않습니다."))return;
  busy=true;el("staffCountSubmit").disabled=true;
  try{
   const result=await BE.staffStocktakeSubmit(verifiedEmployee,el("staffCountPin").value,
    [...selected.values()].map(({item_id,counted_quantity})=>({item_id,counted_quantity})),
    el("staffCountNote").value.trim());
   if(result?.status!=="SUBMITTED"||!Number.isSafeInteger(Number(result.id))||
      result.stock_changed!==false)throw Error("직원 실사 제출 확인 실패");
   el("staffCountStatus").textContent="재고 파악 #"+Number(result.id)+" 제출 완료. 아직 재고는 변경되지 않았습니다.";
   el("staffCountPin").value="";selected.clear();invalid("입력한 수량을 점주에게 제출했습니다. 점주 확인 전까지 재고는 변경되지 않습니다.");
  }catch(e){el("staffCountStatus").textContent="수량 제출 실패: "+String(e.message||e);el("staffCountSubmit").disabled=false}
  finally{busy=false}
 };
};
})();