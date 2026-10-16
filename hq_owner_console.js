/* Dedicated HQ representative manager console. Existing backend authorization remains authoritative. */
(function(){
"use strict";
const h=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function rpc(name,args={}){
 const r=await fetch(CONFIG.SUPABASE_URL+"/rest/v1/rpc/"+name,{method:"POST",headers:{apikey:CONFIG.SUPABASE_ANON_KEY,Authorization:"Bearer "+Auth.token,"Content-Type":"application/json"},body:JSON.stringify(args)});
 const data=await r.json().catch(()=>null);if(!r.ok)throw Error(data?.message||name+" "+r.status);return data;
}
async function invite(email,store_id,invitationRole="OWNER"){
 const r=await fetch(CONFIG.SUPABASE_URL+"/functions/v1/server-sync-sheet",{method:"POST",headers:{Authorization:"Bearer "+Auth.token,"Content-Type":"application/json"},body:JSON.stringify({mode:invitationRole==="ASSISTANT"?"invite_store_assistant_by_hq":"invite_store_manager",email,store_id})});
 const d=await r.json().catch(()=>null);if(!r.ok||d?.ok!==true)throw Error(d?.error||"INVITE_FAILED");
}
window.mountHqOwnerConsole=async function(box){
 // Reopening the HQ panel must clean up keyboard listeners from its prior mount.
 box.__hqOwnerKeyboardCleanup?.();
 let stores=[],managers=[],owners=[],accounts=[],managerEligibility=[],ownerInvitations=[],directory=[],selected=0,activeTab="status",search="",filter="ALL",busy=false,notice=null,quickMode="",province="",district="",subdistrict="",quickLetter="ㄱ";
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
 const chose=id=>{selected=Number(id);activeTab="status";notice=null;remember(selected);render()};
 box.innerHTML=`<div class="hq-owner-console"><h2>지점 관리</h2><style id="hqManagerTabsStyle">
.hq-owner-detail .hq-manager-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin:14px 0}
.hq-owner-detail .hq-manager-tab{min-height:43px;padding:8px 4px;border:1px solid var(--border,#d8e2db);border-radius:10px;background:var(--surface,#fff);color:var(--text,#203a29);font-size:.81rem;font-weight:650;cursor:pointer}
.hq-owner-detail .hq-manager-tab.is-active{background:var(--brand-700,#205e3d);border-color:var(--brand-700,#205e3d);color:#fff}
.hq-manager-status-panel h4,.hq-manager-invite-panel h4{margin:17px 0 8px;font-size:.94rem}
.hq-manager-status-panel h4 small{font-size:.73rem;color:var(--text-muted,#64766c);font-weight:400;display:inline}
.hq-manager-roster-row,.hq-manager-pending-row,.hq-manager-remove-row,.hq-manager-invite-row{border:1px solid var(--border,#dce5dd);border-radius:11px;padding:12px;margin:7px 0;background:var(--surface,#fff);display:flex;align-items:center;gap:9px;justify-content:space-between;overflow-wrap:anywhere}
.hq-manager-roster-row>div,.hq-manager-remove-row>span,.hq-manager-invite-row>span{min-width:0;flex:1}
.hq-manager-roster-row strong,.hq-manager-pending-row strong,.hq-manager-remove-row strong,.hq-manager-invite-row strong{font-size:.83rem}
.hq-manager-roster-row p,.hq-manager-pending-row p,.hq-manager-remove-row small,.hq-manager-invite-row small{display:block;margin:5px 0 0;font-size:.73rem;color:var(--text-muted,#64766c);line-height:1.5}
.hq-manager-roster-tag{border-radius:18px;padding:5px 9px;background:#f4eace;font-size:.72rem;color:#6a521e;flex:none}
.hq-manager-pending-row{display:block;background:var(--surface-muted,#f3f7f4);border-style:dashed}
.hq-manager-remove-row .btn,.hq-manager-invite-row .btn{flex:none;min-height:38px}
.hq-manager-remove-panel .btn[data-manager-remove]{color:#b42318;border-color:#ba483d}
.hq-manager-invite-panel label{display:block;margin:12px 0 5px}
.hq-owner-detail>h3.hq-manager-store-head{background:#26583a;color:#fff!important;margin:-12px -12px 14px;padding:18px 16px;border-radius:12px 12px 0 0;line-height:1.45;overflow-wrap:anywhere}
.hq-manager-roster-row,.hq-manager-pending-row{display:block}
.hq-manager-roster-row .hq-manager-inline,.hq-manager-pending-row .hq-manager-inline{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.hq-manager-roster-row .hq-manager-inline strong,.hq-manager-pending-row .hq-manager-inline strong{min-width:0;overflow-wrap:anywhere}
.hq-manager-roster-tag{display:inline-flex;align-items:center;justify-content:center;background:#e8f1eb;color:#205939;border:1px solid #b9d9c4;border-radius:16px;white-space:nowrap;padding:3px 9px;font-size:.73rem;font-weight:750}
.hq-manager-roster-tag.is-owner{background:#fff5d9;color:#74531c;border-color:#e9d29a}
.hq-manager-roster-row p{display:none}
.hq-manager-pending-row p{font-size:.78rem;margin:9px 0 0}
.hq-manager-empty{display:flex;min-height:108px;justify-content:center;align-items:center;text-align:center;color:var(--text-muted,#64766c);font-size:.85rem}
.hq-manager-invite-row .hq-manager-invite-actions{display:flex;flex-wrap:wrap;align-items:center;gap:8px;width:100%}
.hq-manager-invite-panel .hq-manager-invite-row{display:flex;flex-direction:column;align-items:stretch;gap:12px;padding:14px 12px}
.hq-manager-invite-panel .hq-manager-invite-row>span{display:flex;flex-direction:column;align-items:stretch;width:100%;min-width:0}
.hq-manager-invite-panel .hq-manager-invite-row strong{display:block;overflow-wrap:anywhere;word-break:break-word;font-size:.9rem;line-height:1.5}
.hq-manager-invite-panel .hq-manager-invite-row small{display:block;margin-top:6px;font-size:.78rem}
.hq-manager-invite-panel .hq-manager-invite-actions .btn{flex:1 1 0;min-width:0;white-space:normal;line-height:1.35;padding:9px 5px}
@media(max-width:370px){.hq-manager-invite-panel .hq-manager-invite-actions .btn{font-size:.69rem;padding:8px 3px}}
.hq-manager-invite-row .hq-manager-invite-actions .btn{font-size:.75rem}
.hq-owner-detail .hq-manager-status-panel h4,.hq-owner-detail .hq-manager-invite-panel h4{margin:14px 0 9px}
.hq-owner-detail .hq-manager-remove-row .btn{min-width:94px}
.hq-owner-detail .hq-manager-panel-frame{display:flow-root;min-width:0;width:100%;overflow-y:auto;overscroll-behavior:contain;max-height:min(54dvh,560px);scrollbar-gutter:stable}
@media(max-width:560px){.hq-owner-detail .hq-manager-tab{font-size:.74rem;padding:7px 2px}.hq-manager-remove-row,.hq-manager-invite-row{flex-wrap:wrap}.hq-manager-remove-row .btn,.hq-manager-invite-row .btn{margin-left:auto}}
</style><div id="hqOwnerBody">불러오는 중…</div></div>`;
 const body=box.querySelector("#hqOwnerBody"); const summary=document.getElementById("hqOwnerPinnedSummary");
 const owner=id=>{const uid=owners.find(x=>Number(x.store_id)===Number(id))?.user_id;return managers.find(x=>Number(x.store_id)===Number(id)&&x.user_id===uid)};
 const pendingOwner=id=>ownerInvitations.find(x=>Number(x.store_id)===Number(id));
 const managerIds=()=>new Set(managers.map(m=>m.user_id));
 const isHqAccount=a=>a?.is_admin===true&&!managerIds().has(a.user_id);
 const canAppoint=m=>!!m&&managerEligibility.some(e=>e.user_id===m.user_id&&Number(e.store_id)===Number(m.store_id)&&e.eligible===true);
 async function load(){const data=await Promise.all([rpc("hq_stores_onboarding_list"),rpc("hq_store_manager_list"),rpc("hq_store_primary_owner_list"),BE.listAuthUsers(),rpc("hq_store_locations_list"),rpc("hq_store_manager_eligibility_list"),rpc("hq_store_primary_owner_invitation_list"),rpc("hq_store_manager_directory")]);if(!data.every(Array.isArray))throw Error("INVALID_HQ_RESPONSE");[stores,managers,owners,accounts,,managerEligibility,ownerInvitations,directory]=data;const locations=new Map(data[4].map(l=>[Number(l.store_id),l]));const flagRows=await rpc("hq_store_sample_flags_list").catch(()=>[]);const samples=new Set((Array.isArray(flagRows)?flagRows:[]).filter(x=>x.is_sample===true).map(x=>Number(x.store_id)));stores=stores.filter(s=>!samples.has(Number(s.id))).map(s=>Object.assign({},s,locations.get(Number(s.id))||{},{is_sample:false}));render();}
 const friendlyError=e=>{const message=String(e?.message||e||"");if(/already been registered|already registered|user already exists|email_exists|INVITE_FAILED.*registered/i.test(message))return "이미 등록된 이메일입니다. 기존 연결 계정을 확인하세요. 이 계정이 다른 지점에 연결되어 있는지도 확인하세요.";
 if(/CONFIRMED_STORE_MANAGER_REQUIRED/i.test(message))return "대표로 지정하려면 계정 소유자가 초대 이메일 확인(이메일 인증)을 완료해야 합니다. 이메일 인증 후 다시 대표 지정을 누르세요.";if(/CANNOT_DOWNGRADE_HQ/i.test(message))return "본사 관리자 계정은 지점 점주로 연결할 수 없습니다. 일반 계정을 선택하세요.";return message;};
 async function run(fn,onSuccess){if(busy)return;busy=true;
   try{
     await fn();
     if(onSuccess)onSuccess();
     await load();
     if(notice){
       const title=notice.title,message=notice.message;
       if(typeof toast==="function")toast("in",title,message);
       else alert(title+"\n\n"+message);
     }
   }catch(e){alert("처리 실패: "+friendlyError(e))}
   finally{busy=false}
 }
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
 const store=stores.find(s=>Number(s.id)===selected),current=store?owner(selected):null,waiting=store?pendingOwner(selected):null;
 const linked=managers.filter(x=>Number(x.store_id)===selected);
 const entries=directory.filter(x=>Number(x.store_id)===selected).slice().sort((a,b)=>{
   const ownerPriority=x=>x.intended_role==="OWNER"&&x.account_state==="ACTIVE"?0:1;
   return ownerPriority(a)-ownerPriority(b)||
     new Date(a.registered_at).getTime()-new Date(b.registered_at).getTime()||
     String(a.email||"").localeCompare(String(b.email||""));
 });
 const active=entries.filter(m=>m.account_state==="ACTIVE"&&(m.intended_role==="OWNER"||m.intended_role==="ASSISTANT"));
 const waitingRows=entries.filter(m=>m.account_state!=="ACTIVE");
 const needsReview=entries.filter(m=>m.account_state==="ACTIVE"&&m.intended_role==="UNCLASSIFIED");
 const eligibleAccounts=accounts.filter(a=>!a.is_admin&&a.email);
 const roleName=m=>m.intended_role==="OWNER"?"대표 관리자":m.intended_role==="ASSISTANT"?"보조 관리자":"역할 확인 필요";
 const dateLabel=m=>m.registered_at?new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(m.registered_at)).replace(/\.$/,""):"날짜 미상";
 const roleTag=m=>'<span class="hq-manager-roster-tag'+(m.intended_role==="OWNER"?' is-owner':'')+'">'+(m.intended_role==="OWNER"?"대표":m.intended_role==="ASSISTANT"?"보조":"미확인")+'</span>';
 const identity=m=>'<span class="hq-manager-inline"><strong>'+h(m.email)+'</strong>'+roleTag(m)+'</span>';
 const empty='<div class="hq-manager-empty">해당 인원이 아직 없습니다.</div>';
 const rosterRow=m=>'<div class="hq-manager-roster-row">'+identity(m)+'</div>';
 const pendingRow=m=>'<div class="hq-manager-pending-row">'+identity(m)+
   '<p>'+(m.account_state==="EXPIRED"?"초대 기한 만료: ":"인증·비밀번호 설정 대기: ")+h(dateLabel(m))+'</p></div>';
 const statusPanel='<div class="hq-manager-status-panel" role="tabpanel" aria-label="관리자 현황">'+
   '<h4>등록된 관리자</h4>'+
   (active.length?active.map(rosterRow).join(""):empty)+
   '<h4>초대중인 관리자</h4>'+
   (waitingRows.length?waitingRows.map(pendingRow).join(""):empty)+
   (needsReview.length?'<h4>역할 확인 필요</h4>'+needsReview.map(rosterRow).join(""):'')+'</div>';
 const invitePanel='<div class="hq-manager-invite-panel" role="tabpanel" aria-label="관리자 초대">'+
   '<label for="hqInviteRole">역할</label><select class="form-control" id="hqInviteRole"><option value="OWNER">대표 관리자</option><option value="ASSISTANT">보조 관리자</option></select>'+
   '<label for="hqOwnerEmail">이메일</label><input class="form-control" id="hqOwnerEmail" type="email" placeholder="manager@example.com" autocomplete="off">'+
   '<div class="hq-owner-buttons"><button type="button" class="btn btn-primary btn-sm" id="hqOwnerInvite">초대 메일 발송</button></div>'+
   '<h4>초대 대기중</h4>'+
   (waitingRows.length?waitingRows.map(m=>
     '<div class="hq-manager-invite-row"><span><strong>'+h(m.email)+'</strong><small>'+h(roleName(m))+' · '+(m.account_state==="EXPIRED"?"기한 만료":"인증 대기")+'</small></span>'+
     '<div class="hq-manager-invite-actions"><button class="btn btn-secondary btn-sm" type="button" data-owner-resend="'+h(m.user_id)+'">초대 메일 재발송</button>'+
     '<button class="btn btn-secondary btn-sm" type="button" data-invite-cancel="'+h(m.user_id)+'">초대 취소</button></div></div>').join(""):empty)+'</div>';
 const removePanel='<div class="hq-manager-remove-panel" role="tabpanel" aria-label="관리자 해제">'+
   (active.length?active.map(m=>
      '<div class="hq-manager-remove-row"><span><strong>'+h(m.email)+'</strong><small>'+h(roleName(m))+'</small></span>'+
      '<button type="button" class="btn btn-secondary btn-sm" data-manager-remove="'+h(m.user_id)+'">관리자 해제</button></div>').join("")
   :empty)+'</div>';
 const tabs='<div class="hq-manager-tabs" role="tablist" aria-label="지점 관리자 작업">'+
   [["status","관리자 현황"],["invite","관리자 초대"],["remove","관리자 해제"]].map(([key,title])=>
   '<button type="button" class="hq-manager-tab'+(activeTab===key?' is-active':'')+'" data-manager-tab="'+key+'" role="tab" aria-selected="'+String(activeTab===key)+'">'+title+'</button>').join("")+'</div>';
 if(summary){summary.textContent='';summary.hidden=true;}
 body.innerHTML=(notice?'<div class="hq-owner-help" role="status" aria-live="polite" style="border:1px solid #91b9a0;border-radius:12px;padding:14px;margin-bottom:12px;background:#eef7f0;color:#214e32"><strong>'+h(notice.title)+'</strong><p>'+h(notice.message)+'</p><button type="button" class="btn btn-secondary btn-sm" id="hqOwnerDismiss">확인</button></div>':'')+
 '<div class="hq-owner-filters"><input class="form-control" id="hqOwnerSearch" type="search" placeholder="지점명·코드·지역 검색" value="'+h(search)+'"><select class="form-control" id="hqOwnerFilter"><option value="ALL">전체</option><option value="MISSING">대표 미배정</option><option value="ASSIGNED">배정 완료</option></select></div>'+
 '<div class="hq-owner-quicknav" aria-label="빠른 지점 선택"><button type="button" data-quick-mode="region" class="'+(quickMode==="region"?"active":"")+'">지역별 찾기</button><button type="button" data-quick-mode="initial" class="'+(quickMode==="initial"?"active":"")+'">가나다순</button><button type="button" data-quick-mode="recent" class="'+(quickMode==="recent"?"active":"")+'">최근 지점</button></div>'+
 (quickMode?'<div class="hq-quick-overlay"><section class="hq-quick-dialog" role="dialog" aria-modal="true" aria-label="빠른 지점 찾기"><div class="hq-quick-dialog-head"><strong>'+h(quickTitle)+'</strong><button id="hqQuickClose" type="button">닫기</button></div>'+quickPanel+'</section></div>':'')+
 '<div class="hq-owner-columns"><div class="hq-owner-list">'+rows.map(s=>
 '<button type="button" class="hq-owner-row'+(selected===Number(s.id)?" active":"")+'" data-store="'+Number(s.id)+'"><strong>'+h(s.name)+'</strong><span class="hq-owner-status '+(owner(s.id)?"assigned":"unassigned")+'">'+(owner(s.id)?"대표 배정":"미배정")+'</span></button>').join("")+'</div>'+
 '<div class="hq-owner-detail">'+(store?'<h3 class="hq-manager-store-head">'+h(store.name)+'</h3>'+tabs+
 '<div class="hq-manager-panel-frame">'+(activeTab==="status"?statusPanel:activeTab==="invite"?invitePanel:removePanel)+'</div>':
 '<p class="hq-owner-help">목록에서 지점을 선택하세요.</p>')+'</div></div>';
 // Measure all three panels at the same width and reserve the tallest panel's
 // height. Only the active panel stays mounted, so hidden mutation controls
 // never become interactive or duplicate IDs in the live DOM.
 const panelFrame=body.querySelector(".hq-manager-panel-frame");
 if(panelFrame){
   const currentMarkup=panelFrame.innerHTML;
   const heights=[statusPanel,invitePanel,removePanel].map(markup=>{
     panelFrame.style.height="auto";
     panelFrame.innerHTML=markup;
     return panelFrame.scrollHeight;
   });
   panelFrame.innerHTML=currentMarkup;
   panelFrame.style.height=Math.ceil(Math.max(...heights)+2)+"px";
   panelFrame.scrollTop=0;
 }
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
 body.querySelectorAll("[data-manager-tab]").forEach(button=>button.onclick=()=>{
   activeTab=button.dataset.managerTab;notice=null;render();
 });
 if(activeTab==="invite"){
   const email=()=>body.querySelector("#hqOwnerEmail").value.trim().toLowerCase();
   body.querySelector("#hqOwnerInvite").onclick=()=>{
     const role=body.querySelector("#hqInviteRole").value,assistant=role==="ASSISTANT";
     if(!assistant&&current)return alert("이미 대표 관리자가 있습니다. 대표 교체는 별도 승인 후 진행하세요.");
     if(!assistant&&waiting)return alert("대표 관리자는 동시에 여러 계정을 초대할 수 없습니다.");
     if(assistant&&!current)return alert("대표 관리자 활성화 후 보조 관리자를 초대할 수 있습니다.");
     const v=email();
     if(!v||!body.querySelector("#hqOwnerEmail").checkValidity())return alert("올바른 이메일을 입력하세요.");
     const found=accounts.find(a=>String(a.email||"").toLowerCase()===v);
     if(found){
       const linkedManager=managers.find(m=>m.user_id===found.user_id);
       return alert(linkedManager?"이미 연결된 계정입니다. 관리자 현황 또는 해제 탭에서 상태를 확인하세요.":isHqAccount(found)?"본사 관리자 계정은 지점 관리자로 초대할 수 없습니다.":"이미 가입한 일반 계정입니다. 본사 계정 관리에서 연결 상태를 확인하세요.");
     }
     if(confirm("관리자 초대 메일을 발송하시겠습니까?\n\n지점: "+store.name+"\n이메일: "+v+"\n역할: "+(assistant?"보조 관리자":"대표 관리자")+"\n\n이메일이 발송되며, 수신인이 인증·비밀번호 설정을 완료하면 "+(assistant?"해당 지점의 보조 관리자 계정으로 활성화됩니다.":"해당 지점의 대표 관리자로 자동 등록됩니다.")+"\n\n발송을 진행할까요?")){
       run(()=>invite(v,selected,role),()=>{
         activeTab="status";notice={title:"초대 요청 처리됨",message:"해당 지점 관리자 초대 상태를 갱신했습니다. 받는 사람의 실제 이메일 수신 및 인증을 확인해 주세요."};
       });
     }
   };
   body.querySelectorAll("[data-owner-resend]").forEach(b=>b.onclick=()=>{
     const m=waitingRows.find(x=>x.user_id===b.dataset.ownerResend);
     if(!m)return alert("초대 대기 상태가 변경됐습니다. 페이지를 다시 열어 확인해 주세요.");
     if(m.intended_role!=="OWNER"&&m.intended_role!=="ASSISTANT")return alert("초대 역할이 확정되지 않았습니다. 기존 초대를 취소한 뒤 대표/보조 역할을 지정해 다시 초대하세요.");
     if(!confirm("초대 메일을 다시 발송하시겠습니까?\n\n지점: "+store.name+
       "\n이메일: "+m.email+"\n역할: "+roleName(m)+
       "\n\n새 초대 링크로 이메일 인증·비밀번호 설정을 진행하게 됩니다. 기존 링크는 사용하지 않도록 안내합니다.\n\n재발송할까요?"))return;
     run(()=>invite(m.email,selected,m.intended_role==="ASSISTANT"?"ASSISTANT":"OWNER"),()=>{
       activeTab="status";notice={title:"초대 메일 재발송 요청 완료",message:store.name+" · "+m.email+" · "+roleName(m)+"의 재발송 요청이 처리됐습니다. 실제 이메일 수신은 계정 소유자가 확인해야 합니다."};
     });
   });
   body.querySelectorAll("[data-invite-cancel]").forEach(b=>b.onclick=()=>{
     const m=waitingRows.find(x=>x.user_id===b.dataset.inviteCancel);
     if(!m)return alert("초대 대기 상태가 변경됐습니다. 페이지를 다시 열어 확인해 주세요.");
     if(!confirm("이 관리자 초대를 취소하시겠습니까?\n\n지점: "+store.name+
       "\n이메일: "+m.email+"\n역할: "+roleName(m)+
       "\n\n취소하면 초대 대기 및 해당 지점의 관리자 권한 연결이 즉시 제거됩니다. 기존 이메일 링크로 인증해도 이 지점의 관리자 권한은 부여되지 않습니다.\n\n초대를 취소할까요?"))return;
     run(async()=>{
       const result=await rpc("hq_store_manager_remove",{p_store_id:selected,p_user_id:m.user_id});
       if(result?.ok!==true)throw Error("INVITATION_CANCEL_NOT_CONFIRMED");
     },()=>{
       activeTab="status";notice={title:"초대 취소 완료",message:store.name+" · "+m.email+"의 "+roleName(m)+" 초대를 취소했습니다."};
     });
   });
 }
 if(activeTab==="remove"){
   body.querySelectorAll("[data-manager-remove]").forEach(b=>b.onclick=()=>{
     const target=active.find(m=>m.user_id===b.dataset.managerRemove);
     if(!target)return alert("관리자 목록이 변경됐습니다. 페이지를 다시 열어 확인해 주세요.");
     const extra=target.intended_role==="OWNER"?
       "\n주의: 대표 관리자를 해제하면 대표 자리가 비고 보조 관리자의 관리자 관리 기능이 중단됩니다.":"";
     if(!confirm("이 관리자 권한을 해제하시겠습니까?\n\n지점: "+store.name+
       "\n이메일: "+target.email+"\n역할: "+roleName(target)+
       "\n\n해제 후 기존 로그인 세션에서도 이 지점의 관리자 작업이 즉시 거부됩니다. 계정 자체와 과거 근태·급여 기록은 삭제하지 않습니다."+extra+
       "\n\n해제를 진행할까요?"))return;
     run(async()=>{
       const result=await rpc("hq_store_manager_remove",{p_store_id:selected,p_user_id:target.user_id});
       if(result?.ok!==true)throw Error("MANAGER_REMOVE_UNCONFIRMED");
     },()=>{
       activeTab="status";notice={title:"관리자 해제 완료",message:store.name+" · "+target.email+"의 지점 관리자 권한을 해제했습니다."};
     });
   });
 }
 }
 try{await load()}catch(e){body.textContent="관리자 목록을 불러오지 못했습니다: "+e.message}
};
})();