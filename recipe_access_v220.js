/* v220: top-level recipe access for clocked-in staff and store-scoped manager edits. */
(function(){
  const esc=v=>window.safeHtml?window.safeHtml(v):String(v??"");
  const number=v=>Number(v||0).toLocaleString("ko-KR");
  const reference=()=>Array.isArray(window.OPERATIONS_REFERENCE_V208?.recipes)?window.OPERATIONS_REFERENCE_V208.recipes:[];
  const referenceFor=row=>reference().find(x=>String(x.menu_name).trim()===String(row.menu_name).trim());
  const instructionsFor=row=>Array.isArray(row.instructions)&&row.instructions.length?row.instructions:(referenceFor(row)?.variants||[]);
  const sourceMaterials=row=>instructionsFor(row).map(v=>({label:v.label||"기본",lines:String(v.content||"").split("\n").map(x=>x.trim()).filter(Boolean).filter(x=>/\d+(?:\.\d+)?\s*(?:g|ml|샷|P|펌프|개|봉|장|스쿱|oz|L)\b|얼음\s*가득/i.test(x))})).filter(v=>v.lines.length);
  const stockReference=item=>(window.OPERATIONS_REFERENCE_V208?.inventory||[]).find(x=>String(x.name).trim()===String(item?.name).trim());
  const displayMenuName=row=>{
    let name=String(row?.menu_name||"");
    if(String(row?.category||"")==="대용량 베이스") name=name.replace(/\s*\(\s*\d+\s*잔(?:\s*분량)?\s*\)\s*/g," ").replace(/\s{2,}/g," ").trim();
    return name;
  };
  const eaTitle=name=>{const m=String(name||"").match(/\(\s*\d+\s*EA(?:\s*\/\s*\d+\s*EA)?\s*\)/i);return {name:m?String(name).replace(m[0],"").replace(/\s+,/g,",").replace(/\s{2,}/g," ").trim():String(name||""),ea:m?m[0].replace(/\s+/g,""):""}};
  const recipeBadges=row=>{
    const name=String(row?.menu_name||""),cat=String(row?.category||""),badges=[];
    if(cat==="대용량 베이스"){
      const n=name.match(/\((\d+)\s*잔(?:\s*분량)?\)/);
      badges.push("대용량 베이스"+(n?"("+n[1]+"잔)":""));
      return badges;
    }
    if(cat==="백억휴게소") badges.push("푸드류(백억 휴게소)");
    else if(cat==="백억 시네마") badges.push("푸드류(백억 시네마)");
    else if(cat==="디저트&베이커리") badges.push("푸드류(베이커리)");
    else if(cat==="커피&콜드브루") badges.push("커피");
    else if(cat==="라떼&버블티") badges.push(/^찐\s*/.test(name)?"찐 우유":/버블|펄/.test(name)?"버블티":"라떼");
    else if(cat==="스무디&에이드") badges.push(/스무디/.test(name)?"스무디":/주스/.test(name)?"주스":"에이드");
    else if(cat==="티&주스") badges.push(/주스/.test(name)?"주스":"티 & 스윗티");
    else if(/라떼/.test(name)) badges.push("라떼");
    else if(/스무디|쉐이크/.test(name)) badges.push("스무디");
    else if(/주스/.test(name)) badges.push("주스");
    else if(/에이드|소다/.test(name)) badges.push("에이드");
    else if(/티/.test(name)) badges.push("티 & 스윗티");
    else if(cat) badges.push(cat);
    if(name==="추가 옵션"||/추가\s*옵션/.test(name)) badges.push("추가 옵션");
    return badges;
  };
  const badgeHtml=row=>recipeBadges(row).map(x=>'<span class="recipe-v220-kind '+(x==="추가 옵션"?"option":"")+'">'+esc(x)+'</span>').join("");
  const EDIT_CATEGORIES=["커피","라떼","찐 우유","스무디","주스","에이드","버블티","티 & 스윗티","푸드 조리","대용량 베이스","푸드류(베이커리)","푸드류(백억 휴게소)","푸드류(백억 시네마)"];
  const categoryOptions=current=>[...new Set([current,...EDIT_CATEGORIES].filter(Boolean))].map(x=>`<option value="${esc(x)}" ${x===current?"selected":""}>${esc(x)}</option>`).join("");

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

  const instructionSteps=content=>{
    const lines=String(content||"").split("\n").map(x=>x.trim()).filter(Boolean),steps=[];let current=null;
    for(const line of lines){
      const m=line.match(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*(.*)$/);
      if(m){current={lines:[m[1]]};steps.push(current)}
      else if(current) current.lines.push(line);
      else {current={lines:[line]};steps.push(current)}
    }
    return steps;
  };
  const stepsHtml=content=>instructionSteps(content).map((step,i)=>`<div class="recipe-v220-step"><span class="recipe-v220-step-no">${i+1}</span><div>${step.lines.map((line,j)=>`<p class="${j?"sub":""}">${esc(line)}</p>`).join("")}</div></div>`).join("");
  const recipeThumbPlaceholder=row=>{const c=String(row?.category||""),n=String(row?.menu_name||"");let icon="📋",label="제조 레시피";if(c==="대용량 베이스"||/베이스|크림/.test(n)){icon="🥣";label="베이스 제조"}else if(c.startsWith("푸드")){icon="🍽️";label="푸드 조리"}else if(/티백|제공법|추가 옵션/.test(n)){icon="🧾";label="운영 가이드"}else if(/펄/.test(n)){icon="🧋";label="재료 제조"}else if(/티|스윗티/.test(c)){icon="🍵";label="음료 제조"}return '<span class="recipe-v220-thumb-placeholder" aria-label="'+esc(label)+'"><i>'+icon+'</i><small>'+esc(label)+'</small></span>'};
  const recipeThumb=row=>row.thumbnail_url?'<img src="'+esc(row.thumbnail_url)+'" alt="" loading="lazy">':recipeThumbPlaceholder(row);
  function recipeDetail(row,manager,refresh){
    const variants=instructionsFor(row),components=Array.isArray(row.components)?row.components:[],source=sourceMaterials(row);
    const m=modal(row.menu_name,`<div class="recipe-v220-detail">
      <div class="recipe-v220-detail-head"><div class="recipe-v220-thumb">${recipeThumb(row)}</div><div><small>${esc(row.category||"미분류")}</small><h2>${esc(row.menu_name)}</h2>${row.assignment_status==="RETIRING"?'<span class="recipe-v220-retiring">판매 종료 대기 · 재고 소진 중</span>':""}</div></div>
      <section><h3>제조 방법</h3>${variants.length?variants.map(v=>`<article class="recipe-v220-variant"><b>${esc(v.label||"기본")}</b><div class="recipe-v220-steps">${stepsHtml(v.content||"")}</div></article>`).join(""):'<p class="recipe-v220-empty">등록된 제조 방법이 없습니다.</p>'}</section>
      <section><h3>필요 재료</h3>${components.length?components.map(c=>`<div class="recipe-v220-component"><span>${esc(c.variant_label?`[${c.variant_label}] ${c.item_name}`:c.item_name)}</span><b>${c.quantity_text?esc(c.quantity_text):`${number(c.quantity)} ${esc(c.unit)}`}</b></div>`).join(""):source.length?source.map(v=>`<article class="recipe-v220-variant"><b>${esc(v.label)}</b><p>${v.lines.map(esc).join("<br>")}</p></article>`).join(""):'<p class="recipe-v220-empty">등록된 재료 수량이 없습니다.</p>'}</section>
      ${manager?`<div class="recipe-v220-detail-actions"><button class="btn btn-primary" data-edit>레시피 수정</button>${row.is_overridden?'<button class="btn btn-secondary" data-reset>본사 레시피로 복원</button>':""}${row.assignment_status==="RETIRING"?'<button class="btn btn-secondary recipe-v220-finish" data-finish>재고 소진 확인 · 판매 종료</button>':""}</div>`:""}
    </div>`,true);
    if(!manager)return;
    m.body.querySelector("[data-edit]").onclick=()=>{m.close();recipeEditor(row,refresh)};
    const reset=m.body.querySelector("[data-reset]");
    if(reset)reset.onclick=async()=>{if(!confirm("이 지점의 수정사항을 지우고 본사 레시피로 복원할까요?"))return;reset.disabled=true;try{await BE.storeRecipeOverrideClear(CURRENT_STORE_ID,row.menu_key);m.close();await refresh()}catch(e){alert("복원 실패: "+e.message);reset.disabled=false}};
    const finish=m.body.querySelector("[data-finish]");
    if(finish)finish.onclick=async()=>{if(!confirm("전용 재료 재고가 모두 소진되었는지 확인하고 이 지점 판매를 종료할까요?"))return;finish.disabled=true;try{const r=await BE.storeProductRetirementFinalize(CURRENT_STORE_ID,row.product_id);if(!r?.ok){const names=(r?.items||[]).map(x=>x.name+(x.on_hand!=null?` ${x.on_hand}${x.unit||""}`:"")).join(", ");throw Error(r?.error==="STOCK_REMAINS"?`남은 재고: ${names}`:`재고 등록이 필요한 품목: ${names}`)}m.close();await refresh()}catch(e){alert("판매 종료 불가: "+e.message);finish.disabled=false}};
  }

  async function recipeEditor(row,refresh){
    const m=modal("레시피 수정",'<div class="recipe-v220-loading">재고 목록을 불러오는 중…</div>',true);
    let stock=[];
    try{stock=await BE.inventoryItems()}catch(e){m.body.innerHTML=`<p class="recipe-v220-empty">재고 목록을 불러오지 못했습니다.<br>${esc(e.message)}</p>`;return}
    const selected=new Map((row.components||[]).map(x=>[Number(x.item_id),Number(x.quantity||0)]));
    const variants=instructionsFor(row);
    m.body.innerHTML=`<div class="recipe-v220-editor">
      <div class="recipe-v220-editor-grid"><label>메뉴명<input id="rvName" value="${esc(row.menu_name)}"></label><label>카테고리<select id="rvCategory">${categoryOptions(row.category||"")}</select></label></div>
      <label>썸네일 URL<input id="rvThumb" value="${esc(row.thumbnail_url||"")}" placeholder="https://..."></label>
      <div class="recipe-v220-section-head"><b>제조 방법</b><button type="button" class="btn btn-secondary btn-sm" id="rvVariantAdd">단계 추가</button></div>
      <div id="rvVariants" class="recipe-v220-variants-edit">${variants.map((v,i)=>variantEditor(v,i)).join("")}</div>
      <div class="recipe-v220-section-head"><b>필요 재료와 1회 사용량</b><span>현재 본사 재고품목에서 선택</span></div>
      <input id="rvStockSearch" type="search" placeholder="재료 검색">
      <div id="rvStock" class="recipe-v220-stock">${stock.map(s=>stockRow(s,selected)).join("")}</div>
      <div class="recipe-v220-editor-actions"><button class="btn btn-secondary" id="rvCancel">취소</button><button class="btn btn-primary" id="rvSave">저장</button></div>
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
      try{await BE.storeRecipeOverrideSave(CURRENT_STORE_ID,row.menu_key,m.body.querySelector("#rvName").value.trim(),m.body.querySelector("#rvCategory").value.trim(),components,m.body.querySelector("#rvThumb").value.trim(),instructions);m.close();await refresh()}catch(e){alert("저장 실패: "+e.message);btn.disabled=false;btn.textContent="저장"}
    };
  }

  function inlineRecipeHtml(row){
    const variants=instructionsFor(row),components=Array.isArray(row.components)?row.components:[],source=sourceMaterials(row);
    const methods=variants.length?variants.map(v=>`<article class="recipe-v220-variant"><b>${esc(v.label||"기본")}</b><div class="recipe-v220-steps">${stepsHtml(v.content||"")}</div></article>`).join(""):'<p class="recipe-v220-empty">등록된 제조 방법이 없습니다.</p>';
    const materials=components.length?components.map(c=>`<div class="recipe-v220-component"><span>${esc(c.variant_label?`[${c.variant_label}] ${c.item_name}`:c.item_name)}</span><b>${c.quantity_text?esc(c.quantity_text):`${number(c.quantity)} ${esc(c.unit)}`}</b></div>`).join(""):source.length?source.map(v=>`<article class="recipe-v220-variant"><b>${esc(v.label)}</b><p>${v.lines.map(esc).join("<br>")}</p></article>`).join(""):'<p class="recipe-v220-empty">등록된 재료 수량이 없습니다.</p>';
    return `<div class="recipe-v220-inline-detail"><section><h3>제조 방법</h3>${methods}</section><section><h3>필요 재료</h3>${materials}</section></div>`;
  }

  function renderList(rows,manager){
    const cats=["전체",...new Set(rows.map(r=>r.category||"미분류"))],state={focusedKey:null,returnY:0,pushed:false,restoring:false};
    view.innerHTML=`<div class="recipe-v220"><div class="recipe-v220-head page-title-row"><div><h2 class="page-title">레시피</h2><p>${manager?"이 지점에서 사용하는 레시피입니다. 연필 버튼으로 지점 전용 변경사항을 저장할 수 있습니다.":"직원이 언제든 확인할 수 있는 보기 전용 레시피입니다."}</p></div><span>${rows.length}개</span></div><div class="recipe-v220-toolbar"><label>카테고리<select id="rvCat">${cats.map(x=>`<option>${esc(x)}</option>`).join("")}</select></label><label>정렬<select id="rvSort"><option value="name-asc">메뉴명 ▲</option><option value="name-desc">메뉴명 ▼</option><option value="category-asc">카테고리명 ▲</option><option value="category-desc">카테고리명 ▼</option></select></label><label>검색<span class="recipe-v220-searchbox"><input id="rvSearch" type="search" placeholder="메뉴명 검색" autocomplete="off"><button id="rvSearchClear" type="button" class="recipe-v220-search-clear" aria-label="검색어 지우기">×</button></span></label></div><div id="rvList" class="recipe-v220-list"></div></div>`;
    const catEl=document.getElementById("rvCat"),sortEl=document.getElementById("rvSort"),searchEl=document.getElementById("rvSearch"),searchClearEl=document.getElementById("rvSearchClear"),listEl=document.getElementById("rvList");
    const closeFocused=(fromPop=false)=>{
      if(!state.focusedKey)return;
      const card=listEl.querySelector('.recipe-v220-card[data-key="'+CSS.escape(state.focusedKey)+'"]');
      card?.querySelector(".recipe-v220-inline-detail")?.remove();card?.classList.remove("is-open");
      listEl.classList.remove("has-focused-recipe");listEl.querySelectorAll(".recipe-v220-card").forEach(x=>x.classList.remove("is-search-hidden"));
      state.focusedKey=null;const y=state.returnY;
      if(state.pushed&&!fromPop){state.restoring=true;history.back()}else{state.pushed=false;requestAnimationFrame(()=>window.scrollTo(0,y))}
    };
    const onPop=()=>{if(state.restoring){state.restoring=false;state.pushed=false;requestAnimationFrame(()=>window.scrollTo(0,state.returnY));return}if(state.focusedKey)closeFocused(true)};
    const draw=()=>{
      if(state.focusedKey){state.pushed=false;state.focusedKey=null}
      const cat=catEl.value,sort=sortEl.value,q=searchEl.value.trim().toLocaleLowerCase("ko-KR"),list=rows.filter(r=>(cat==="전체"||(r.category||"미분류")===cat)&&(!q||String(r.menu_name).toLocaleLowerCase("ko-KR").includes(q)));
      if(sort==="name-asc")list.sort((a,b)=>String(a.menu_name).localeCompare(String(b.menu_name),"ko"));else if(sort==="name-desc")list.sort((a,b)=>String(b.menu_name).localeCompare(String(a.menu_name),"ko"));else if(sort==="category-asc")list.sort((a,b)=>String(a.category||"").localeCompare(String(b.category||""),"ko")||String(a.menu_name).localeCompare(String(b.menu_name),"ko"));else if(sort==="category-desc")list.sort((a,b)=>String(b.category||"").localeCompare(String(a.category||""),"ko")||String(a.menu_name).localeCompare(String(b.menu_name),"ko"));
      listEl.classList.remove("has-focused-recipe");listEl.innerHTML=list.length?list.map(r=>`<article class="recipe-v220-card ${String(r.category||"").startsWith("푸드")?"is-food":""}" data-key="${esc(r.menu_key)}"><button type="button" class="recipe-v220-open" aria-label="${esc(r.menu_name)} 레시피 보기"><span class="recipe-v220-thumb">${recipeThumb(r)}</span><span class="recipe-v220-copy"><small>${badgeHtml(r)}</small><b>${esc(eaTitle(displayMenuName(r)).name)}${eaTitle(displayMenuName(r)).ea?`<span class="recipe-v220-ea">${esc(eaTitle(displayMenuName(r)).ea)}</span>`:""}</b><em>${(r.components||[]).length||sourceMaterials(r).reduce((n,v)=>n+v.lines.length,0)}개 재료</em></span>${r.is_overridden?'<span class="recipe-v220-local">지점 수정</span>':""}${r.assignment_status==="RETIRING"?'<span class="recipe-v220-retiring">판매 종료 대기</span>':""}</button>${manager?'<button type="button" class="recipe-v220-edit" aria-label="레시피 수정"><span class="recipe-v220-edit-glyph" aria-hidden="true">✎</span></button>':""}</article>`).join(""):'<p class="recipe-v220-empty">조건에 맞는 레시피가 없습니다.</p>';
      listEl.querySelectorAll(".recipe-v220-card").forEach(card=>{const row=rows.find(x=>x.menu_key===card.dataset.key);card.querySelector(".recipe-v220-open").onclick=()=>{
        if(state.focusedKey===card.dataset.key){closeFocused();return}
        state.returnY=window.scrollY;state.focusedKey=card.dataset.key;
        listEl.querySelectorAll(".recipe-v220-card.is-open").forEach(x=>{x.classList.remove("is-open");x.querySelector(".recipe-v220-inline-detail")?.remove()});
        listEl.classList.add("has-focused-recipe");listEl.querySelectorAll(".recipe-v220-card").forEach(x=>x.classList.toggle("is-search-hidden",x!==card));
        card.insertAdjacentHTML("beforeend",inlineRecipeHtml(row));card.classList.add("is-open");
        if(!state.pushed){history.pushState({recipeFocus:card.dataset.key},"",location.href);state.pushed=true}
        requestAnimationFrame(()=>window.scrollTo(0,Math.max(0,card.getBoundingClientRect().top+window.scrollY-8)));
      };const edit=card.querySelector(".recipe-v220-edit");if(edit)edit.onclick=()=>recipeEditor(row,refresh)});
    };
    const refresh=async()=>{const next=await BE.storeRecipeList(CURRENT_STORE_ID);window.recipeFocusAbort?.abort();renderList(next,true)};
    window.recipeFocusAbort?.abort();window.recipeFocusAbort=new AbortController();
    window.addEventListener("popstate",onPop,{signal:window.recipeFocusAbort.signal});
    const syncSearchClear=()=>searchClearEl.classList.toggle("is-visible",!!searchEl.value);catEl.onchange=draw;sortEl.onchange=draw;searchEl.oninput=()=>{syncSearchClear();draw()};searchClearEl.onclick=()=>{searchEl.value="";syncSearchClear();draw();searchEl.focus()};syncSearchClear();draw();
  }

  async function renderRecipeHub(){
    view.innerHTML='<div class="recipe-v220-loading">레시피를 불러오는 중…</div>';
    try{
      let manager=false;
      if(LIVE&&Auth.isLoggedIn()){
        try{manager=!!(await BE.isAdmin())}catch(_){manager=false}
      }
      rows=manager?await BE.storeRecipeList(CURRENT_STORE_ID):await BE.publicStoreRecipeList(CURRENT_STORE_ID);
      renderList(rows,manager);
    }catch(e){view.innerHTML=`<p class="recipe-v220-empty">레시피를 불러오지 못했습니다.<br>${esc(e.message)}</p>`}
  }
  window.renderRecipeHub=renderRecipeHub;
})();
