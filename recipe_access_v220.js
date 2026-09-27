/* v220: top-level recipe access for clocked-in staff and store-scoped manager edits. */
(function(){
  const esc=v=>window.safeHtml?window.safeHtml(v):String(v??"");
  const number=v=>Number(v||0).toLocaleString("ko-KR");
  const reference=()=>Array.isArray(window.OPERATIONS_REFERENCE_V208?.recipes)?window.OPERATIONS_REFERENCE_V208.recipes:[];
  const referenceFor=row=>reference().find(x=>String(x.menu_name).trim()===String(row.menu_name).trim());
  const instructionsFor=row=>Array.isArray(row.instructions)&&row.instructions.length?row.instructions:(referenceFor(row)?.variants||[]);

  function modal(title,content,wide=false){
    const wrap=document.createElement("div");
    wrap.className="recipe-v220-modal";
    wrap.innerHTML=`<section class="recipe-v220-sheet ${wide?"wide":""}" role="dialog" aria-modal="true"><header><b>${esc(title)}</b><button type="button" aria-label="닫기">×</button></header><div class="recipe-v220-modal-body">${content}</div></section>`;
    document.body.appendChild(wrap);
    const close=()=>wrap.remove();
    wrap.querySelector("header button").onclick=close;
    wrap.onclick=e=>{if(e.target===wrap)close()};
    return {wrap,body:wrap.querySelector(".recipe-v220-modal-body"),close};
  }

  function recipeDetail(row,manager,refresh){
    const variants=instructionsFor(row),components=Array.isArray(row.components)?row.components:[];
    const m=modal(row.menu_name,`<div class="recipe-v220-detail">
      <div class="recipe-v220-detail-head"><div class="recipe-v220-thumb">${row.thumbnail_url?`<img src="${esc(row.thumbnail_url)}" alt="">`:"<span>RECIPE</span>"}</div><div><small>${esc(row.category||"미분류")}</small><h2>${esc(row.menu_name)}</h2>${row.assignment_status==="RETIRING"?'<span class="recipe-v220-retiring">판매 종료 대기 · 재고 소진 중</span>':""}</div></div>
      <section><h3>제조 방법</h3>${variants.length?variants.map(v=>`<article class="recipe-v220-variant"><b>${esc(v.label||"기본")}</b><p>${esc(v.content||"").replace(/\n/g,"<br>")}</p></article>`).join(""):'<p class="recipe-v220-empty">등록된 제조 방법이 없습니다.</p>'}</section>
      <section><h3>필요 재료</h3>${components.length?components.map(c=>`<div class="recipe-v220-component"><span>${esc(c.item_name)}</span><b>${number(c.quantity)} ${esc(c.unit)}</b></div>`).join(""):'<p class="recipe-v220-empty">등록된 재료 수량이 없습니다.</p>'}</section>
      ${manager?`<div class="recipe-v220-detail-actions"><button class="btn btn-primary" data-edit>이 지점 레시피 수정</button>${row.is_overridden?'<button class="btn btn-secondary" data-reset>본사 레시피로 복원</button>':""}${row.assignment_status==="RETIRING"?'<button class="btn btn-secondary recipe-v220-finish" data-finish>재고 소진 확인 · 판매 종료</button>':""}</div>`:""}
    </div>`,true);
    if(!manager)return;
    m.body.querySelector("[data-edit]").onclick=()=>{m.close();recipeEditor(row,refresh)};
    const reset=m.body.querySelector("[data-reset]");
    if(reset)reset.onclick=async()=>{if(!confirm("이 지점의 수정사항을 지우고 본사 레시피로 복원할까요?"))return;reset.disabled=true;try{await BE.storeRecipeOverrideClear(CURRENT_STORE_ID,row.menu_key);m.close();await refresh()}catch(e){alert("복원 실패: "+e.message);reset.disabled=false}};
    const finish=m.body.querySelector("[data-finish]");
    if(finish)finish.onclick=async()=>{if(!confirm("전용 재료 재고가 모두 소진되었는지 확인하고 이 지점 판매를 종료할까요?"))return;finish.disabled=true;try{const r=await BE.storeProductRetirementFinalize(CURRENT_STORE_ID,row.product_id);if(!r?.ok){const names=(r?.items||[]).map(x=>x.name+(x.on_hand!=null?` ${x.on_hand}${x.unit||""}`:"")).join(", ");throw Error(r?.error==="STOCK_REMAINS"?`남은 재고: ${names}`:`재고 등록이 필요한 품목: ${names}`)}m.close();await refresh()}catch(e){alert("판매 종료 불가: "+e.message);finish.disabled=false}};
  }

  async function recipeEditor(row,refresh){
    const m=modal("이 지점 레시피 수정",'<div class="recipe-v220-loading">재고 목록을 불러오는 중…</div>',true);
    let stock=[];
    try{stock=await BE.inventoryItems()}catch(e){m.body.innerHTML=`<p class="recipe-v220-empty">재고 목록을 불러오지 못했습니다.<br>${esc(e.message)}</p>`;return}
    const selected=new Map((row.components||[]).map(x=>[Number(x.item_id),Number(x.quantity||0)]));
    const variants=instructionsFor(row);
    m.body.innerHTML=`<div class="recipe-v220-editor">
      <div class="recipe-v220-editor-grid"><label>메뉴명<input id="rvName" value="${esc(row.menu_name)}"></label><label>카테고리<input id="rvCategory" value="${esc(row.category||"")}"></label></div>
      <label>썸네일 URL<input id="rvThumb" value="${esc(row.thumbnail_url||"")}" placeholder="https://..."></label>
      <div class="recipe-v220-section-head"><b>제조 방법</b><button type="button" class="btn btn-secondary btn-sm" id="rvVariantAdd">단계 추가</button></div>
      <div id="rvVariants" class="recipe-v220-variants-edit">${variants.map((v,i)=>variantEditor(v,i)).join("")}</div>
      <div class="recipe-v220-section-head"><b>필요 재료와 1회 사용량</b><span>현재 본사 재고품목에서 선택</span></div>
      <input id="rvStockSearch" type="search" placeholder="재료 검색">
      <div id="rvStock" class="recipe-v220-stock">${stock.map(s=>stockRow(s,selected)).join("")}</div>
      <div class="recipe-v220-editor-actions"><button class="btn btn-secondary" id="rvCancel">취소</button><button class="btn btn-primary" id="rvSave">이 지점에 저장</button></div>
    </div>`;
    function variantEditor(v,i){return `<div class="recipe-v220-variant-edit" data-variant><input aria-label="규격" placeholder="예: ICED(16oz)" value="${esc(v.label||"")}"><textarea aria-label="제조 방법" rows="4" placeholder="제조 순서와 용량을 입력하세요">${esc(v.content||"")}</textarea><button type="button" aria-label="단계 삭제" data-remove>×</button></div>`}
    function stockRow(s,map){const on=map.has(Number(s.id)),qty=map.get(Number(s.id))||"";return `<label class="recipe-v220-stock-row" data-name="${esc(String(s.name).toLocaleLowerCase("ko-KR"))}"><input type="checkbox" data-item="${s.id}" ${on?"checked":""}><span><b>${esc(s.name)}</b><small>${esc(s.sku||"")} · ${esc(s.unit)}</small></span><input type="number" min="0.01" step="0.01" data-qty="${s.id}" value="${qty}" ${on?"":"disabled"} placeholder="사용량"><em>${esc(s.unit)}</em></label>`}
    const bindVariants=()=>m.body.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>b.closest("[data-variant]").remove());bindVariants();
    m.body.querySelector("#rvVariantAdd").onclick=()=>{m.body.querySelector("#rvVariants").insertAdjacentHTML("beforeend",variantEditor({},Date.now()));bindVariants()};
    m.body.querySelectorAll("[data-item]").forEach(c=>c.onchange=()=>{const q=m.body.querySelector(`[data-qty="${c.dataset.item}"]`);q.disabled=!c.checked;if(c.checked&&!q.value)q.value="1"});
    m.body.querySelector("#rvStockSearch").oninput=e=>{const q=e.target.value.trim().toLocaleLowerCase("ko-KR");m.body.querySelectorAll(".recipe-v220-stock-row").forEach(x=>x.hidden=!!q&&!x.dataset.name.includes(q))};
    m.body.querySelector("#rvCancel").onclick=m.close;
    m.body.querySelector("#rvSave").onclick=async()=>{
      const btn=m.body.querySelector("#rvSave");
      const components=[...m.body.querySelectorAll("[data-item]:checked")].map(c=>({item_id:Number(c.dataset.item),quantity:Number(m.body.querySelector(`[data-qty="${c.dataset.item}"]`).value||0)})).filter(x=>x.quantity>0);
      const instructions=[...m.body.querySelectorAll("[data-variant]")].map(x=>({label:x.querySelector("input").value.trim(),content:x.querySelector("textarea").value.trim()})).filter(x=>x.label||x.content);
      if(!components.length)return alert("필요 재료를 하나 이상 선택하고 사용량을 입력하세요.");
      btn.disabled=true;btn.textContent="저장 중…";
      try{await BE.storeRecipeOverrideSave(CURRENT_STORE_ID,row.menu_key,m.body.querySelector("#rvName").value.trim(),m.body.querySelector("#rvCategory").value.trim(),components,m.body.querySelector("#rvThumb").value.trim(),instructions);m.close();await refresh()}catch(e){alert("저장 실패: "+e.message);btn.disabled=false;btn.textContent="이 지점에 저장"}
    };
  }

  function renderList(rows,manager){
    const cats=["전체",...new Set(rows.map(r=>r.category||"미분류"))];
    view.innerHTML=`<div class="recipe-v220"><div class="recipe-v220-head page-title-row"><div><h2 class="page-title">레시피</h2><p>${manager?"이 지점에서 사용하는 레시피입니다. 연필 버튼으로 지점 전용 변경사항을 저장할 수 있습니다.":"출근이 확인된 직원에게 제공되는 보기 전용 레시피입니다."}</p></div><span>${rows.length}개</span></div><div class="recipe-v220-toolbar"><label>카테고리<select id="rvCat">${cats.map(x=>`<option>${esc(x)}</option>`).join("")}</select></label><label>검색<input id="rvSearch" type="search" placeholder="메뉴명 검색"></label></div><div id="rvList" class="recipe-v220-list"></div></div>`;
    const draw=()=>{const cat=document.getElementById("rvCat").value,q=document.getElementById("rvSearch").value.trim().toLocaleLowerCase("ko-KR"),list=rows.filter(r=>(cat==="전체"||(r.category||"미분류")===cat)&&(!q||String(r.menu_name).toLocaleLowerCase("ko-KR").includes(q)));document.getElementById("rvList").innerHTML=list.length?list.map(r=>`<article class="recipe-v220-card" data-key="${esc(r.menu_key)}"><button type="button" class="recipe-v220-open" aria-label="${esc(r.menu_name)} 레시피 보기"><span class="recipe-v220-thumb">${r.thumbnail_url?`<img src="${esc(r.thumbnail_url)}" alt="" loading="lazy">`:"<span>MENU</span>"}</span><span class="recipe-v220-copy"><small>${esc(r.category||"미분류")}</small><b>${esc(r.menu_name)}</b><em>${(r.components||[]).length}개 재료</em></span>${r.is_overridden?'<span class="recipe-v220-local">지점 수정</span>':""}${r.assignment_status==="RETIRING"?'<span class="recipe-v220-retiring">판매 종료 대기</span>':""}</button>${manager?'<button type="button" class="recipe-v220-edit" aria-label="이 지점 레시피 수정">✎</button>':""}</article>`).join(""):'<p class="recipe-v220-empty">조건에 맞는 레시피가 없습니다.</p>';document.querySelectorAll(".recipe-v220-card").forEach(card=>{const row=rows.find(x=>x.menu_key===card.dataset.key);card.querySelector(".recipe-v220-open").onclick=()=>recipeDetail(row,manager,refresh);const edit=card.querySelector(".recipe-v220-edit");if(edit)edit.onclick=()=>recipeEditor(row,refresh)})};
    const refresh=async()=>{const next=await BE.storeRecipeList(CURRENT_STORE_ID);renderList(next,true)};
    document.getElementById("rvCat").onchange=draw;document.getElementById("rvSearch").oninput=draw;draw();
  }

  async function renderStaffGate(){
    let emps=[];try{emps=await BE.listEmployeesState()}catch(e){}
    const remembered=Number(sessionStorage.getItem("recipe_last_employee"))||0;
    view.innerHTML=`<div class="recipe-v220 recipe-v220-gate"><div class="page-title-row"><h2 class="page-title">레시피</h2></div><p>현재 출근 중인 직원만 레시피를 볼 수 있습니다.</p><label>직원<select id="rvEmp">${emps.map(e=>`<option value="${e.id}" ${Number(e.id)===remembered?"selected":""}>${esc(e.name)}</option>`).join("")}</select></label><label>비밀번호<input id="rvPin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="4자리"></label><button class="btn btn-primary btn-block btn-lg" id="rvEnter" ${emps.length?"":"disabled"}>레시피 보기</button><div id="rvError"></div></div>`;
    document.getElementById("rvEnter").onclick=async()=>{const btn=document.getElementById("rvEnter"),id=Number(document.getElementById("rvEmp").value),pin=document.getElementById("rvPin").value,err=document.getElementById("rvError");if(!/^\d{4}$/.test(pin)){err.textContent="비밀번호 4자리를 입력하세요.";return}btn.disabled=true;btn.textContent="출근 상태 확인 중…";try{const rows=await BE.staffRecipeList(id,pin,CURRENT_STORE_ID);sessionStorage.setItem("recipe_last_employee",String(id));renderList(rows,false)}catch(e){const msg=String(e.message||e);err.textContent=msg.includes("NOT_CLOCKED_IN")?"현재 출근 상태가 아닙니다.":msg.includes("BAD_PIN")?"비밀번호가 올바르지 않습니다.":"레시피를 불러오지 못했습니다.";btn.disabled=false;btn.textContent="레시피 보기"}};
  }

  async function renderRecipeHub(){
    if(LIVE&&Auth.isLoggedIn()){
      view.innerHTML='<div class="recipe-v220-loading">레시피를 불러오는 중…</div>';
      try{renderList(await BE.storeRecipeList(CURRENT_STORE_ID),true)}catch(e){view.innerHTML=`<p class="recipe-v220-empty">레시피를 불러오지 못했습니다.<br>${esc(e.message)}</p>`}
    }else await renderStaffGate();
  }
  window.renderRecipeHub=renderRecipeHub;
})();
