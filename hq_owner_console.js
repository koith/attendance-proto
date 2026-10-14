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
 let stores=[],managers=[],owners=[],accounts=[],selected=0,search="",filter="ALL",busy=false,notice=null,quickMode="",province="",district="",quickLetter="ㄱ";
 const RECENTS_KEY="hq_owner_recent_stores_v1";
 const readRecents=()=>{try{return JSON.parse(localStorage.getItem(RECENTS_KEY)||"[]").filter(Number.isFinite).slice(0,5)}catch{return []}};
 const remember=id=>{try{localStorage.setItem(RECENTS_KEY,JSON.stringify([id,...readRecents().filter(x=>x!==id)].slice(0,5)))}catch{}};
 const PROVINCES={"서울":"서울특별시","부산":"부산광역시","대구":"대구광역시","인천":"인천광역시","광주":"광주광역시","대전":"대전광역시","울산":"울산광역시","세종":"세종특별자치시","경기":"경기도","강원":"강원특별자치도","충북":"충청북도","충남":"충청남도","전북":"전북특별자치도","전남":"전라남도","경북":"경상북도","경남":"경상남도","제주":"제주특별자치도"};
 const normalizeProvince=v=>PROVINCES[v]||Object.values(PROVINCES).find(p=>p===v)||"";
 const region=s=>{
  // Only administrative address fields may establish a district. Sales regions like
  // "울산 경남" are NOT administrative districts and must never populate the selector.
  const address=String(s.road_address||s.road_addr||s.address||s.address_road||s.jibun_address||"").trim();
  const tokens=address.split(/\s+/).filter(Boolean);
  const fromAddress=normalizeProvince(tokens[0]||"");
  const raw=String(s.region_group||"").trim();
  const groupTokens=raw.split(/[\s/·>]+/).filter(Boolean);
  const fromGroup=groupTokens.length===1?normalizeProvince(groupTokens[0]):"";
  const province=fromAddress||fromGroup||"지역 미분류";
  const candidate=fromAddress?(tokens[1]||""):"";
  const district=/^(?:.+(?:시|군|구))$/.test(candidate)?candidate:"";
  return {province,district};
 };
 const ADMIN_DISTRICTS={
 "서울특별시":"종로구 중구 용산구 성동구 광진구 동대문구 중랑구 성북구 강북구 도봉구 노원구 은평구 서대문구 마포구 양천구 강서구 구로구 금천구 영등포구 동작구 관악구 서초구 강남구 송파구 강동구".split(" "),
 "부산광역시":"중구 서구 동구 영도구 부산진구 동래구 남구 북구 해운대구 사하구 금정구 강서구 연제구 수영구 사상구 기장군".split(" "),
 "대구광역시":"중구 동구 서구 남구 북구 수성구 달서구 달성군 군위군".split(" "),
 "인천광역시":"중구 동구 미추홀구 연수구 남동구 부평구 계양구 서구 강화군 옹진군".split(" "),
 "광주광역시":"동구 서구 남구 북구 광산구".split(" "),
 "대전광역시":"동구 중구 서구 유성구 대덕구".split(" "),
 "울산광역시":"중구 남구 동구 북구 울주군".split(" "),
 "세종특별자치시":[]
 };
 const chose=id=>{selected=Number(id);remember(selected);render()};
 box.innerHTML='<div class="hq-owner-console"><h2>지점 대표 관리자 관리</h2><p>지점별 대표 점주를 확인하고 초대·지정할 수 있습니다.</p><div id="hqOwnerBody">불러오는 중…</div></div>';
 const body=box.querySelector("#hqOwnerBody"); const summary=document.getElementById("hqOwnerPinnedSummary");
 const owner=id=>{const uid=owners.find(x=>Number(x.store_id)===Number(id))?.user_id;return managers.find(x=>Number(x.store_id)===Number(id)&&x.user_id===uid)};
 async function load(){const data=await Promise.all([rpc("hq_stores_onboarding_list"),rpc("hq_store_manager_list"),rpc("hq_store_primary_owner_list"),BE.listAuthUsers()]);if(!data.every(Array.isArray))throw Error("INVALID_HQ_RESPONSE");[stores,managers,owners,accounts]=data;render();}
 const friendlyError=e=>{const message=String(e?.message||e||"");if(/already been registered|already registered|user already exists|email_exists|INVITE_FAILED.*registered/i.test(message))return "이미 가입된 이메일입니다. 신규 초대 대신 기존 계정 목록에서 선택하세요. 본사 관리자 계정은 지점 점주로 연결할 수 없습니다.";if(/CANNOT_DOWNGRADE_HQ/i.test(message))return "본사 관리자 계정은 지점 점주로 연결할 수 없습니다. 일반 계정을 선택하세요.";return message;};
 async function run(fn,onSuccess){if(busy)return;busy=true;try{await fn();if(onSuccess)onSuccess();await load();}catch(e){alert("처리 실패: "+friendlyError(e))}finally{busy=false}}
 function render(){
 const scrollContainer=body.closest("#adAccount");
 const modalScroll=scrollContainer?.scrollTop??0;
 const previousList=body.querySelector(".hq-owner-list");
 const listScroll=previousList?.scrollTop??0;
 const rows=stores.filter(s=>(filter==="ALL"||(filter==="ASSIGNED"?!!owner(s.id):!owner(s.id)))&&[s.name,s.code,s.region_group,s.id].some(v=>String(v??"").toLowerCase().includes(search.toLowerCase())));
 const regions=[...new Set(stores.map(s=>region(s).province))].sort((a,b)=>a.localeCompare(b,"ko"));
 const districts=ADMIN_DISTRICTS[province]||[...new Set(stores.filter(s=>region(s).province===province).map(s=>region(s).district).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"ko"));
 const regionStores=stores.filter(s=>region(s).province===province&&(!district||region(s).district===district)).sort((a,b)=>String(a.name).localeCompare(String(b.name),"ko"));
 const recentStores=readRecents().map(id=>stores.find(s=>Number(s.id)===id)).filter(Boolean);
 const letters=["ㄱ","ㄴ","ㄷ","ㄹ","ㅁ","ㅂ","ㅅ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
 const initial=name=>{const c=String(name||"").trim().charCodeAt(0);return c>=0xAC00&&c<=0xD7A3?letters[Math.floor((c-0xAC00)/588)]:String(name||"").trim()[0]||"#"};
 const letterStores=stores.filter(s=>initial(s.name)===quickLetter).sort((a,b)=>String(a.name).localeCompare(String(b.name),"ko"));
 const quickItem=s=>'<button type="button" class="hq-quick-store'+(Number(s.id)===selected?' selected':'')+'" data-quick-store="'+Number(s.id)+'"><span>'+h(s.name)+'</span><small>'+h(region(s).province)+'</small></button>';
 const quickTitle=quickMode==="region"?"지역별 찾기":quickMode==="initial"?"가나다순 찾기":"최근 지점";
 const quickPanel=quickMode==="region"?'<div class="hq-quick-panel"><div class="hq-quick-selects"><label>시·도<select id="hqQuickProvince" class="form-control"><option value="">지역 선택</option>'+regions.map(x=>'<option value="'+h(x)+'"'+(province===x?' selected':'')+'>'+h(x)+'</option>').join("")+'</select></label><label>시·군·구<select id="hqQuickDistrict" class="form-control" '+(province?'':'disabled')+'><option value="">전체 지역</option>'+districts.map(x=>'<option value="'+h(x)+'"'+(district===x?' selected':'')+'>'+h(x)+'</option>').join("")+'</select></label></div><div class="hq-quick-results">'+(province?'<p class="hq-owner-help">시·군·구는 실제 행정구역 목록입니다. 지점 주소에 구 정보가 없으면 선택한 구의 지점이 조회되지 않을 수 있습니다.</p>'+(regionStores.length?regionStores.map(quickItem).join(""):'<p class="hq-owner-help">해당 지역에 주소가 확인된 지점이 없습니다.</p>'):'<p class="hq-owner-help">시·도를 선택하세요.</p>')+'</div></div>':
 quickMode==="initial"?'<div class="hq-quick-panel"><div class="hq-quick-letters">'+letters.map(x=>'<button type="button" data-letter="'+x+'" class="'+(quickLetter===x?'active':'')+'">'+x+'</button>').join("")+'</div><div class="hq-quick-results">'+(quickLetter?letterStores.map(quickItem).join(""):'<p class="hq-owner-help">초성을 누르면 해당 지점이 나타납니다.</p>')+'</div></div>':
 quickMode==="recent"?'<div class="hq-quick-panel"><div class="hq-quick-results">'+(recentStores.length?recentStores.map(quickItem).join(""):'<p class="hq-owner-help">선택했던 지점이 여기에 최대 5개 표시됩니다.</p>')+'</div></div>':'';
 const store=stores.find(s=>Number(s.id)===selected),current=store?owner(selected):null,linked=managers.filter(x=>Number(x.store_id)===selected);
 const eligibleAccounts=accounts.filter(a=>!a.is_admin && a.email);
 const hqAccounts=accounts.filter(a=>a.is_admin && a.email);
 const inviteProgress=linked.filter(m=>m.email).map(m=>({email:m.email,representative:!!(current&&current.user_id===m.user_id)}));
 if(summary)summary.innerHTML='<span>전체 '+stores.length+'곳</span><span>대표 배정 '+stores.filter(s=>owner(s.id)).length+'곳</span><span>미배정 '+stores.filter(s=>!owner(s.id)).length+'곳</span>';
 body.innerHTML=(notice?'<div class="hq-owner-help" role="status" aria-live="polite" style="border:1px solid #91b9a0;border-radius:12px;padding:14px;margin-bottom:12px;background:#eef7f0;color:#214e32"><strong>'+h(notice.title)+'</strong><p>'+h(notice.message)+'</p><button type="button" class="btn btn-secondary btn-sm" id="hqOwnerDismiss">확인</button></div>':'')+'<div class="hq-owner-filters"><input class="form-control" id="hqOwnerSearch" type="search" placeholder="지점명·코드·지역 검색" value="'+h(search)+'"><select class="form-control" id="hqOwnerFilter"><option value="ALL">전체</option><option value="MISSING">대표 미배정</option><option value="ASSIGNED">배정 완료</option></select></div>'+
 '<div class="hq-owner-quicknav" aria-label="빠른 지점 선택"><button type="button" data-quick-mode="region" class="'+(quickMode==="region"?"active":"")+'">지역별 찾기</button><button type="button" data-quick-mode="initial" class="'+(quickMode==="initial"?"active":"")+'">가나다순</button><button type="button" data-quick-mode="recent" class="'+(quickMode==="recent"?"active":"")+'">최근 지점</button></div>'+(quickMode?'<div class="hq-quick-overlay"><section class="hq-quick-dialog" role="dialog" aria-modal="true" aria-label="빠른 지점 찾기"><div class="hq-quick-dialog-head"><strong>'+h(quickTitle)+'</strong><button id="hqQuickClose" type="button">닫기</button></div>'+quickPanel+'</section></div>':'')+'<div class="hq-owner-columns"><div class="hq-owner-list">'+rows.map(s=>'<button type="button" class="hq-owner-row'+(selected===Number(s.id)?' active':'')+'" data-store="'+Number(s.id)+'"><strong>'+h(s.name)+'</strong><small>'+(owner(s.id)?h(owner(s.id).email||"대표 지정됨"):"대표 미배정")+'</small></button>').join("")+'</div>'+
 '<div class="hq-owner-detail">'+(store?'<h3>'+h(store.name)+'</h3><p>대표 관리자: <strong>'+(current?h(current.email||"대표 지정됨"):"미배정")+'</strong></p>'+
 '<div class="hq-owner-help" role="status"><strong>대표 점주 등록 방법</strong><p>① 가입하지 않은 이메일이면 아래에서 초대합니다. ② 이미 가입한 일반 계정이면 목록에서 선택해 연결합니다. ③ 연결 후 대표로 지정합니다.</p><p>본사 관리자 계정은 보안상 점주로 전환할 수 없습니다. 같은 사람이 점주 역할도 필요하다면 별도의 이메일로 일반 계정을 등록해야 합니다.</p></div><label for="hqOwnerEmail">새 계정 이메일 초대</label><input class="form-control" id="hqOwnerEmail" type="email" placeholder="owner@example.com"><div class="hq-owner-buttons"><button class="btn btn-primary btn-sm" id="hqOwnerInvite">이메일 초대</button></div>'+ 
 '<label for="hqExistingAccount">기존 일반 계정 연결 ('+eligibleAccounts.length+'개)</label><select class="form-control" id="hqExistingAccount"><option value="">계정을 선택하세요</option>'+eligibleAccounts.map(a=>'<option value="'+h(a.email)+'">'+h(a.email)+'</option>').join("")+'</select><div class="hq-owner-buttons"><button class="btn btn-secondary btn-sm" id="hqOwnerAssign">선택 계정 연결</button></div><p class="hq-owner-help">본사 관리자 계정은 보안상 제외됩니다.</p>'+ 
 '<p class="hq-owner-help">이미 가입된 계정은 연결 후 대표로 지정할 수 있습니다.</p>'+
 '<section class="hq-owner-tracking"><h4>계정 진행 상태</h4><p class="hq-owner-help">서버에서 확인된 지점 연결과 대표 지정 상태입니다. 메일 도착·열람 및 가입 인증 여부는 확인되지 않습니다.</p>'+ (inviteProgress.length?inviteProgress.map(m=>'<div class="hq-owner-track"><strong>'+h(m.email)+'</strong><ol><li>✓ 지점 계정 연결 완료</li><li>'+(m.representative?'✓ 대표 점주 지정 완료':'○ 대표 점주 지정 대기')+'</li></ol></div>').join(''):'<p>현재 연결된 계정이 없습니다. 이메일 초대 또는 기존 계정 연결을 진행하세요.</p>')+'</section><div class="hq-owner-linked">'+linked.map(m=>'<div><span>'+h(m.email)+'</span>'+(current?.user_id===m.user_id?'<small>대표</small>':'<button class="btn btn-secondary btn-sm" data-primary="'+h(m.user_id)+'">대표 지정</button><button class="btn btn-secondary btn-sm" data-revoke="'+h(m.user_id)+'">해제</button>')+'</div>').join("")+'</div>':
 '<p class="hq-owner-help">왼쪽에서 지점을 선택하세요.</p>')+'</div></div>';
 if(scrollContainer)scrollContainer.scrollTop=modalScroll;
 const currentList=body.querySelector(".hq-owner-list");if(currentList)currentList.scrollTop=listScroll;
 body.querySelector("#hqOwnerDismiss")?.addEventListener("click",()=>{notice=null;render()});
 body.querySelectorAll("[data-quick-mode]").forEach(b=>b.onclick=()=>{quickMode=quickMode===b.dataset.quickMode?"":b.dataset.quickMode;if(quickMode==="initial")quickLetter="ㄱ";render()});
 body.querySelector("#hqQuickClose")?.addEventListener("click",()=>{quickMode="";render()});
 body.querySelector("#hqQuickProvince")?.addEventListener("change",e=>{province=e.target.value;district="";render()});
 body.querySelector("#hqQuickDistrict")?.addEventListener("change",e=>{district=e.target.value;render()});
 body.querySelectorAll("[data-letter]").forEach(b=>b.onclick=()=>{quickLetter=b.dataset.letter;render()});
 body.querySelectorAll("[data-quick-store]").forEach(b=>b.onclick=()=>{quickMode="";chose(b.dataset.quickStore)});
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