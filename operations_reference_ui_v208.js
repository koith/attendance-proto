/* Unified inventory and recipe screens built from supplied documents and live management data. */
(function(){
const originalRender=window.renderOperations,REF=window.OPERATIONS_REFERENCE_V208||{inventory:[],recipes:[]};
const esc=value=>window.safeHtml?window.safeHtml(value):String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const icon=name=>/원두|커피/.test(name)?"☕":/우유|밀크|크림/.test(name)?"🥛":/시럽|소스|청|베이스/.test(name)?"🧴":/과일|딸기|망고|자몽|멜론|레몬|라임/.test(name)?"🍓":/컵|뚜껑|빨대|봉투|포장|용기/.test(name)?"🥤":/팝콘/.test(name)?"🍿":/빵|베이글|케이크|떡|슈/.test(name)?"🥐":"📦";
const num=value=>Number(value||0).toLocaleString("ko-KR");
const cleanExample=value=>String(value||"").replace(/^\s*\[예시\]\s*/,"");
let inventoryCategory="전체",inventoryQuery="",recipeCategory="전체",recipeQuery="",managedInventory=[],registeredRecipes=[],hqProducts=[],hqInventory=[];

function shell(title,subtitle){
  const root=document.getElementById("view");
  root.innerHTML='<div class="ops-head"><div><h2>'+esc(title)+'</h2><p>'+esc(subtitle)+'</p></div></div><div id="opsBody"></div>';
  return document.getElementById("opsBody");
}
function modal(title,content){
  const wrap=document.createElement("div");
  wrap.className="ops-modal";
  wrap.innerHTML='<div class="ops-modal-sheet ops-unified-sheet"><div class="ops-modal-head"><b>'+esc(title)+'</b><button type="button" aria-label="닫기">×</button></div><div class="ops-modal-body">'+content+'</div></div>';
  document.body.appendChild(wrap);
  const close=()=>wrap.remove();
  wrap.querySelector(".ops-modal-head button").onclick=close;
  wrap.onclick=e=>{if(e.target===wrap)close()};
  return {wrap,body:wrap.querySelector(".ops-modal-body"),close};
}

async function loadInventoryManagement(){
  const [overview,manual]=await Promise.all([BE.inventoryOverview().catch(()=>[]),BE.inventoryManualList().catch(()=>[])]);
  const manualNames=new Set(manual.map(x=>x.name));
  const live=overview.filter(x=>!x.is_demo&&!/^\[예시\]/.test(x.name||"")&&!manualNames.has(x.name));
  managedInventory=[...manual.map(x=>({...x,on_hand:Number(x.on_hand||0),target_level:Number(x.target_level||0),reorder_point:Number(x.reorder_point||0),manual:true})),...live.map(x=>({...x,target_level:Number(x.reorder_level||0),reorder_point:Number(x.reorder_point||Number(x.reorder_level||0)*.65)}))];
}
function stockState(row){
  const on=Number(row.on_hand||0),target=Number(row.target_level||row.reorder_level||0),point=Number(row.reorder_point||0);
  if(point>0&&on<point*.5)return {key:"critical",label:"긴급 부족",rank:0};
  if(point>0&&on<=point)return {key:"low",label:"발주 필요",rank:1};
  return {key:"ok",label:"적정",rank:2};
}
function orderPanel(){
  const low=managedInventory.filter(x=>stockState(x).rank<2).sort((a,b)=>stockState(a).rank-stockState(b).rank||Number(a.on_hand)-Number(b.on_hand));
  const bars=low.length?low.map((row,index)=>{const target=Number(row.target_level||row.reorder_level||0),on=Number(row.on_hand||0),need=Math.max(0,target-on),pct=target?Math.min(100,on/target*100):0,st=stockState(row);return '<button type="button" class="ops-order-row '+st.key+'" data-managed-stock="'+managedInventory.indexOf(row)+'"><span><b>'+esc(row.name)+'</b><small>'+st.label+' · 현재 '+num(on)+' / 목표 '+num(target)+' '+esc(row.unit||"")+'</small></span><i><em style="width:'+pct+'%"></em></i><strong>발주 '+num(need)+' '+esc(row.unit||"")+'</strong></button>'}).join(""):'<div class="ops-order-empty">현재 발주점에 도달한 등록 품목이 없습니다.</div>';
  return '<section class="ops-order-panel"><div class="ops-unified-section-head"><div><b>발주 필요</b><span>'+low.length+'개 품목</span></div><div><button type="button" class="btn btn-secondary btn-sm" id="opsInventoryBulk">일괄 등록</button><button type="button" class="btn btn-primary btn-sm" id="opsInventoryAdd">+ 재고 등록</button></div></div><div class="ops-order-bars">'+bars+'</div></section>';
}
function inventoryCard(row){
  const life=row.shelf_life||{},expiry=[life.storage_after&&"개봉 후 "+life.storage_after,life.expiry_after&&"상미 "+life.expiry_after,life.after_portion&&"소분·해동 "+life.after_portion].filter(Boolean).join(" · ");
  return '<article class="ops-stock-bar ops-stock-reference"><div class="ops-stock-title"><span class="ops-inventory-thumb" aria-hidden="true">'+icon(row.name)+'</span><b>'+esc(row.name)+'</b></div><dl><div><dt>현재</dt><dd>'+esc(row.current_text||"-")+'</dd></div><div><dt>최소</dt><dd>'+esc(row.minimum_text||"-")+'</dd></div><div><dt>주문</dt><dd>'+esc(row.order_text||"-")+'</dd></div></dl>'+(row.note?'<p>'+esc(row.note)+'</p>':"")+(expiry?'<small class="ops-stock-expiry">'+esc(expiry)+'</small>':"")+'</article>';
}
async function openInventoryEditor(row=null){
  const m=modal(row?"재고 수정":"재고 등록",'<div class="ops-inventory-fields"><label>품목명<input id="unifiedInventoryName" value="'+esc(row?.name||"")+'"></label><label>SKU<input id="unifiedInventorySku" value="'+esc(row?.sku||"")+'"></label><label>카테고리<input id="unifiedInventoryCategory" value="'+esc(row?.category||"")+'"></label><label>단위<input id="unifiedInventoryUnit" value="'+esc(row?.unit||"ea")+'"></label><label>현재고<input id="unifiedInventoryOn" type="number" min="0" step="0.01" value="'+Number(row?.on_hand||0)+'"></label><label>목표재고<input id="unifiedInventoryTarget" type="number" min="0" step="0.01" value="'+Number(row?.target_level||row?.reorder_level||0)+'"></label><label>발주점<input id="unifiedInventoryPoint" type="number" min="0" step="0.01" value="'+Number(row?.reorder_point||0)+'"></label></div><small class="ops-form-help">현재고가 발주점 이하가 되면 발주 필요 그래프에 표시됩니다.</small><button type="button" class="btn btn-primary" id="unifiedInventorySave">'+(row?"수정 저장":"재고 등록")+'</button>');
  m.body.querySelector("#unifiedInventorySave").onclick=async()=>{const q=id=>m.body.querySelector(id),name=q("#unifiedInventoryName").value.trim(),target=Number(q("#unifiedInventoryTarget").value||0),point=Number(q("#unifiedInventoryPoint").value||0);if(!name)return alert("품목명을 입력하세요.");if(point>target)return alert("발주점은 목표재고보다 높을 수 없습니다.");try{await BE.inventoryManualSave(row?.manual?row.id:null,name,q("#unifiedInventorySku").value.trim(),q("#unifiedInventoryCategory").value.trim(),q("#unifiedInventoryUnit").value.trim(),q("#unifiedInventoryOn").value,target,point,row?.thumbnail_url||"");m.close();await loadInventoryManagement();renderInventory(true)}catch(error){alert("재고 저장 실패: "+error.message)}};
}
function openInventoryBulk(){
  const m=modal("재고 일괄 등록",'<div class="ops-upload-box"><label>재고 CSV 파일<input id="unifiedInventoryFile" type="file" accept=".csv,text/csv"></label><small>열 순서: 품목명, SKU, 카테고리, 단위, 현재고, 목표재고, 발주점, 썸네일URL. 첫 행은 헤더입니다.</small><button type="button" class="btn btn-primary" id="unifiedInventoryBulkSave" disabled>검증 후 등록</button></div>'),file=m.body.querySelector("#unifiedInventoryFile"),save=m.body.querySelector("#unifiedInventoryBulkSave");let rows=[];
  file.onchange=async()=>{rows=String(await file.files[0]?.text()||"").split(/\r?\n/).slice(1).filter(Boolean).map(line=>line.split(",").map(x=>x.trim()));save.disabled=!rows.length};
  save.onclick=async()=>{save.disabled=true;try{for(const x of rows)await BE.inventoryManualSave(null,x[0],x[1],x[2],x[3],x[4],x[5],x[6],x[7]);m.close();await loadInventoryManagement();renderInventory(true)}catch(error){save.disabled=false;alert("일괄 등록 실패: "+error.message)}};
}
async function renderInventory(refresh=false){
  const body=refresh?document.getElementById("opsBody"):shell("재고","발주 필요 품목과 인하대점 재고 기준을 한 화면에서 관리합니다.");
  if(!refresh)await loadInventoryManagement();
  const all=REF.inventory||[],categories=["전체",...new Set(all.map(x=>x.category))];let rows=inventoryCategory==="전체"?all:all.filter(x=>x.category===inventoryCategory);
  if(inventoryQuery)rows=rows.filter(x=>[x.name,x.current_text,x.minimum_text,x.order_text,x.note].some(v=>String(v||"").toLowerCase().includes(inventoryQuery)));
  body.innerHTML=orderPanel()+'<div class="ops-unified-section-title"><b>재고 기준</b><span>'+rows.length+'개</span></div><div class="ops-inventory-toolbar ops-reference-toolbar"><label>검색<input id="opsReferenceInventorySearch" type="search" value="'+esc(inventoryQuery)+'" placeholder="품목명·현재고·발주기준"></label><label>카테고리<select id="opsReferenceInventoryCat">'+categories.map(x=>'<option '+(x===inventoryCategory?'selected':'')+'>'+esc(x)+'</option>').join("")+'</select></label></div><div class="ops-stock-chart ops-stock-grid">'+(rows.length?rows.map(inventoryCard).join(""):'<div class="ops-empty"><b>검색 결과가 없습니다.</b></div>')+'</div>';
  document.getElementById("opsInventoryAdd").onclick=()=>openInventoryEditor();document.getElementById("opsInventoryBulk").onclick=openInventoryBulk;
  body.querySelectorAll("[data-managed-stock]").forEach(button=>button.onclick=()=>openInventoryEditor(managedInventory[Number(button.dataset.managedStock)]));
  const search=document.getElementById("opsReferenceInventorySearch");search.oninput=e=>{inventoryQuery=e.target.value.trim().toLowerCase();renderInventory(true);const next=document.getElementById("opsReferenceInventorySearch");next.focus();next.setSelectionRange(next.value.length,next.value.length)};
  document.getElementById("opsReferenceInventoryCat").onchange=e=>{inventoryCategory=e.target.value;renderInventory(true)};
}

async function loadRegisteredRecipes(){registeredRecipes=(await BE.recipeList().catch(()=>[])).map(row=>({...row,menu_name:cleanExample(row.menu_name)}))}
function recipeCard(row,index,registered){
  const first=row.variants[0],preview=String(first?.content||"").split("\n").filter(Boolean).slice(0,3);
  return '<article class="ops-card ops-reference-recipe"><button type="button" class="ops-recipe-open" data-reference-recipe="'+index+'"><div class="ops-card-head"><div><small class="ops-recipe-cat">'+esc(row.category)+'</small><b>'+esc(row.menu_name)+'</b></div><span class="ops-reference-badge">'+row.variants.length+'종</span></div><div class="ops-recipe-variant-chips">'+row.variants.map(x=>'<span>'+esc(x.label)+'</span>').join("")+'</div><div class="ops-reference-preview">'+preview.map(x=>'<span>'+esc(x)+'</span>').join("")+'</div></button>'+(registered?'<button type="button" class="ops-recipe-edit" data-edit-recipe="'+registeredRecipes.indexOf(registered)+'" aria-label="'+esc(row.menu_name)+' 수정">✎</button>':"")+'</article>';
}
function customRecipeCard(row){
  const preview=(row.components||[]).slice(0,3).map(x=>esc(x.item_name||"재료")+' '+num(x.quantity)+' '+esc(x.unit||""));
  return '<article class="ops-card ops-reference-recipe ops-custom-recipe"><div class="ops-recipe-open ops-recipe-static"><div class="ops-card-head"><div><small class="ops-recipe-cat">'+esc(row.category||"직접 등록")+'</small><b>'+esc(row.menu_name)+'</b></div><span class="ops-reference-badge">등록</span></div><div class="ops-reference-preview">'+preview.map(x=>'<span>'+x+'</span>').join("")+'</div></div><button type="button" class="ops-recipe-edit" data-edit-recipe="'+registeredRecipes.indexOf(row)+'" aria-label="'+esc(row.menu_name)+' 수정">✎</button></article>';
}
function openRecipeDetail(row){
  const m=modal(row.menu_name,'<div class="ops-recipe-variant-grid">'+row.variants.map(v=>'<section><h3>'+esc(v.label)+'</h3><div>'+esc(v.content).replace(/\n/g,"<br>")+'</div></section>').join("")+'</div>');m.wrap.querySelector(".ops-modal-sheet").classList.add("ops-reference-recipe-sheet");
}
async function fileToWebp(file){
  if(!/^image\/(jpeg|png|webp|gif)$/.test(file.type))throw Error("JPG, PNG, WEBP, GIF 이미지만 선택할 수 있습니다.");if(file.size>12*1024*1024)throw Error("이미지 파일은 12MB 이하만 선택할 수 있습니다.");
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error("파일을 읽을 수 없습니다."));reader.onload=()=>{const img=new Image();img.onerror=()=>reject(Error("이미지를 읽을 수 없습니다."));img.onload=()=>{const max=720,scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext("2d").drawImage(img,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL("image/webp",.82))};img.src=String(reader.result)};reader.readAsDataURL(file)});
}
async function openRecipeEditor(recipe=null){
  const stock=await BE.inventoryOverview().catch(()=>[]),selected=new Map((recipe?.components||[]).map(x=>[Number(x.item_id),Number(x.quantity||0)]));
  if(!stock.length)return alert("레시피 재료로 선택할 재고 품목이 없습니다.");
  const ingredients=stock.map(x=>{const checked=selected.has(Number(x.id));return '<label class="ops-ingredient-row"><input type="checkbox" data-item="'+x.id+'" '+(checked?'checked':'')+'><span class="ops-ingredient-name"><b>'+esc(x.name)+'</b><small>잔고 '+num(x.on_hand)+' '+esc(x.unit)+'</small></span><input class="ops-ingredient-qty" type="number" min="0" step="0.01" data-qty="'+x.id+'" value="'+(checked?selected.get(Number(x.id)):"")+'" placeholder="사용량" '+(checked?'':'disabled')+'><em>'+esc(x.unit)+'</em></label>'}).join("");
  const m=modal(recipe?"레시피 수정":"레시피 등록",'<div class="ops-recipe-editor"><div class="ops-recipe-thumb-editor"><div class="ops-recipe-preview-wrap"><img id="unifiedRecipePreview" src="'+esc(recipe?.thumbnail_url||"")+'" alt=""></div><div><label>썸네일 URL<input id="unifiedRecipeThumbnail" value="'+esc(recipe?.thumbnail_url||"")+'" placeholder="https://..."></label><label class="btn btn-secondary btn-sm ops-thumb-file-btn">이미지 파일 선택<input id="unifiedRecipeFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden></label></div></div><label>메뉴 카테고리<input id="unifiedRecipeCategory" value="'+esc(recipe?.category||"")+'"></label><label>메뉴명<input id="unifiedRecipeName" value="'+esc(recipe?.menu_name||"")+'"></label><div class="ops-ingredient-head"><b>재료 선택</b><span>현재 잔고 기준</span></div><div class="ops-ingredient-list">'+ingredients+'</div><button type="button" class="btn btn-primary" id="unifiedRecipeSave">'+(recipe?"수정 저장":"레시피 등록")+'</button></div>');
  const thumb=m.body.querySelector("#unifiedRecipeThumbnail"),preview=m.body.querySelector("#unifiedRecipePreview"),file=m.body.querySelector("#unifiedRecipeFile");thumb.oninput=()=>preview.src=thumb.value.trim();file.onchange=async()=>{try{thumb.value=await fileToWebp(file.files[0]);preview.src=thumb.value}catch(error){alert(error.message);file.value=""}};
  m.body.querySelectorAll("[data-item]").forEach(check=>check.onchange=()=>{const qty=m.body.querySelector('[data-qty="'+check.dataset.item+'"]');qty.disabled=!check.checked;if(check.checked&&!qty.value)qty.value="1"});
  m.body.querySelector("#unifiedRecipeSave").onclick=async()=>{const name=m.body.querySelector("#unifiedRecipeName").value.trim(),components=[...m.body.querySelectorAll("[data-item]:checked")].map(check=>({item_id:Number(check.dataset.item),quantity:Number(m.body.querySelector('[data-qty="'+check.dataset.item+'"]')?.value||0)})).filter(x=>x.quantity>0);if(!name)return alert("메뉴명을 입력하세요.");if(!components.length)return alert("재료를 하나 이상 선택하세요.");try{await BE.recipeSave(recipe?.id||null,name,m.body.querySelector("#unifiedRecipeCategory").value.trim(),components,thumb.value.trim());m.close();await loadRegisteredRecipes();renderRecipes(true)}catch(error){alert("레시피 저장 실패: "+error.message)}};
}
async function renderRecipes(refresh=false){
  const body=refresh?document.getElementById("opsBody"):shell("레시피","공식 제조 기준과 직접 등록한 레시피를 한 화면에서 관리합니다.");if(!refresh)await loadRegisteredRecipes();
  const official=REF.recipes||[],officialNames=new Set(official.map(x=>x.menu_name)),registeredByName=new Map(registeredRecipes.map(x=>[x.menu_name,x])),custom=registeredRecipes.filter(x=>!officialNames.has(x.menu_name));
  const categories=["전체",...new Set([...official.map(x=>x.category),...registeredRecipes.map(x=>x.category).filter(Boolean)])];let rows=recipeCategory==="전체"?official:official.filter(x=>x.category===recipeCategory),customRows=recipeCategory==="전체"?custom:custom.filter(x=>x.category===recipeCategory);
  if(recipeQuery){const matches=x=>[x.menu_name,x.category,...(x.variants||[]).map(v=>v.content),...(x.components||[]).map(v=>v.item_name)].some(v=>String(v||"").toLowerCase().includes(recipeQuery));rows=rows.filter(matches);customRows=customRows.filter(matches)}
  body.innerHTML='<div class="ops-unified-section-head ops-recipe-manage-head"><div><b>레시피 목록</b><span>등록 '+registeredRecipes.length+'개</span></div><button type="button" class="btn btn-primary btn-sm" id="opsRecipeAdd">+ 레시피 등록</button></div><div class="ops-recipe-toolbar ops-reference-toolbar"><label>검색<input id="opsReferenceRecipeSearch" type="search" value="'+esc(recipeQuery)+'" placeholder="메뉴명·재료·조리법"></label><label>메뉴 카테고리<select id="opsReferenceRecipeCat">'+categories.map(x=>'<option '+(x===recipeCategory?'selected':'')+'>'+esc(x)+'</option>').join("")+'</select></label></div><div class="ops-reference-count">'+esc(recipeCategory)+' · '+(rows.length+customRows.length)+'개</div><div class="ops-reference-recipe-list">'+customRows.map(customRecipeCard).join("")+(rows.length?rows.map((row,index)=>recipeCard(row,index,registeredByName.get(row.menu_name))).join(""):(customRows.length?'':'<div class="ops-empty"><b>검색 결과가 없습니다.</b></div>'))+'</div>';
  document.getElementById("opsRecipeAdd").onclick=()=>openRecipeEditor();body.querySelectorAll("[data-reference-recipe]").forEach(button=>button.onclick=()=>openRecipeDetail(rows[Number(button.dataset.referenceRecipe)]));body.querySelectorAll("[data-edit-recipe]").forEach(button=>button.onclick=e=>{e.stopPropagation();openRecipeEditor(registeredRecipes[Number(button.dataset.editRecipe)])});
  const search=document.getElementById("opsReferenceRecipeSearch");search.oninput=e=>{recipeQuery=e.target.value.trim().toLowerCase();renderRecipes(true);const next=document.getElementById("opsReferenceRecipeSearch");next.focus();next.setSelectionRange(next.value.length,next.value.length)};document.getElementById("opsReferenceRecipeCat").onchange=e=>{recipeCategory=e.target.value;renderRecipes(true)};
}

