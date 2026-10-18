/* MTG-09: public shared POS count suggestions, NEVER stock mutation.
 Staff identity/PIN/clock status is verified in every server RPC. */
(function(){
"use strict";
const esc=v=>String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
function staffCountUpsert(selected,item,raw){
 const id=Number(item?.id),text=String(raw??"").trim();
 if(!Number.isSafeInteger(id)||id<=0)throw Error("표준 품목을 선택하세요.");
 if(!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(text)||!Number.isFinite(Number(text))||
    Number(text)>1e9)throw Error("실사 수량은 0 이상, 소수 셋째 자리까지 입력하세요.");
 if(!selected.has(id)&&selected.size>=100)throw Error("한 번에 최대 100개 품목만 가능합니다.");
 selected.set(id,{item_id:id,counted_quantity:Number(text),name:item.name,unit:item.unit});
 return selected.size;
}
window.openStaffStocktake=async function(){
 if(!LIVE){alert("지점 서버에 연결된 상태에서만 직원 실사를 제출할 수 있습니다.");return;}
 const dialog=document.createElement("div");dialog.className="ops-modal";
 dialog.innerHTML='<div class="ops-modal-sheet ops-unified-sheet" style="max-width:700px">'+
 '<div class="ops-modal-head"><b>근무 중 직원 재고 실사 제출</b><button type="button" class="ops-modal-close" aria-label="닫기">×</button></div>'+
 '<div class="ops-modal-body" style="display:grid;gap:12px">'+
 '<p>현재 출근 중인 직원만 본인 PIN으로 제출할 수 있습니다. <b>제출 시 재고는 변경되지 않으며, 관리자가 확인·별도 확정해야 장부에 반영됩니다.</b></p>'+
 '<label>직원 선택<select id="staffCountEmployee" class="form-control"></select></label>'+
 '<label>본인 PIN<input id="staffCountPin" class="form-control" type="password" autocomplete="off" inputmode="numeric" maxlength="20" placeholder="본인 PIN"></label>'+
 '<button class="btn btn-secondary" type="button" id="staffCountVerify">본인 확인 및 실사 품목 불러오기</button>'+
 '<div id="staffCountWorkspace" hidden style="display:grid;gap:10px">'+
 '<label>품목 검색<input id="staffCountSearch" type="search" class="form-control" placeholder="예: 우유, 원두"></label>'+
 '<div style="display:grid;grid-template-columns:minmax(0,1fr) 120px;gap:8px">'+
 '<label>품목<select id="staffCountItem" class="form-control"></select></label>'+
 '<label>실제 수량<input id="staffCountQty" class="form-control" type="number" min="0" max="1000000000" step=".001"></label></div>'+
 '<button type="button" id="staffCountAdd" class="btn btn-secondary">품목 추가 / 실사 수량 수정</button>'+
 '<div id="staffCountLines"></div>'+
 '<label>실사 메모<textarea id="staffCountNote" maxlength="500" rows="2" class="form-control"></textarea></label>'+
 '<button type="button" id="staffCountSubmit" class="btn btn-primary" disabled>점주에게 실사 결과 제출 (재고 변경 없음)</button>'+
 '</div><div id="staffCountStatus" role="status" aria-live="polite">직원 선택 후 PIN을 입력하세요.</div>'+
 '</div></div>';
 document.body.appendChild(dialog);
 const el=id=>dialog.querySelector("#"+id),close=()=>{el("staffCountPin").value="";dialog.remove()};
 dialog.querySelector(".ops-modal-close").onclick=close;
 dialog.onclick=e=>{if(e.target===dialog)close()};
 let catalog=[],selected=new Map(),verifiedEmployee=null,busy=false;
 const invalid=()=>{verifiedEmployee=null;catalog=[];selected.clear();el("staffCountWorkspace").hidden=true};
 const fields=["staffCountEmployee","staffCountPin"];
 for(const key of fields)el(key).addEventListener("change",invalid);
 function renderPicker(){
  const term=el("staffCountSearch").value.trim().toLocaleLowerCase("ko-KR"),picker=el("staffCountItem");
  const matches=catalog.filter(x=>String(x.name||"").toLocaleLowerCase("ko-KR").includes(term));
  const previous=picker.value;
  picker.innerHTML=matches.length?matches.map(x=>'<option value="'+Number(x.id)+'">'+esc(x.name)+' ('+esc(x.unit)+')</option>').join(""):'<option value="">일치하는 품목 없음</option>';
  picker.disabled=!matches.length;el("staffCountAdd").disabled=!matches.length;
  if(matches.some(x=>String(x.id)===previous))picker.value=previous;
 }
 function renderLines(){
  el("staffCountLines").innerHTML=selected.size?
   [...selected.values()].map(x=>'<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0"><span>'+esc(x.name)+
   ' · '+Number(x.counted_quantity).toLocaleString("ko-KR")+' '+esc(x.unit)+'</span>'+
   '<button class="btn btn-secondary btn-sm" type="button" data-remove="'+x.item_id+'">제외</button></div>').join(""):
   '<div class="ops-empty">실사 품목을 추가하세요.</div>';
  el("staffCountSubmit").disabled=!selected.size||busy;
  el("staffCountLines").querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{
   selected.delete(Number(b.dataset.remove));renderLines();
  });
 }
 el("staffCountSearch").addEventListener("input",renderPicker);
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
  const id=Number(el("staffCountEmployee").value),pin=el("staffCountPin").value;
  if(!Number.isSafeInteger(id)||id<=0||pin.length<4){el("staffCountStatus").textContent="직원과 본인 PIN을 확인하세요.";return;}
  busy=true;el("staffCountVerify").disabled=true;
  try{
   const rows=await BE.staffStocktakeCatalog(id,pin);
   if(!Array.isArray(rows)||rows.length>500||!rows.every(x=>Number.isSafeInteger(Number(x.id))&&
     typeof x.name==="string"&&typeof x.unit==="string"))
    throw Error("품목 응답을 확인할 수 없습니다.");
   if(!dialog.isConnected)return;
   catalog=rows;verifiedEmployee=id;
   el("staffCountWorkspace").hidden=false;renderPicker();renderLines();
   el("staffCountStatus").textContent="본인 확인 완료 · 재고 실사 품목을 입력하세요.";
  }catch(e){if(dialog.isConnected)el("staffCountStatus").textContent="인증/조회 실패: "+String(e.message||e)}
  finally{busy=false;if(dialog.isConnected)el("staffCountVerify").disabled=false}
 };
 el("staffCountAdd").onclick=()=>{
  const item=catalog.find(x=>Number(x.id)===Number(el("staffCountItem").value));
  try{
   staffCountUpsert(selected,item,el("staffCountQty").value);
   el("staffCountQty").value="";el("staffCountSearch").value="";
   renderPicker();renderLines();el("staffCountSearch").focus();
  }catch(e){el("staffCountStatus").textContent=String(e.message||e)}
 };
 el("staffCountSubmit").onclick=async()=>{
  if(busy||!selected.size||verifiedEmployee!==Number(el("staffCountEmployee").value))return;
  if(!confirm("실사 결과를 점주에게 제출할까요? 제출만으로 실제 재고는 변경되지 않습니다."))return;
  busy=true;el("staffCountSubmit").disabled=true;
  try{
   const result=await BE.staffStocktakeSubmit(verifiedEmployee,el("staffCountPin").value,
    [...selected.values()].map(({item_id,counted_quantity})=>({item_id,counted_quantity})),
    el("staffCountNote").value.trim());
   if(result?.status!=="SUBMITTED"||!Number.isSafeInteger(Number(result.id))||
      result.stock_changed!==false)throw Error("직원 실사 제출 확인 실패");
   el("staffCountStatus").textContent="실사 #"+Number(result.id)+" 제출 완료. 아직 재고는 변경되지 않았습니다.";
   el("staffCountPin").value="";selected.clear();invalid();
  }catch(e){el("staffCountStatus").textContent="실사 제출 실패: "+String(e.message||e);el("staffCountSubmit").disabled=false}
  finally{busy=false}
 };
};
})();