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
function parseSaleNameCandidates(rows){
 if(!Array.isArray(rows)||rows.length>100)throw Error("SALE_NAME_RESPONSE_INVALID");
 const seen=new Set();
 return rows.map(row=>{
  const name=String(row?.sale_name??"").trim(),count=Number(row?.transaction_count);
  if(!name||name.length>120||!Number.isSafeInteger(count)||count<=0||seen.has(name))
   throw Error("SALE_NAME_RESPONSE_INVALID");
  seen.add(name);return {name,count};
 });
}
// MTG-07: preserve inspection provenance without claiming transaction quantity.
function saleSkuAuditCsv(rows){
 if(!Array.isArray(rows)||!rows.length||rows.length>100)throw Error("SKU_AUDIT_INVALID");
 const valid=new Set(["EXACT","PROMOTION","AMBIGUOUS","UNMAPPED"]);
 const cell=value=>{
  const raw=String(value??"");
  const safe=/^[\s]*[=+\-@\t\r]/.test(raw)?"'"+raw:raw;
  return '"'+safe.replace(/"/g,'""')+'"';
 };
 const headings=["판매명 원문","분류","SKU ID","품목명","일치 별칭","승인상태","자료용도"];
 const lines=[headings.map(cell).join(",")];
 for(const r of rows){
  if(!r||!valid.has(r.status)||typeof r.name!=="string"||
     r.name.length<1||r.name.length>120)throw Error("SKU_AUDIT_INVALID_ROW");
  const linked=r.status==="EXACT"||r.status==="PROMOTION";
  if(linked?(!Number.isSafeInteger(r.product)||r.product<=0):r.product!==null)
   throw Error("SKU_AUDIT_INVALID_PRODUCT");
  lines.push([r.name,r.status,linked?r.product:"",linked?r.productName:"",
    linked?r.alias:"",r.status==="EXACT"?"지점 승인 일치":"검토 필요",
    "관리자 검토용 · 실제 판매수량/자동승인 아님"].map(cell).join(","));
 }
 return "\ufeff"+lines.join("\r\n")+"\r\n";
}
window.openStoreSaleSkuPreview=function(){
 const modal=document.createElement("div");
 modal.className="ops-modal";
 modal.innerHTML='<div class="ops-modal-sheet ops-unified-sheet" style="max-width:720px">'+
 '<div class="ops-modal-head"><b>판매 메뉴명 ↔ 품목(SKU) 매핑 점검</b><button class="ops-modal-close" type="button" aria-label="닫기">×</button></div>'+
 '<div class="ops-modal-body" style="display:grid;gap:12px">'+
 '<p>POS·배달 판매 메뉴명을 한 줄에 하나씩 붙여넣으세요. 승인된 지점 품목 별칭만 확인하며 <b>레시피·실매출·재고는 변경하지 않습니다.</b> 행사 명칭은 검토용이며 1L 등 별도 SKU는 자동 통합하지 않습니다.</p>'+
 '<button type="button" class="btn btn-secondary" id="opsLoadRealSaleNames">확인된 실거래 메뉴명 자동 불러오기</button>'+
 '<p id="opsSaleNameLoadStatus" role="status" aria-live="polite">실거래가 없는 경우 목록은 비워 둡니다. 거래건수는 판매수량이 아닙니다.</p>'+
 '<textarea id="opsSaleNames" rows="6" placeholder="아메리카노&#10;행사 아메리카노&#10;아메리카노 1L"></textarea>'+
 '<button type="button" class="btn btn-primary" id="opsSaleSkuRun">지점 품목 매핑 검사</button>'+
 '<button type="button" class="btn btn-secondary" id="opsSaleSkuExport" disabled>검토 결과 CSV 내보내기</button>'+
 '<small>검토용 내보내기는 원본 판매명·분류·승인 SKU만 기록하며 실제 메뉴 판매수량이나 자동 승인 결과를 의미하지 않습니다.</small>'+
 '<div role="status" aria-live="polite" id="opsSaleSkuResult">조회 전 · 미확인 메뉴는 자동 연결하지 않습니다.</div>'+
 '</div></div>';
 document.body.appendChild(modal);
 const close=()=>modal.remove();
 modal.querySelector(".ops-modal-close").onclick=close;
 modal.onclick=e=>{if(e.target===modal)close()};
 const run=modal.querySelector("#opsSaleSkuRun"),output=modal.querySelector("#opsSaleSkuResult");
 const load=modal.querySelector("#opsLoadRealSaleNames");
 const save=modal.querySelector("#opsSaleSkuExport");
 let verifiedPreview=null,verifiedInput="";
 modal.querySelector("#opsSaleNames").addEventListener("input",()=>{
  verifiedPreview=null;verifiedInput="";save.disabled=true;
 });
 save.onclick=()=>{
  if(!verifiedPreview||modal.querySelector("#opsSaleNames").value!==verifiedInput){
   save.disabled=true;output.textContent="입력이 변경되었습니다. 먼저 다시 검사해 주세요.";return;
  }
  try{
   const content=saleSkuAuditCsv(verifiedPreview);
   const url=URL.createObjectURL(new Blob([content],{type:"text/csv;charset=utf-8"}));
   const link=document.createElement("a");
   link.href=url;link.download="baekeok-sku-review-"+new Date().toISOString().slice(0,10)+".csv";
   document.body.appendChild(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),1000);
  }catch(e){output.textContent="검토 파일 생성 실패: "+String(e.message||e)}
 };
 load.onclick=async()=>{
  const from=document.getElementById("opsFrom")?.value,to=document.getElementById("opsTo")?.value;
  const note=modal.querySelector("#opsSaleNameLoadStatus"),area=modal.querySelector("#opsSaleNames");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from||"")||!/^\d{4}-\d{2}-\d{2}$/.test(to||"")){
   note.textContent="매출·매입 조회 기간을 먼저 설정해 주세요.";return;
  }
  if(area.value.trim()&&!window.confirm("현재 입력한 판매명을 확인된 실거래 메뉴명으로 바꾸시겠습니까?"))return;
  load.disabled=true;save.disabled=true;verifiedPreview=null;verifiedInput="";
  note.textContent="확인된 실매출 메뉴명을 조회 중…";
  try{
   const rows=parseSaleNameCandidates(await BE.saleNameCandidates(from,to));
   if(!modal.isConnected)return;
   if(!rows.length){
    note.textContent="선택 기간에 확인된 실거래 메뉴명이 없습니다. 시연 데이터는 불러오지 않습니다.";
    return;
   }
   area.value=rows.map(x=>x.name).join("\n");
   note.textContent=rows.length+"개 이름을 불러왔습니다. 거래 발생 건수는 판매수량이 아니며 자동 연결·재고 차감은 하지 않습니다.";
  }catch(e){
   if(modal.isConnected)note.textContent="실거래 메뉴명 조회 실패 · 기존 입력 유지: "+String(e.message||e);
  }finally{if(modal.isConnected)load.disabled=false}
 };
 run.onclick=async()=>{
  const names=modal.querySelector("#opsSaleNames").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if(!names.length||names.length>100||names.some(x=>x.length>120)){
   output.textContent="판매명 1~100개를 입력하고 항목별 120자 이내로 제한해 주세요.";return;
  }
  save.disabled=true;verifiedPreview=null;verifiedInput="";
  run.disabled=true;output.textContent="승인된 지점 품목 매핑 확인 중…";
  try{
   const original=modal.querySelector("#opsSaleNames").value;
   const rows=parseSkuPreview(await BE.saleSkuPreview(names),names);
   if(!modal.isConnected||modal.querySelector("#opsSaleNames").value!==original)return;
   verifiedPreview=rows;verifiedInput=original;save.disabled=false;
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