function hqStatus(status){return status==="ACTIVE"?"출시 중":status==="DISCONTINUED"?"단종":"초안"}
function hqProductCard(row,index){
  const components=Array.isArray(row.component_blueprint)?row.component_blueprint:[],active=row.status==="ACTIVE",stopped=row.status==="DISCONTINUED";
  const actions=active?'<div class="ops-hq-actions"><button type="button" class="btn btn-secondary ops-hq-apply" data-hq-apply="'+index+'" data-action="LAUNCH">변경사항 전 지점 적용</button><button type="button" class="btn btn-danger ops-hq-apply" data-hq-apply="'+index+'" data-action="DISCONTINUE">전 지점 단종</button></div>':'<button type="button" class="btn btn-primary ops-hq-apply" data-hq-apply="'+index+'" data-action="LAUNCH">전 지점 '+(stopped?'재출시':'출시')+'</button>';
  return '<article class="ops-hq-product-card status-'+String(row.status||"draft").toLowerCase()+'"><div class="ops-hq-product-main"><div><span class="ops-hq-status">'+hqStatus(row.status)+'</span><small>'+esc(row.product_key)+'</small><h3>'+esc(row.name)+'</h3><p>'+esc(row.category||"미분류")+' · 재료 '+components.length+'개</p></div><button type="button" class="ops-recipe-edit ops-hq-edit" data-hq-edit="'+index+'" aria-label="'+esc(row.name)+' 수정">✎</button></div><div class="ops-hq-link-stats"><span>배포 <b>'+num(row.active_store_count)+' / '+num(row.total_store_count)+'개 지점</b></span><span>30일 매출 <b>'+num(row.sales_30d)+'원</b></span><span>30일 매입 <b>'+num(row.purchases_30d)+'원</b></span></div><div class="ops-hq-alias"><small>매출 연결</small><span>'+esc((row.sale_aliases||[]).join(", ")||"미설정")+'</span><small>매입 연결</small><span>'+esc((row.purchase_aliases||[]).join(", ")||"미설정")+'</span></div>'+actions+'</article>';
}
function hqComponentRow(component={}){
  const isNew=!component.item_id,options=hqInventory.map(x=>'<option value="'+x.id+'" '+(Number(component.item_id)===Number(x.id)?'selected':'')+'>'+esc(cleanExample(x.name))+' ('+esc(x.unit)+')</option>').join("");
  return '<div class="ops-hq-component '+(isNew?'is-new':'')+'"><select class="ops-hq-item"><option value="__new__" '+(isNew?'selected':'')+'>+ 신규 재고 품목</option>'+options+'</select><input class="ops-hq-qty" type="number" min="0.01" step="0.01" value="'+esc(component.quantity||"")+'" placeholder="레시피 사용량"><div class="ops-hq-new-fields"><input class="ops-hq-sku" value="'+esc(component.sku||"")+'" placeholder="신규 SKU"><input class="ops-hq-item-name" value="'+esc(component.name||"")+'" placeholder="신규 품목명"><input class="ops-hq-unit" value="'+esc(component.unit||"")+'" placeholder="단위 (g, ml, 개)"><input class="ops-hq-reorder" type="number" min="0" step="0.01" value="'+esc(component.reorder_level||"")+'" placeholder="발주 기준"></div><button type="button" class="ops-hq-remove" aria-label="재료 삭제">×</button></div>';
}
function bindHqComponent(row){
  const select=row.querySelector(".ops-hq-item");select.onchange=()=>row.classList.toggle("is-new",select.value==="__new__");
  row.querySelector(".ops-hq-remove").onclick=()=>row.remove();
}
async function openHqProductEditor(product=null){
  if(!hqInventory.length)hqInventory=(await BE.inventoryOverview().catch(()=>[])).filter(x=>!x.is_demo).map(x=>({...x,name:cleanExample(x.name)}));
  const components=Array.isArray(product?.component_blueprint)&&product.component_blueprint.length?product.component_blueprint:[{}];
  const m=modal(product?"본사 상품 수정":"본사 상품 등록",'<div class="ops-hq-editor"><div class="ops-hq-fields"><label>상품 코드<input id="hqProductKey" value="'+esc(product?.product_key||"")+'" placeholder="예: SUMMER-MELON-2026"></label><label>상품명<input id="hqProductName" value="'+esc(product?.name||"")+'" placeholder="전 지점에 표시할 메뉴명"></label><label>카테고리<input id="hqProductCategory" value="'+esc(product?.category||"")+'" placeholder="커피, 음료, 푸드"></label><label>매출 연결명<input id="hqSaleAliases" value="'+esc((product?.sale_aliases||[]).join(", "))+'" placeholder="POS 메뉴명, 쉼표로 구분"></label><label>매입 연결명<input id="hqPurchaseAliases" value="'+esc((product?.purchase_aliases||[]).join(", "))+'" placeholder="거래처·매입 품목명, 쉼표로 구분"></label></div><div class="ops-hq-component-head"><div><b>레시피·필요 재고</b><small>기존 재고를 선택하거나 출시와 함께 신규 품목을 만듭니다.</small></div><button type="button" class="btn btn-secondary btn-sm" id="hqAddComponent">+ 재료 추가</button></div><div id="hqComponents">'+components.map(hqComponentRow).join("")+'</div><div class="ops-hq-save-note">저장하면 초안이 갱신됩니다. ‘전 지점 출시’를 눌러야 활성 지점에 실제 배포됩니다.</div><button type="button" class="btn btn-primary btn-block" id="hqProductSave">초안 저장</button></div>');
  m.body.querySelectorAll(".ops-hq-component").forEach(bindHqComponent);
  m.body.querySelector("#hqAddComponent").onclick=()=>{const box=m.body.querySelector("#hqComponents");box.insertAdjacentHTML("beforeend",hqComponentRow());bindHqComponent(box.lastElementChild)};
  m.body.querySelector("#hqProductSave").onclick=async()=>{
    const split=id=>m.body.querySelector(id).value.split(",").map(x=>x.trim()).filter(Boolean),rows=[...m.body.querySelectorAll(".ops-hq-component")];
    const components=rows.map(row=>{const item=row.querySelector(".ops-hq-item").value,quantity=Number(row.querySelector(".ops-hq-qty").value||0);return item==="__new__"?{sku:row.querySelector(".ops-hq-sku").value.trim(),name:row.querySelector(".ops-hq-item-name").value.trim(),unit:row.querySelector(".ops-hq-unit").value.trim(),reorder_level:Number(row.querySelector(".ops-hq-reorder").value||0),quantity}:{item_id:Number(item),quantity}});
    const payload={product_key:m.body.querySelector("#hqProductKey").value.trim(),name:m.body.querySelector("#hqProductName").value.trim(),category:m.body.querySelector("#hqProductCategory").value.trim(),sale_aliases:split("#hqSaleAliases"),purchase_aliases:split("#hqPurchaseAliases"),components};
    if(!payload.product_key||!payload.name)return alert("상품 코드와 상품명을 입력하세요.");if(!components.length||components.some(x=>!x.quantity))return alert("모든 재료의 사용량을 입력하세요.");if(components.some(x=>!x.item_id&&(!x.sku||!x.name||!x.unit)))return alert("신규 재고의 SKU, 품목명, 단위를 입력하세요.");
    const button=m.body.querySelector("#hqProductSave");button.disabled=true;try{await BE.hqProductSave(product?.id||null,payload);m.close();await renderHqProducts(true)}catch(error){button.disabled=false;alert("상품 저장 실패: "+error.message)};
  };
}
async function applyHqProduct(product,action){
  const launch=action==="LAUNCH",label=launch?"출시":"단종",message=launch?product.name+"을(를) 모든 활성 지점에 출시할까요?\n레시피·재고·매출/매입 연결이 함께 적용됩니다.":product.name+"을(를) 모든 지점에서 단종할까요?\n과거 거래 이력은 보존됩니다.";
  if(!confirm(message))return;try{const result=await BE.hqProductApply(product.id,action);alert(label+" 완료 · "+num(result?.affected_store_count)+"개 지점 반영");await renderHqProducts(true)}catch(error){alert(label+" 실패: "+error.message)}
}
async function renderHqProducts(refresh=false){
  const body=refresh?document.getElementById("opsBody"):shell("상품 중앙통제","신제품 출시와 단종을 레시피·재고·매출·매입 연결까지 묶어 전 지점에 적용합니다.");
  hqProducts=await BE.hqProductList().catch(error=>{body.innerHTML='<div class="ops-empty"><b>상품 정보를 불러오지 못했습니다.</b><span>'+esc(error.message)+'</span></div>';return null});if(!hqProducts)return;
  const active=hqProducts.filter(x=>x.status==="ACTIVE").length,draft=hqProducts.filter(x=>x.status==="DRAFT").length;
  const storeCount=hqProducts.length?num(hqProducts[0].total_store_count)+"개":"상품 출시 시 자동 계산";
  body.innerHTML='<div class="ops-hq-summary"><div><span>출시 중</span><b>'+active+'개</b></div><div><span>배포 대기</span><b>'+draft+'개</b></div><div><span>활성 지점</span><b>'+storeCount+'</b></div></div><div class="ops-unified-section-head ops-hq-head"><div><b>상품 마스터</b><span>출시·단종 이력은 보존됩니다.</span></div><button type="button" class="btn btn-primary" id="hqProductAdd">+ 신제품 등록</button></div><div class="ops-hq-product-list">'+(hqProducts.length?hqProducts.map(hqProductCard).join(""):'<div class="ops-empty"><b>등록된 본사 상품이 없습니다.</b><span>신제품을 등록해 전 지점 배포를 시작하세요.</span></div>')+'</div>';
  document.getElementById("hqProductAdd").onclick=()=>openHqProductEditor();body.querySelectorAll("[data-hq-edit]").forEach(button=>button.onclick=()=>openHqProductEditor(hqProducts[Number(button.dataset.hqEdit)]));body.querySelectorAll("[data-hq-apply]").forEach(button=>button.onclick=()=>applyHqProduct(hqProducts[Number(button.dataset.hqApply)],button.dataset.action));
}

window.renderOperations=async tab=>tab==="inventory"?renderInventory():tab==="recipe"?renderRecipes():tab==="products"?renderHqProducts():originalRender(tab);
})();
