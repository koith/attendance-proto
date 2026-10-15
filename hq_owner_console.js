/* Dedicated HQ representative manager console. Existing backend authorization remains authoritative. */
(function(){
"use strict";
const h=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function rpc(name,args={}){
 const r=await fetch(CONFIG.SUPABASE_URL+"/rest/v1/rpc/"+name,{method:"POST",headers:{apikey:CONFIG.SUPABASE_ANON_KEY,Authorization:"Bearer "+Auth.token,"Content-Type":"application/json"},body:JSON.stringify(args)});
 const data=await r.json().catch(()=>null);if(!r.ok)throw Error(data?.message||name+" "+r.status);return data;
}
async function invite(email,store_id){
 const r=await fetch(CONFIG.SUPABASE_URL+"/functions/v1/server-sync-sheet",{method:"POST",headers:{Authorization:"Bearer "+Auth.token,"Content-Type":"application/json"},body:JSON.stringify({mode:"invite_store_manager",email,store_id})});
 const d=await r.json().catch(()=>null);if(!r.ok||d?.ok!==true)throw Error(d?.error||"INVITE_FAILED");
}
window.mountHqOwnerConsole=async function(box){
 // Reopening the HQ panel must clean up keyboard listeners from its prior mount.
 box.__hqOwnerKeyboardCleanup?.();
 let stores=[],managers=[],owners=[],accounts=[],selected=0,search="",filter="ALL",busy=false,notice=null,quickMode="",province="",district="",subdistrict="",quickLetter="ㄱ";
 const RECENTS_KEY="hq_owner_recent_stores_v1";
 const readRecents=()=>{try{return JSON.parse(localStorage.getItem(RECENTS_KEY)||"[]").filter(Number.isFinite).slice(0,5)}catch{return []}};
 const remember=id=>{try{localStorage.setItem(RECENTS_KEY,JSON.stringify([id,...readRecents().filter(x=>x!==id)].slice(0,5)))}catch{}};
 const PROVINCES={"서울":"서울특별시","부산":"부산광역시","대구":"대구광역시","인천":"인천광역시","광주":"전남광주통합특별시","대전":"대전광역시","울산":"울산광역시","세종":"세종특별자치시","경기":"경기도","강원":"강원특별자치도","충북":"충청북도","충남":"충청남도","전북":"전북특별자치도","전남":"전남광주통합특별시","경북":"경상북도","경남":"경상남도","제주":"제주특별자치도"};
 const normalizeProvince=v=>({광주광역시:"전남광주통합특별시",전라남도:"전남광주통합특별시",전남광주:"전남광주통합특별시"}[v]||PROVINCES[v]||Object.values(PROVINCES).find(p=>p===v)||"");
 // Only HQ-verified physical addresses establish administrative geography.
 // 'region_group' is a sales territory and must NEVER be used as a province.
 const region=s=>({province:s.is_sample&&!s.province?"시연 지점":normalizeProvince(String(s.province||"").trim())||"주소 미확인",district:String(s.district||"").trim(),subdistrict:String(s.subdistrict||"").trim()});
 const ADMIN_DISTRICTS={
 "서울특별시":"종로구 중구 용산구 성동구 광진구 동대문구 중랑구 성북구 강북구 도봉구 노원구 은평구 서대문구 마포구 양천구 강서구 구로구 금천구 영등포구 동작구 관악구 서초구 강남구 송파구 강동구".split(" "),
 "부산광역시":"중구 서구 동구 영도구 부산진구 동래구 남구 북구 해운대구 사하구 금정구 강서구 연제구 수영구 사상구 기장군".split(" "),
 "대구광역시":"중구 동구 서구 남구 북구 수성구 달서구 달성군 군위군".split(" "),
 "인천광역시":"미추홀구 연수구 남동구 부평구 계양구 강화군 옹진군 영종구 제물포구 서해구 검단구".split(" "),
 "광주광역시":"동구 서구 남구 북구 광산구".split(" "),
 "대전광역시":"동구 중구 서구 유성구 대덕구".split(" "),
 "울산광역시":"중구 남구 동구 북구 울주군".split(" "),
 "세종특별자치시":[],
 "경기도":"수원시 성남시 의정부시 안양시 부천시 광명시 평택시 동두천시 안산시 고양시 과천시 구리시 남양주시 오산시 시흥시 군포시 의왕시 하남시 용인시 파주시 이천시 안성시 김포시 화성시 광주시 양주시 포천시 여주시 연천군 가평군 양평군".split(" "),
 "강원특별자치도":"춘천시 원주시 강릉시 동해시 태백시 속초시 삼척시 홍천군 횡성군 영월군 평창군 정선군 철원군 화천군 양구군 인제군 고성군 양양군".split(" "),
 "충청북도":"청주시 충주시 제천시 보은군 옥천군 영동군 증평군 진천군 괴산군 음성군 단양군".split(" "),
 "충청남도":"천안시 공주시 보령시 아산시 서산시 논산시 계룡시 당진시 금산군 부여군 서천군 청양군 홍성군 예산군 태안군".split(" "),
 "전북특별자치도":"전주시 군산시 익산시 정읍시 남원시 김제시 완주군 진안군 무주군 장수군 임실군 순창군 고창군 부안군".split(" "),
 "전라남도":"목포시 여수시 순천시 나주시 광양시 담양군 곡성군 구례군 고흥군 보성군 화순군 장흥군 강진군 해남군 영암군 무안군 함평군 영광군 장성군 완도군 진도군 신안군".split(" "),
 "경상북도":"포항시 경주시 김천시 안동시 구미시 영주시 영천시 상주시 문경시 경산시 의성군 청송군 영양군 영덕군 청도군 고령군 성주군 칠곡군 예천군 봉화군 울진군 울릉군".split(" "),
 "경상남도":"창원시 진주시 통영시 사천시 김해시 밀양시 거제시 양산시 의령군 함안군 창녕군 고성군 남해군 하동군 산청군 함양군 거창군 합천군".split(" "),
 "제주특별자치도":"제주시 서귀포시".split(" ")
 };
 // Effective 2026-07-01: Gwangju and Jeonnam share one province; keep legacy aliases for unchanged stored records.
 ADMIN_DISTRICTS["전남광주통합특별시"]=[...new Set([...ADMIN_DISTRICTS["광주광역시"],...ADMIN_DISTRICTS["전라남도"]])];
 const SUB_DISTRICTS={
 "경기도":{"부천시":"원미구 소사구 오정구","수원시":"장안구 권선구 팔달구 영통구","성남시":"수정구 중원구 분당구","안양시":"만안구 동안구","안산시":"상록구 단원구","고양시":"덕양구 일산동구 일산서구","용인시":"처인구 기흥구 수지구"},
 "충청북도":{"청주시":"상당구 서원구 흥덕구 청원구"},
 "충청남도":{"천안시":"동남구 서북구"},
 "전북특별자치도":{"전주시":"완산구 덕진구"},
 "경상북도":{"포항시":"남구 북구"},
 "경상남도":{"창원시":"의창구 성산구 마산합포구 마산회원구 진해구"}
 };
 // Region hierarchy is authoritative: do not attach a store to unrelated districts.
 const validRegion=s=>{const r=region(s);if(r.province==="주소 미확인"||r.province==="시연 지점")return !r.district&&!r.subdistrict?r:null;if(!ADMIN_DISTRICTS[r.province]||r.district&&!ADMIN_DISTRICTS[r.province].includes(r.district))return null;const children=(SUB_DISTRICTS[r.province]?.[r.district]||"").split(" ").filter(Boolean);if(r.subdistrict&&(!r.district||!children.includes(r.subdistrict)))return null;return r};
 const resetQuickFilters=()=>{province="";district="";subdistrict="";quickLetter=""};
 const closeQuickPicker=()=>{
   const originatingMode=quickMode;
   quickMode="";stopOutsideKeys();resetQuickFilters();render();
   if(originatingMode)body.querySelector('[data-quick-mode="'+originatingMode+'"]')?.focus();
 };
 const handleQuickKey=event=>{
   if(!quickMode)return;
   const dialog=box.querySelector(".hq-quick-dialog");
   if(!dialog)return;
   if(event.key==="Escape"){
     event.preventDefault();event.stopPropagation();
     closeQuickPicker();
     return;
   }
   if(event.key!=="Tab")return;
   const focusable=[...dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter(el=>el.tabIndex>=0&&!el.hidden&&el.getClientRects().length&&getComputedStyle(el).visibility!=="hidden");
   if(!focusable.length){event.preventDefault();return;}
   const first=focusable[0],last=focusable[focusable.length-1],active=document.activeElement;
   if(!dialog.contains(active)){
     event.preventDefault();
     (event.shiftKey?last:first).focus();
   }else if(event.shiftKey&&active===first){
     event.preventDefault();last.focus();
   }else if(!event.shiftKey&&active===last){
     event.preventDefault();first.focus();
   }
 };
 // Keep delegation on this stable owner console container, not transient
 // dropdown nodes that are replaced whenever a province/district changes.
 const keyboardController=new AbortController();
 box.addEventListener("keydown",event=>{
   if(event.key!=="Escape"&&event.key!=="Tab")return;
   if(!event.target?.closest?.(".hq-quick-overlay"))return;
   handleQuickKey(event);
 },{signal:keyboardController.signal});
 // Only capture keys outside this box while its quick picker is visible.
 // If a native select rerender blurs focus to body, Escape still works.
 // Unrelated inputs and overlays must not be hijacked.
 const quickVeil=box.closest("#accountVeil");
 let outsideListening=false;
 const quickObserver=new MutationObserver(()=>{
   if(!box.isConnected||(quickVeil&&!quickVeil.classList.contains("show"))){
     quickMode="";resetQuickFilters();stopOutsideKeys();
   }
 });
 const outsideQuickKeys=event=>{
   if(!box.isConnected||(quickVeil&&!quickVeil.classList.contains("show"))){
     quickMode="";resetQuickFilters();stopOutsideKeys();return;
   }
   if(box.contains(event.target))return;
   if(event.target!==document.body&&event.target!==document.documentElement)return;
   handleQuickKey(event);
 };
 const stopOutsideKeys=()=>{
   if(outsideListening)document.removeEventListener("keydown",outsideQuickKeys);
   outsideListening=false;
   quickObserver.disconnect();
 };
 const startOutsideKeys=()=>{
   if(outsideListening||!box.isConnected||(quickVeil&&!quickVeil.classList.contains("show")))return;
   document.addEventListener("keydown",outsideQuickKeys);
   outsideListening=true;
   if(quickVeil)quickObserver.observe(quickVeil,{attributes:true,attributeFilter:["class"]});
   quickObserver.observe(document.body,{childList:true,subtree:true});
 };
 box.__hqOwnerKeyboardCleanup=()=>{stopOutsideKeys();quickMode="";keyboardController.abort()};
 const chose=id=>{selected=Number(id);remember(selected);render()};
 box.innerHTML='<div class="hq-owner-console"><h2>지점 대표 관리자 관리</h2><p>지점별 대표 점주를 확인하고 초대·지정할 수 있습니다.</p><div id="hqOwnerBody">불러오는 중…</div></div>';
 const body=box.querySelector("#hqOwnerBody"); const summary=document.getElementById("hqOwnerPinnedSummary");
 const owner=id=>{const uid=owners.find(x=>Number(x.store_id)===Number(id))?.user_id;return managers.find(x=>Number(x.store_id)===Number(id)&&x.user_id===uid)};
 async function load(){const data=await Promise.all([rpc("hq_stores_onboarding_list"),rpc("hq_store_manager_list"),rpc("hq_store_primary_owner_list"),BE.listAuthUsers(),rpc("hq_store_locations_list")]);if(!data.every(Array.isArray))throw Error("INVALID_HQ_RESPONSE");[stores,managers,owners,accounts]=data;const locations=new Map(data[4].map(l=>[Number(l.store_id),l]));const flagRows=await rpc("hq_store_sample_flags_list").catch(()=>[]);const samples=new Set((Array.isArray(flagRows)?flagRows:[]).filter(x=>x.is_sample===true).map(x=>Number(x.store_id)));stores=stores.filter(s=>!samples.has(Number(s.id))).map(s=>Object.assign({},s,locations.get(Number(s.id))||{},{is_sample:false}));render();}
 const friendlyError=e=>{const message=String(e?.message||e||"");if(/already been registered|already registered|user already exists|email_exists|INVITE_FAILED.*registered/i.test(message))return "이미 가입된 이메일입니다. 신규 초대 대신 기존 계정 목록에서 선택하세요. 본사 관리자 계정은 지점 점주로 연결할 수 없습니다.";if(/CANNOT_DOWNGRADE_HQ/i.test(message))return "본사 관리자 계정은 지점 점주로 연결할 수 없습니다. 일반 계정을 선택하세요.";return message;};
 async function run(fn,onSuccess){if(busy)return;busy=true;try{await fn();if(onSuccess)onSuccess();await load();}catch(e){alert("처리 실패: "+friendlyError(e))}finally{busy=false}}
 function render(){
 const scrollContainer=body.closest("#adAccount");
 const modalScroll=scrollContainer?.scrollTop??0;
 const previousList=body.querySelector(".hq-owner-list");
 const listScroll=previousList?.scrollTop??0;
 const rows=stores.filter(s=>(filter==="ALL"||(filter==="ASSIGNED"?!!owner(s.id):!owner(s.id)))&&[s.name,s.code,s.region_group,s.id].some(v=>String(v??"").toLowerCase().includes(search.toLowerCase())));
 const regions=[...new Set(Object.values(PROVINCES)),"주소 미확인"];
 const districts=ADMIN_DISTRICTS[province]||[];
 const regionStores=stores.filter(s=>{const r=validRegion(s);return r&&r.province===province&&(!district||r.district===district)&&(!subdistrict||r.subdistrict===subdistrict)}).sort((a,b)=>String(a.name).localeCompare(String(b.name),"ko"));
 const subdivisions=(SUB_DISTRICTS[province]?.[district]||"").split(" ").filter(Boolean);
 const recentStores=readRecents().map(id=>stores.find(s=>Number(s.id)===id)).filter(Boolean);
 const letters=["ㄱ","ㄴ","ㄷ","ㄹ","ㅁ","ㅂ","ㅅ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
 const initial=name=>{const c=String(name||"").trim().charCodeAt(0);return c>=0xAC00&&c<=0xD7A3?letters[Math.floor((c-0xAC00)/588)]:String(name||"").trim()[0]||"#"};
 const letterStores=stores.filter(s=>initial(s.name)===quickLetter).sort((a,b)=>String(a.name).localeCompare(String(b.name),"ko"));
 const quickItem=s=>'<button type="button" class="hq-quick-store'+(Number(s.id)===selected?' selected':'')+'" data-quick-store="'+Number(s.id)+'"><span>'+h(s.name)+'</span><small>'+h([region(s).province,region(s).district,region(s).subdistrict].filter(Boolean).join(' · ')+(s.address?'':' · 지점명 기준 · 상세주소 미확인'))+'</small></button>';
 const quickTitle=quickMode==="region"?"지역별 찾기":quickMode==="initial"?"가나다순 찾기":"최근 지점";
 const quickPanel=quickMode==="region"?'<div class="hq-quick-panel"><div class="hq-quick-selects"><label>시·도<select id="hqQuickProvince" class="form-control"><option value="">지역 선택</option>'+regions.map(x=>'<option value="'+h(x)+'"'+(province===x?' selected':'')+'>'+h(x)+'</option>').join("")+'</select></label><label>시·군·구<select id="hqQuickDistrict" class="form-control" '+(province?'':'disabled')+'><option value="">전체 지역</option>'+districts.map(x=>'<option value="'+h(x)+'"'+(district===x?' selected':'')+'>'+h(x)+'</option>').join("")+'</select></label>'+(subdivisions.length?'<label>구<select id="hqQuickSubdistrict" class="form-control"><option value="">전체 구</option>'+subdivisions.map(x=>'<option value="'+h(x)+'"'+(subdistrict===x?' selected':'')+'>'+h(x)+'</option>').join("")+'</select></label>':'')+'</div><div class="hq-quick-results">'+(province?'<p class="hq-owner-help">시·군·구는 실제 행정구역 목록입니다. 상세주소가 없는 지점은 지점명으로 확정 가능한 시·도 및 시·군·구까지만 검색하며 ‘지점명 기준 · 상세주소 미확인’으로 표시합니다.</p>'+(regionStores.length?regionStores.map(quickItem).join(""):'<p class="hq-owner-help">해당 지역에 연결 가능한 지점이 없습니다. 확실하지 않은 주소를 임의로 매핑하지 않습니다.</p>'):'<p class="hq-owner-help">시·도를 선택하세요.</p>')+'</div></div>':
 quickMode==="initial"?'<div class="hq-quick-panel"><div class="hq-quick-letters">'+letters.map(x=>'<button type="button" data-letter="'+x+'" class="'+(quickLetter===x?'active':'')+'">'+x+'</button>').join("")+'</div><div class="hq-quick-results">'+(quickLetter?letterStores.map(quickItem).join(""):'<p class="hq-owner-help">초성을 누르면 해당 지점이 나타납니다.</p>')+'</div></div>':
 quickMode==="recent"?'<div class="hq-quick-panel"><div class="hq-quick-results">'+(recentStores.length?recentStores.map(quickItem).join(""):'<p class="hq-owner-help">선택했던 지점이 여기에 최대 5개 표시됩니다.</p>')+'</div></div>':'';
 const store=stores.find(s=>Number(s.id)===selected),current=store?owner(selected):null,linked=managers.filter(x=>Number(x.store_id)===selected);
 const eligibleAccounts=accounts.filter(a=>!a.is_admin && a.email);
 const hqAccounts=accounts.filter(a=>a.is_admin && a.email);
 const inviteProgress=linked.filter(m=>m.email).map(m=>({email:m.email,representative:!!(current&&current.user_id===m.user_id)}));
 if(summary)summary.innerHTML='<span>전체 '+stores.length+'곳</span><span>대표 배정 '+stores.filter(s=>owner(s.id)).length+'곳</span><span>미배정 '+stores.filter(s=>!owner(s.id)).length+'곳</span>';
 body.innerHTML=(notice?'<div class="hq-owner-help" role="status" aria-live="polite" style="border:1px solid #91b9a0;border-radius:12px;padding:14px;margin-bottom:12px;background:#eef7f0;color:#214e32"><strong>'+h(notice.title)+'</strong><p>'+h(notice.message)+'</p><button type="button" class="btn btn-secondary btn-sm" id="hqOwnerDismiss">확인</button></div>':'')+'<div class="hq-owner-filters"><input class="form-control" id="hqOwnerSearch" type="search" placeholder="지점명·코드·지역 검색" value="'+h(search)+'"><select class="form-control" id="hqOwnerFilter"><option value="ALL">전체</option><option value="MISSING">대표 미배정</option><option value="ASSIGNED">배정 완료</option></select></div>'+
 '<p class="hq-owner-help" role="status">주소 확인 '+stores.filter(s=>!!s.address).length+'개 · 상세주소 미확인 '+stores.filter(s=>!s.address).length+'개 (지점명 지역 검색 지원)</p><div class="hq-owner-quicknav" aria-label="빠른 지점 선택"><button type="button" data-quick-mode="region" class="'+(quickMode==="region"?"active":"")+'">지역별 찾기</button><button type="button" data-quick-mode="initial" class="'+(quickMode==="initial"?"active":"")+'">가나다순</button><button type="button" data-quick-mode="recent" class="'+(quickMode==="recent"?"active":"")+'">최근 지점</button></div>'+(quickMode?'<div class="hq-quick-overlay"><section class="hq-quick-dialog" role="dialog" aria-modal="true" aria-label="빠른 지점 찾기"><div class="hq-quick-dialog-head"><strong>'+h(quickTitle)+'</strong><button id="hqQuickClose" type="button">닫기</button></div>'+quickPanel+'</section></div>':'')+'<div class="hq-owner-columns"><div class="hq-owner-list">'+rows.map(s=>'<button type="button" class="hq-owner-row'+(selected===Number(s.id)?' active':'')+'" data-store="'+Number(s.id)+'"><strong>'+h(s.name)+'</strong><span class="hq-owner-status '+(owner(s.id)?'assigned':'unassigned')+'">'+(owner(s.id)?'대표 배정':'미배정')+'</span></button>').join("")+'</div>'+
 '<div class="hq-owner-detail">'+(store?'<h3>'+h(store.name)+'</h3><p>대표 관리자: <strong>'+(current?h(current.email||"대표 지정됨"):"미배정")+'</strong></p>'+
 '<div class="hq-owner-help" role="status"><strong>대표 지정</strong><p>① 계정 연결 또는 이메일 초대 → ② 대표 지정</p></div><label for="hqOwnerEmail">이메일 초대</label><input class="form-control" id="hqOwnerEmail" type="email" placeholder="owner@example.com"><div class="hq-owner-buttons"><button class="btn btn-primary btn-sm" id="hqOwnerInvite">이메일 초대</button></div>'+ 
 '<label for="hqExistingAccount">기존 일반 계정 연결 ('+eligibleAccounts.length+'개)</label><select class="form-control" id="hqExistingAccount"><option value="">계정을 선택하세요</option>'+eligibleAccounts.map(a=>'<option value="'+h(a.email)+'">'+h(a.email)+'</option>').join("")+'</select><div class="hq-owner-buttons"><button class="btn btn-secondary btn-sm" id="hqOwnerAssign">선택 계정 연결</button></div>'+ 
 ''+
 '<section class="hq-owner-tracking"><h4>연결된 계정</h4>'+ (inviteProgress.length?inviteProgress.map(m=>'<div class="hq-owner-track"><strong>'+h(m.email)+'</strong><span> · '+(m.representative?'대표 지정 완료':'대표 미지정 · 지점 연결됨')+'</span></div>').join(''):'<p>현재 연결된 계정이 없습니다. 이메일 초대 또는 기존 계정 연결을 진행하세요.</p>')+'</section><div class="hq-owner-linked">'+linked.map(m=>'<div><span>'+h(m.email)+'</span>'+(current?.user_id===m.user_id?'<small>대표</small>':'<button class="btn btn-secondary btn-sm" data-primary="'+h(m.user_id)+'">대표 지정</button><button class="btn btn-secondary btn-sm" data-revoke="'+h(m.user_id)+'">해제</button>')+'</div>').join("")+'</div>':
 '<p class="hq-owner-help">왼쪽에서 지점을 선택하세요.</p>')+'</div></div>';
 if(quickMode)startOutsideKeys();else stopOutsideKeys();
 if(scrollContainer)scrollContainer.scrollTop=modalScroll;
 const currentList=body.querySelector(".hq-owner-list");if(currentList)currentList.scrollTop=listScroll;
 body.querySelector("#hqOwnerDismiss")?.addEventListener("click",()=>{notice=null;render()});
 body.querySelectorAll("[data-quick-mode]").forEach(b=>b.onclick=()=>{const opening=quickMode!==b.dataset.quickMode;quickMode=opening?b.dataset.quickMode:"";resetQuickFilters();render();if(opening)body.querySelector("#hqQuickClose")?.focus()});
 body.querySelector("#hqQuickClose")?.addEventListener("click",closeQuickPicker);
 body.querySelector("#hqQuickProvince")?.addEventListener("change",e=>{province=e.target.value;district="";subdistrict="";render()});
 body.querySelector("#hqQuickDistrict")?.addEventListener("change",e=>{district=e.target.value;subdistrict="";render()});
 body.querySelector("#hqQuickSubdistrict")?.addEventListener("change",e=>{subdistrict=e.target.value;render()});
 body.querySelectorAll("[data-letter]").forEach(b=>b.onclick=()=>{quickLetter=b.dataset.letter;render()});
 body.querySelectorAll("[data-quick-store]").forEach(b=>b.onclick=()=>{quickMode="";resetQuickFilters();chose(b.dataset.quickStore)});
 body.querySelector("#hqOwnerFilter").value=filter;
 body.querySelector("#hqOwnerFilter").onchange=e=>{filter=e.target.value;render()};
 body.querySelector("#hqOwnerSearch").oninput=e=>{search=e.target.value;const pos=e.target.selectionStart;render();const input=body.querySelector("#hqOwnerSearch");input.focus();input.setSelectionRange(pos,pos)};
 body.querySelectorAll("[data-store]").forEach(b=>b.onclick=()=>{chose(b.dataset.store)});
 if(!store)return;
 const email=()=>body.querySelector("#hqOwnerEmail").value.trim().toLowerCase();
 body.querySelector("#hqOwnerInvite").onclick=()=>{const v=email();if(!v||!body.querySelector("#hqOwnerEmail").checkValidity())return alert("올바른 이메일을 입력하세요.");const found=accounts.find(a=>String(a.email||"").toLowerCase()===v);if(found)return alert(found.is_admin?"현재 서버 계정 목록에서 본사 관리자 권한으로 조회됩니다. 초대하려는 지점: "+store.name+"\n\n이 이메일을 방금 처음 초대했더라도 기존에 계정이 생성되었거나 권한 정보가 잘못 등록됐을 수 있습니다. 본사 권한을 자동 변경하지 않도록 연결을 중단했습니다. 본사 계정 관리에서 해당 이메일의 실제 권한을 확인한 뒤 수정해야 합니다.":"이미 가입된 일반 계정입니다. 아래 ‘기존 일반 계정 연결’ 목록에서 선택하세요.");if(confirm(h(store.name)+" 지점의 대표 점주로 "+v+" 주소를 초대하시겠습니까?")){const targetStore=store.name;run(()=>invite(v,selected),()=>{notice={title:"초대 요청이 접수되었습니다",message:targetStore+" · "+v+" 주소로 초대 요청이 성공적으로 처리되었습니다. 상대방의 가입·이메일 확인 후 지점 권한 연결 및 대표 지정 상태를 확인하세요. 현재 ‘대표 미배정’은 초대 실패를 뜻하지 않습니다."};});}};
 body.querySelector("#hqOwnerAssign").onclick=()=>{const v=body.querySelector("#hqExistingAccount").value;if(!v)return alert("연결할 계정을 목록에서 선택하세요.");if(confirm(v+" 계정을 연결하시겠습니까?"))run(async()=>{const d=await rpc("hq_store_manager_assign",{p_email:v,p_store_id:selected});if(!d?.ok)throw Error(d?.error||"ASSIGN_FAILED")})};
 body.querySelectorAll("[data-primary]").forEach(b=>b.onclick=()=>{if(confirm("대표 점주로 지정하시겠습니까?"))run(()=>rpc("hq_store_primary_owner_set",{p_store_id:selected,p_user_id:b.dataset.primary}))});
 body.querySelectorAll("[data-revoke]").forEach(b=>b.onclick=()=>{if(confirm("점주 권한을 해제하시겠습니까?"))run(()=>rpc("hq_store_manager_revoke",{p_user_id:b.dataset.revoke}))});
 }
 try{await load()}catch(e){body.textContent="관리자 목록을 불러오지 못했습니다: "+e.message}
};
})();