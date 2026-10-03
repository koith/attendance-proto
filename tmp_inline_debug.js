
/* =========================================================================
   백억커피 근태 V0.1  —  단일 파일 모바일 웹앱
   백엔드 어댑터: Supabase URL/키를 넣으면 자동으로 클라우드 모드,
   없으면 localStorage 로컬 모드로 완전 동작 (UI/동선 검증용).
   GPT 프로토타입의 검증된 로직 이식: IN/OUT 페어링, 자정넘김,
   8초 중복방지, 미완결 세션 감지, 서버(=KST)시각 저장.
   ========================================================================= */

/* ===== V1 Design System 아이콘 (24x24 viewBox, currentColor) ===== */
const ICON = {
  back:`<svg class="ui-icon ui-icon--standalone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>`,
  close:`<svg class="ui-icon ui-icon--standalone" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  file:`<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>`,
  upload:`<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>`,
};

// Pre-release versions advance by 0.01 per merged user-visible delivery (see VERSIONING.md).
const APP_VERSION="v0.143";
const CONFIG = {
  SUPABASE_URL: "https://waluhdgqhwjjwmflhrle.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhbHVoZGdxaHdqandtZmxocmxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MTg4NjAsImV4cCI6MjEwMzE5NDg2MH0.-UugGE05V70Ecw__UdIZpWJr2mDYmLfV7mh_lR-U9Mw",
  STORE_NAME: "인하대점",
  DEVICE_ID: "POS_INHA_01",
  SHEET_ID: "1-0on5kKhnIrjrutEDAR9y4nkBGlB1VL6YaLD49eG024",  // 구글시트(업무자동화) ID
  DUP_GUARD_SEC: 8,
};

/* ---------- 시각 유틸: 항상 Asia/Seoul 기준 ---------- */
function kstNow(){
  // 브라우저 로컬시각을 KST로 보정한 Date 문자열(ISO, 초단위)
  const d = new Date();
  // toLocaleString으로 KST 벽시계 값을 만든 뒤 Date로 되돌림
  const kst = new Date(d.toLocaleString("en-US",{timeZone:"Asia/Seoul"}));
  return kst;
}
function iso(d){ // 초단위 ISO (타임존 표기 없이 KST 벽시계)
  const p=n=>String(n).padStart(2,"0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
// event_at 파서: 앱/DB에 실제 존재하는 형식만 명시 처리. iOS Safari/Chrome 동일 결과 보장.
// 지원 형식 (전부 KST 로컬 벽시계 의미 — TZ없는 값을 UTC로 재해석하지 않음):
//   1) "YYYY-MM-DD HH:mm:ss[.ffffff]"  (공백구분, DB timestamp without timezone / raw punch)
//   2) "YYYY-MM-DDTHH:mm[:ss]"          (T구분, isoLocal/correction, TZ없음)
//   3) TZ 명시("Z" 또는 ±HH:mm)가 있으면 표준 Date로 파싱(현재 코드경로엔 없으나 방어적)
// 반환: Date. 파싱 실패 시 Invalid Date(NaN) — 호출부에서 방어(급여로 조용히 흘리지 않음).
function fromIso(s){
  if(s instanceof Date) return s;
  if(s==null) return new Date(NaN);
  const str=String(s).trim();
  // TZ 명시가 있으면 표준 파싱에 맡김 (Z 또는 +09:00/-05:00 등)
  if(/[zZ]$|[+\-]\d{2}:?\d{2}$/.test(str)) return new Date(str);
  // TZ 없는 로컬 벽시계: 공백/T 구분 모두 허용, 초·소수초 선택
  const m=str.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
  if(!m) return new Date(NaN);
  const [_,Y,Mo,D,H,Mi,S]=m;
  // new Date(y,mo-1,...) = 브라우저 로컬시간대 기준 생성 = KST 벽시계 값 보존(서버가 KST로 기록해온 의미)
  return new Date(+Y, +Mo-1, +D, +H, +Mi, S?+S:0, 0);
}
function fromIsoValid(s){ const d=fromIso(s); return isNaN(d)?null:d; }
function hhmm(d){ const p=n=>String(n).padStart(2,"0"); return `${p(d.getHours())}:${p(d.getMinutes())}`; }
function hms(d){ const p=n=>String(n).padStart(2,"0"); return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`; }
function fmtDur(sec){
  const m=Math.max(0,Math.floor(sec/60)); const h=Math.floor(m/60), mm=m%60;
  if(h&&mm) return `${h}시간 ${mm}분`; if(h) return `${h}시간`; return `${mm}분`;
}
// 급여용: 초 → 정확한 시간(소수, 반올림 없음). 계산에 사용.
function secToHours(sec){ return sec/3600; }
// 표시용: 초 → "H시간 M분" (분 단위 절삭 표기, 계산과 무관)
function fmtHM(sec){ const m=Math.floor(sec/60); const h=Math.floor(m/60), mm=m%60;
  if(h&&mm) return `${h}시간 ${mm}분`; if(h) return `${h}시간`; return `${mm}분`; }
/* ---- 엑셀 ROUND/ROUNDDOWN 정확 재현 (Sprint2 replay 검증 통과) ---- */
function xround(x,n){ // ROUND(x,10^-n): n=-1 → 10원 반올림
  const step=Math.pow(10,-n); return Math.round(x/step)*step;
}
function xrounddown(x,n){ const step=Math.pow(10,-n); return Math.floor(x/step)*step; }
// 원천징수율 % 입력 파싱: "" → null(기본값 사용), 정상 → 0~1 numeric, 오류 → false
// UI 입력오류 방지 수준만 검증(법률/세법 범위 하드코딩 아님). 0~100% 허용.
function parseTaxPct(raw){
  const s=String(raw==null?'':raw).trim();
  if(s==='') return null;
  if(!/^\d+(\.\d+)?$/.test(s)) return false;   // 숫자/소수만 (음수·문자 거부)
  const pct=parseFloat(s);
  if(isNaN(pct) || pct<0 || pct>100) return false;
  return pct/100;   // % → numeric (3.3 → 0.033)
}
/* ---- 월 급여 계산: emp속성 + 월실근무시간 → 급여내역 ---- */
// emp: 직원 기본값, ov: 이번 달 조정(payroll_period_employee) 또는 null, weeks: 그 달 주 수
function calcPayroll(emp, monthHours, weeks, ov){
  ov = ov||{};
  // 기본값 + 이번 달 override 병합
  const wage = (ov.wage_override!=null) ? ov.wage_override : (emp.wage||0);
  const jh   = (ov.juhyu_hours_override!=null) ? ov.juhyu_hours_override : (emp.juhyu_hours||0);
  const jweeks = (ov.juhyu_weeks_override!=null) ? ov.juhyu_weeks_override : (weeks||0);
  const rate = (ov.tax_rate_override!=null) ? ov.tax_rate_override : ((emp.tax_rate!=null)?emp.tax_rate:0.033);
  const adjust = ov.adjust_amount||0;

  const base=xround(wage*monthHours,-1);              // 기본급 10원 반올림
  let juhyu=0, weekly=0;
  if(jh>0){
    weekly = (emp.juhyu_round!=null) ? xround(wage*jh, emp.juhyu_round) : Math.round(wage*jh);
    juhyu = Math.round(weekly*jweeks);               // 원 단위 정수화 (부동소수점 오차 제거)
  }
  const gross=Math.round(base+juhyu+adjust);         // 임의 가감액 포함
  const net=xrounddown(gross*(1-rate),-1);           // 세후 10원 버림
  return {base, weekly, juhyu, adjust, gross, net, rate, wage, jweeks, usedOverride:Object.keys(ov).length>0};
}

/* ============================ 백엔드 어댑터 ============================ */
/* 두 구현이 같은 인터페이스를 제공:
   listEmployees(), createEmployee(name,pin), deactivateEmployee(id),
   verifyPin(id,pin), lastEvent(id), insertEvent(id,type),
   todayEvents()  →  모두 Promise 반환 */

const LIVE = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);

/* ---- PIN 해시 (WebCrypto PBKDF2-SHA256, GPT판과 동일 방식) ---- */
async function pbkdf2(pin, saltB64){
  const enc=new TextEncoder();
  let salt;
  if(saltB64){ salt=Uint8Array.from(atob(saltB64),c=>c.charCodeAt(0)); }
  else { salt=crypto.getRandomValues(new Uint8Array(16)); }
  const key=await crypto.subtle.importKey("raw",enc.encode(pin),{name:"PBKDF2"},false,["deriveBits"]);
  const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:150000,hash:"SHA-256"},key,256);
  const digest=btoa(String.fromCharCode(...new Uint8Array(bits)));
  const sB64=btoa(String.fromCharCode(...salt));
  return {encoded:`pbkdf2_sha256$${sB64}$${digest}`, saltB64:sB64, digest};
}
async function pinMatches(pin, encoded){
  try{ const [,sB64]=encoded.split("$"); const {encoded:re}=await pbkdf2(pin,sB64); return re===encoded; }
  catch(e){ return false; }
}

/* ---------------------- LocalStorage 구현 ---------------------- */
const LocalBE = (()=>{
  const K="baekeok_att_v1";
  function load(){ try{return JSON.parse(localStorage.getItem(K))||seed();}catch(e){return seed();} }
  function save(s){ localStorage.setItem(K,JSON.stringify(s)); }
  function seed(){ const s={emps:[],events:[],seq:1}; localStorage.setItem(K,JSON.stringify(s)); return s; }
  return {
    async listEmployees(){ return load().emps.filter(e=>e.active).sort((a,b)=>a.name.localeCompare(b.name,"ko")); },
    async allEmployees(){ return load().emps.sort((a,b)=>a.name.localeCompare(b.name,"ko")); },
    async scheduleList(f,t){ const s=load(); return (s.schedules||[]).filter(w=>w.work_date>=f&&w.work_date<=t); },
    async scheduleSet(empId,date,status,start,end,memo){ const s=load(); s.schedules=s.schedules||[];
      const i=s.schedules.findIndex(w=>w.employee_id===empId&&w.work_date===date);
      const row={id:i>=0?s.schedules[i].id:(s.seq++),employee_id:empId,work_date:date,status,planned_start:status==="WORK"?start:null,planned_end:status==="WORK"?end:null,memo:memo||null};
      if(i>=0)s.schedules[i]=row; else s.schedules.push(row); localStorage.setItem(K,JSON.stringify(s)); return {ok:true}; },
    async scheduleDelete(empId,date){ const s=load(); s.schedules=(s.schedules||[]).filter(w=>!(w.employee_id===empId&&w.work_date===date)); localStorage.setItem(K,JSON.stringify(s)); return {ok:true,deleted:1}; },
    async createEmployee(name,pin){
      const s=load();
      if(s.emps.some(e=>e.active&&e.name===name.trim())) throw new Error("같은 이름의 활성 직원이 이미 있습니다.");
      const {encoded}=await pbkdf2(pin);
      s.emps.push({id:s.seq++, name:name.trim(), pin_hash:encoded, active:true});
      save(s);
    },
    async deactivateEmployee(id){ const s=load(); const e=s.emps.find(x=>x.id===id); if(e)e.active=false; save(s); },
    async verifyPin(id,pin){ const e=load().emps.find(x=>x.id===id&&x.active); if(!e)return false; return pinMatches(pin,e.pin_hash); },
    async lastEvent(id){ const ev=load().events.filter(x=>x.employee_id===id).sort((a,b)=>a.event_at<b.event_at?1:-1); return ev[0]||null; },
    async insertEvent(id,type){ const s=load(); const now=iso(kstNow());
      s.events.push({id:s.seq++, employee_id:id, event_type:type, event_at:now, server_received_at:now, device_id:CONFIG.DEVICE_ID}); save(s); },
    async todayEvents(){ const s=load(); const t=kstNow(); const p=n=>String(n).padStart(2,"0");
      const day=`${t.getFullYear()}-${p(t.getMonth()+1)}-${p(t.getDate())}`;
      return s.events.filter(x=>x.event_at.slice(0,10)===day); },
    async monthEvents(ym){ // 경계 포함: 전월 말일~익월 1일까지 여유 조회 후 세션화는 호출측에서
      const s=load(); const [y,m]=ym.split("-").map(Number);
      const start=new Date(y,m-1,1); start.setDate(start.getDate()-1);   // 전월 말일
      const end=new Date(y,m,1); end.setDate(end.getDate()+1);           // 익월 1일 다음
      const p=n=>String(n).padStart(2,"0");
      const sd=`${start.getFullYear()}-${p(start.getMonth()+1)}-${p(start.getDate())}`;
      const ed=`${end.getFullYear()}-${p(end.getMonth()+1)}-${p(end.getDate())}`;
      return s.events.filter(x=>{const d=x.event_at.slice(0,10); return d>=sd && d<=ed;}); },
    async updateEmployee(id,fields){ const s=load(); const e=s.emps.find(x=>x.id===id); if(e)Object.assign(e,fields); save(s); },
    async getEmployee(id){ return load().emps.find(x=>x.id===id)||null; },
    // --- RPC 호환 인터페이스 (Supabase와 동일 시그니처) ---
    async listEmployeesState(){ const s=load();
      const list=s.emps.filter(e=>e.active).map(e=>{
        const ev=s.events.filter(x=>x.employee_id===e.id).sort((a,b)=>a.id<b.id?1:-1)[0];
        const working=!!(ev&&ev.event_type==="IN");
        return {id:e.id,name:e.name,working, working_since: working?ev.event_at:null};
      });
      // 근무중 먼저, 그다음 이름순
      return list.sort((a,b)=> (b.working?1:0)-(a.working?1:0) || a.name.localeCompare(b.name,"ko"));
    },
    async punch(id,pin,subForId=null){ const s=load(); const e=s.emps.find(x=>x.id===id&&x.active);
      if(!e) return {ok:false,error:"NO_EMPLOYEE"};
      if(!await pinMatches(pin,e.pin_hash)) return {ok:false,error:"BAD_PIN"};
      const last=s.events.filter(x=>x.employee_id===id).sort((a,b)=>a.event_at<b.event_at?1:-1)[0];
      const now=kstNow();
      if(last && (now-fromIso(last.event_at))/1000<8) return {ok:false,error:"TOO_SOON"};
      const type=(last&&last.event_type==="IN")?"OUT":"IN";
      const iso_now=iso(now);
      s.events.push({id:s.seq++,employee_id:id,event_type:type,event_at:iso_now,server_received_at:iso_now,device_id:CONFIG.DEVICE_ID,substitute_for_employee_id:type==="IN"?subForId:null}); save(s);
      return {ok:true,type,at:iso_now,name:e.name}; },
    async rangeEvents(fromStr,toStr){ const s=load();
      return s.events.filter(x=>x.event_at>=fromStr && x.event_at<toStr); },
  };
})();

/* ---------------------- Supabase 구현 (준비만) ---------------------- */
/* Supabase 프로젝트 생성 후 CONFIG 채우면 이 경로가 활성화됩니다.
   테이블 스키마는 README/SQL 참고. 여기서는 REST(PostgREST) 직접 호출. */
/* Supabase Auth 세션 (관리자 로그인) */
const Auth = {
  token:null,
  load(){ try{ this.token=JSON.parse(localStorage.getItem("baekeok_auth"))?.access_token||null; }catch(e){ this.token=null; } return this.token; },
  save(session){ localStorage.setItem("baekeok_auth",JSON.stringify(session)); this.token=session.access_token; },
  clear(){ localStorage.removeItem("baekeok_auth"); this.token=null; },
  async login(email,password){
    const r=await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=password`,{
      method:"POST", headers:{apikey:CONFIG.SUPABASE_ANON_KEY,"Content-Type":"application/json"},
      body:JSON.stringify({email,password})});
    const d=await r.json();
    if(!r.ok) throw new Error(d.error_description||d.msg||"로그인 실패");
    this.save(d); return d;
  },
  isLoggedIn(){ return !!this.token; },
  async getUser(){
    if(!this.token) return null;
    const r=await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/user`,{
      headers:{apikey:CONFIG.SUPABASE_ANON_KEY, Authorization:`Bearer ${this.token}`}});
    if(!r.ok) return null;
    return r.json();
  },
  async requestEmailChange(newEmail){
    // updateUser: 이메일 변경 "요청". confirmation 정책에 따라 즉시 완료가 아닐 수 있음.
    const r=await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/user`,{
      method:"PUT", headers:{apikey:CONFIG.SUPABASE_ANON_KEY, Authorization:`Bearer ${this.token}`, "Content-Type":"application/json"},
      body:JSON.stringify({email:newEmail.trim()})});
    const d=await r.json();
    if(!r.ok){
      const err=new Error(d.error_description||d.msg||d.message||"이메일 변경 요청 실패");
      err.authCode=d.error_code||d.code||null;   // 안정적 식별값 우선
      err.authRaw=(d.error_description||d.msg||d.message||"");
      err.httpStatus=r.status;
      throw err;
    }
    return d;
  },
};

const SupaBE = (()=>{
  const rpc=async(fn,args={},useAuth=false)=>{
    const headers={apikey:CONFIG.SUPABASE_ANON_KEY,"Content-Type":"application/json",
      "Authorization":`Bearer ${useAuth&&Auth.token?Auth.token:CONFIG.SUPABASE_ANON_KEY}`};
    const r=await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/${fn}`,{method:"POST",headers,body:JSON.stringify(args)});
    if(!r.ok){ throw new Error(await r.text()); }
    const t=await r.text(); if(!t) return null;
    try{ return JSON.parse(t); }catch(e){ return null; }
  };
  return {
    // --- POS (anon) ---
    async listEmployeesState(){ return rpc("list_employees_state",{p_store_id:CURRENT_STORE_ID||null}); },
    async dashboard(){ return rpc("hq_store_dashboard",{},true); },
    async isAdmin(){ return rpc("is_admin",{},true); },
    async scheduleList(fromDate,toDate){ return rpc("admin_schedule_list",{p_from:fromDate,p_to:toDate},true); },
    async scheduleSet(empId,date,status,start,end,memo){ return rpc("admin_schedule_set",{p_employee_id:empId,p_work_date:date,p_status:status,p_start:start||null,p_end:end||null,p_memo:memo||null},true); },
    async scheduleDelete(empId,date){ return rpc("admin_schedule_delete",{p_employee_id:empId,p_work_date:date},true); },
    // 계약서 (schema_v11): metadata는 RPC, 파일은 Storage(admin JWT)
    async docList(empId){ return rpc("admin_doc_list",{p_employee_id:empId},true); },
    async employeeContractStatuses(){ return rpc("admin_employee_contract_statuses",{},true); },
    async docAdd(empId,path,filename,ctype,size){ return rpc("admin_doc_add",{p_employee_id:empId,p_storage_path:path,p_filename:filename,p_content_type:ctype,p_byte_size:size},true); },
    async docDelete(docId){ return rpc("admin_doc_delete",{p_document_id:docId},true); },
    async docUpload(path,file){
      // Storage 직접 업로드 (upsert 금지 → x-upsert:false). objects policy가 is_admin 강제.
      const r=await fetch(`${CONFIG.SUPABASE_URL}/storage/v1/object/employee-docs/${path}`,{
        method:"POST",
        headers:{ apikey:CONFIG.SUPABASE_ANON_KEY, Authorization:`Bearer ${Auth.token}`, "Content-Type":file.type, "x-upsert":"false" },
        body:file });
      if(!r.ok){ let m=""; try{m=(await r.json()).message||"";}catch(_){}  throw new Error("STORAGE_UPLOAD_FAILED:"+r.status+":"+m); }
      return true;
    },
    async docRemove(path){
      // compensating cleanup
      const r=await fetch(`${CONFIG.SUPABASE_URL}/storage/v1/object/employee-docs/${path}`,{
        method:"DELETE", headers:{ apikey:CONFIG.SUPABASE_ANON_KEY, Authorization:`Bearer ${Auth.token}` }});
      return r.ok;
    },
    async docSignedUrl(path,expiresSec){
      // 짧은 만료 signed URL 발급 (admin JWT). DB 저장 안 함
      const r=await fetch(`${CONFIG.SUPABASE_URL}/storage/v1/object/sign/employee-docs/${path}`,{
        method:"POST", headers:{ apikey:CONFIG.SUPABASE_ANON_KEY, Authorization:`Bearer ${Auth.token}`, "Content-Type":"application/json" },
        body:JSON.stringify({expiresIn:expiresSec||60}) });
      if(!r.ok) throw new Error("SIGN_FAILED:"+r.status);
      const d=await r.json();
      return CONFIG.SUPABASE_URL + "/storage/v1" + d.signedURL;  // signedURL은 상대경로
    },
    async storeSettingsGet(){ return rpc("admin_store_settings_get",{p_store_id:CURRENT_STORE_ID||1},true); },
    async storeSettingsSet(openMin,closeMin){ return rpc("admin_store_settings_set",{p_open_minute:openMin,p_close_minute:closeMin,p_close_grace_minutes:0,p_store_id:CURRENT_STORE_ID||1},true); },
    async enforceStoreClose(){ return rpc(["system","enforce","store","close"].join("_"),{p_store_id:CURRENT_STORE_ID||1},true); },
    async listAdmins(){ return rpc("admin_list_admins",{},true); },
    async listAuthUsers(){ return rpc("admin_list_auth_users",{},true); },
    async grantAdmin(email){ return rpc("admin_grant",{p_email:email},true); },
    async revokeAdmin(userId){ return rpc("admin_revoke",{p_user_id:userId},true); },
    async punch(id,pin,subForId=null){ return rpc("punch",{p_employee_id:id,p_pin:pin,p_device:CONFIG.DEVICE_ID,p_substitute_for_employee_id:subForId}); },
    // --- 관리자 (authenticated) ---
    async allEmployees(){ return CURRENT_STORE_ID?rpc("list_store_employees",{p_store_id:CURRENT_STORE_ID},true):rpc("admin_list_all_employees",{},true); },
    async createEmployee(name,pin){ const storeId=Number(CURRENT_STORE_ID)||Number(sessionStorage.getItem("baekeok_store_id"))||1;return rpc("admin_create_employee_for_store",{p_name:name.trim(),p_pin:pin,p_store_id:storeId},true); },
    async createEmployeeOnboarding(x){ const storeId=Number(CURRENT_STORE_ID)||Number(sessionStorage.getItem("baekeok_store_id"))||1;return rpc("admin_create_employee_onboarding_for_store",{...x,p_store_id:storeId},true); },
    async deactivateEmployee(id){ return rpc("admin_deactivate_employee",{p_id:id},true); },
    async retireEmployee(id,endedOn){ return rpc("admin_retire_employee",{p_id:id,p_ended_on:endedOn},true); },
    async updateEmployee(id,fields){ return rpc("admin_update_employee",{p_id:id,p_fields:fields},true); },
    async rangeEvents(fromIso,toIso){ return rpc("admin_events",{p_from:fromIso,p_to:toIso},true); },
    // --- M4: 정정/수정 ---
    async myEvents(id,pin,fromIso,toIso){ return rpc("my_events",{p_employee_id:id,p_pin:pin,p_from:fromIso,p_to:toIso}); },
    async requestCorrection(id,pin,kind,eventId,reqAt,reqType,note){ return rpc("request_correction",{p_employee_id:id,p_pin:pin,p_kind:kind,p_event_id:eventId,p_requested_at:reqAt,p_requested_type:reqType,p_note:note}); },
    async pendingRequests(){ return rpc("admin_pending_requests",{},true); },
    async resolveRequest(reqId,approve,reason){ return rpc("admin_resolve_request",{p_request_id:reqId,p_approve:approve,p_reject_reason:reason||null},true); },
    async correctEvent(action,eventId,empId,newAt,newType,reason){ return rpc("admin_correct_event",{p_action:action,p_event_id:eventId,p_employee_id:empId,p_new_at:newAt,p_new_type:newType,p_reason:reason},true); },
    async eventsWithCorrections(fromIso,toIso){ return rpc("admin_events_with_corrections",{p_from:fromIso,p_to:toIso},true); },
    // --- M5: 급여기간 ---
    async payrollPeriod(ym){ return rpc("admin_payroll_period",{p_ym:ym},true); },
    async payrollContracts(ym){ return rpc("admin_store_payroll_contracts",{p_store_id:CURRENT_STORE_ID||1,p_month:ym+"-01"},true); },
    async payrollContractWorkdays(ym){ return rpc("admin_store_payroll_contract_workdays",{p_store_id:CURRENT_STORE_ID||1,p_month:ym+"-01"},true); },
    async payrollSubstitutions(ym){ return rpc("admin_payroll_substitutions",{p_store_id:CURRENT_STORE_ID||1,p_ym:ym},true); },
    async payrollBreakDecisions(fromIso,toIso){ return rpc("admin_attendance_break_decisions",{p_store_id:CURRENT_STORE_ID||1,p_from:fromIso,p_to:toIso},true); },
    async payrollBreakDecisionSave(empId,inEventId,provided,compensate){ return rpc("admin_attendance_break_decision_save",{p_store_id:CURRENT_STORE_ID||1,p_employee_id:empId,p_in_event_id:inEventId,p_break_provided:provided,p_compensate_30m:compensate},true); },
    async setPeriodWeeks(ym,weeks){ return rpc("admin_set_period_weeks",{p_ym:ym,p_weeks:weeks},true); },
    async setPeriodEmployee(ym,empId,fields){ return rpc("admin_set_period_employee",{p_ym:ym,p_employee_id:empId,p_fields:fields},true); },
    // --- M8: 마감/스냅샷 ---
    async closePayroll(ym,rows,fingerprint){ return rpc("admin_close_payroll",{p_ym:ym,p_rows:rows,p_fingerprint:fingerprint},true); },
    async reopenPayroll(ym){ return rpc("admin_reopen_payroll",{p_ym:ym},true); },
    async snapshot(ym){ return rpc("admin_snapshot",{p_ym:ym},true); },
    // M8.7: 구글시트 동기화 (Edge Function 호출)
    async syncSheet(ym, payload){
      const r=await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/sync-sheet`,{
        method:"POST",
        headers:{"Authorization":`Bearer ${Auth.token||CONFIG.SUPABASE_ANON_KEY}`,"Content-Type":"application/json"},
        body:JSON.stringify({ym,payload})
      });
      const t=await r.text(); let j=null; try{ j=JSON.parse(t); }catch(e){}
      if(!r.ok || (j&&j.ok===false)) throw new Error((j&&(j.error||j.detail))||t.slice(0,200));
      return j;
    },
    async todayEvents(){ const t=kstNow(); const p=n=>String(n).padStart(2,"0");
      const day=`${t.getFullYear()}-${p(t.getMonth()+1)}-${p(t.getDate())}`;
      return this.rangeEvents(`${day}T00:00:00`,`${day}T23:59:59`); },
    async operationsSummary(from,to){ return rpc("admin_operations_summary",{p_from:from,p_to:to},true); },
    async operationsAnalytics(from,to){ return rpc("admin_operations_analytics",{p_from:from,p_to:to},true); },
    async operationsTrend(windowKey){ return rpc("admin_operations_trend",{p_window:windowKey},true); },
    async inventoryOverview(){ return rpc("admin_inventory_overview_v3",{},true); },
    async inventoryUnitConfigSave(itemId,stockUnit,orderUnit,conversionQuantity){ return rpc("admin_inventory_unit_config_save",{p_item_id:Number(itemId),p_stock_unit:stockUnit,p_order_unit:orderUnit,p_conversion_quantity:Number(conversionQuantity)},true); },
    async inventoryPurchaseOrders(){ return rpc("admin_inventory_purchase_order_list",{p_store_id:CURRENT_STORE_ID||1,p_open_only:true},true); },
    async inventoryPurchaseOrder(row,quantity,note){ return rpc("admin_inventory_purchase_order_create",{p_store_id:CURRENT_STORE_ID||1,p_item_id:row.manual?null:(row.source_item_id||row.id||null),p_manual_item_id:row.manual?row.id:null,p_quantity:Number(quantity),p_note:note||null},true); },
    async inventoryReceive(orderId,quantity){ return rpc("admin_inventory_purchase_receive",{p_order_id:Number(orderId),p_quantity:Number(quantity)},true); },
    async inventoryManualList(){ return rpc("admin_inventory_manual_list",{p_store_id:CURRENT_STORE_ID||1},true); },
    async inventoryManualSave(id,name,sku,category,unit,onHand,targetLevel,reorderPoint,thumbnailUrl,sourceItemId=null){ return rpc("admin_inventory_manual_save_v2",{p_id:id||null,p_store_id:CURRENT_STORE_ID||1,p_name:name,p_sku:sku||null,p_category:category||null,p_unit:unit||"ea",p_on_hand:Number(onHand||0),p_target_level:Number(targetLevel||0),p_reorder_point:Number(reorderPoint||0),p_thumbnail_url:thumbnailUrl||null,p_source_item_id:sourceItemId||null},true); },
    async inventoryMovements(itemId,from,to){ return rpc("admin_inventory_movements",{p_item_id:itemId||null,p_from:from||null,p_to:to||null},true); },
    async recipeList(){ return rpc("admin_recipe_list_v2",{},true); },
    async recipeSave(id,name,category,components,thumbnailUrl){ return rpc("admin_recipe_save",{p_recipe_id:id||null,p_menu_name:name,p_category:category||null,p_components:components||[],p_thumbnail_url:thumbnailUrl||null},true); },
    async hqProductList(){ return rpc("admin_hq_product_list",{},true); },
    async hqProductSave(id,payload){ return rpc("admin_hq_product_save",{p_product_id:id||null,p_payload:payload},true); },
    async hqProductApply(id,action){ return rpc("admin_hq_product_apply",{p_product_id:id,p_action:action},true); },
    async hqProductSchedule(id,launchDate){ return rpc("admin_hq_product_schedule",{p_product_id:id,p_launch_date:launchDate||null},true); },
    async hqProductRemovalSchedule(ids,removalDate){ return rpc("admin_hq_product_removal_schedule",{p_product_ids:ids,p_removal_date:removalDate},true); },
    async reconciliationIssues(from,to){ return rpc("admin_reconciliation_issues",{p_from:from,p_to:to},true); },
    async seedOperationsDemo(){ return rpc("admin_seed_operations_demo",{},true); },
    async clearOperationsDemo(){ return rpc("admin_clear_operations_demo",{},true); },
    async operationsTransactions(from,to,type){ return rpc("admin_operations_transactions",{p_from:from,p_to:to,p_type:type||null},true); },
    async operationsInquiry(from,to,type,channel){ return rpc("admin_operations_inquiry",{p_from:from,p_to:to,p_type:type||null,p_channel:channel||null},true); },
    async operationsChannels(from,to){ return rpc("admin_operations_channels",{p_from:from,p_to:to},true); },
    async inventoryItems(){ return rpc("admin_inventory_items",{},true); },
    async adminContext(){ return rpc("admin_context",{},true); },
    async storeRecipeList(storeId){ return rpc("admin_store_recipe_list",{p_store_id:storeId||CURRENT_STORE_ID||1},true); },
    async publicStoreRecipeList(storeId){ return publicRpc("store_recipe_list_public",{p_store_id:storeId||CURRENT_STORE_ID||1}); },
    async staffRecipeList(employeeId,pin,storeId){ return rpc("staff_recipe_list",{p_employee_id:employeeId,p_pin:pin,p_store_id:storeId||CURRENT_STORE_ID||1}); },
    async storeRecipeOverrideSave(storeId,menuKey,name,category,components,thumbnailUrl,instructions){ return rpc("admin_store_recipe_override_save",{p_store_id:storeId||CURRENT_STORE_ID||1,p_menu_key:menuKey,p_menu_name:name||null,p_category:category||null,p_components:components||[],p_thumbnail_url:thumbnailUrl||null,p_instructions:instructions||[]},true); },
    async storeRecipeOverrideClear(storeId,menuKey){ return rpc("admin_store_recipe_override_clear",{p_store_id:storeId||CURRENT_STORE_ID||1,p_menu_key:menuKey},true); },
    async storeProductRetirementFinalize(storeId,productId){ return rpc("admin_store_product_retirement_finalize",{p_store_id:storeId||CURRENT_STORE_ID||1,p_product_id:productId},true); },
    async operationsImports(){ return rpc("admin_operations_imports",{},true); },
    async operationsImportStage(source,fileName,rows){ return rpc("admin_operations_import_stage",{p_source:source,p_file_name:fileName,p_rows:rows},true); },
    async operationsCollectRequest(source){ return rpc("admin_operations_collect_request",{p_source:source},true); },
    async monthEvents(ym){ const [y,m]=ym.split("-").map(Number); const p=n=>String(n).padStart(2,"0");
      const start=new Date(y,m-1,1); start.setDate(start.getDate()-1);
      const end=new Date(y,m,1); end.setDate(end.getDate()+2);
      const sd=`${start.getFullYear()}-${p(start.getMonth()+1)}-${p(start.getDate())}`;
      const ed=`${end.getFullYear()}-${p(end.getMonth()+1)}-${p(end.getDate())}`;
      return this.rangeEvents(`${sd}T00:00:00`,`${ed}T00:00:00`); },
  };
})();

const publicRpc=async(fn,args={})=>{
  const headers={apikey:CONFIG.SUPABASE_ANON_KEY,"Content-Type":"application/json","Authorization":`Bearer ${CONFIG.SUPABASE_ANON_KEY}`};
  const r=await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/${fn}`,{method:"POST",headers,body:JSON.stringify(args)});
  if(!r.ok) throw new Error(await r.text());
  const t=await r.text();return t?JSON.parse(t):null;
};

const BE = LIVE ? SupaBE : LocalBE;
const STORE_ENTRY_PARAMS=new URLSearchParams(location.search);
const STORE_ENTRY_MODE=String(STORE_ENTRY_PARAMS.get("mode")||"").toLowerCase();
const STORE_ENTRY_PATH=/\/inha(?:\/|$)/i.test(location.pathname)||/\/store\/1(?:\/|$)/i.test(location.pathname);
// 지점 잠금은 URL/전용 경로로 진입한 경우에만 적용한다. 과거 sessionStorage 잠금값이 HQ 대시보드까지 인하대점으로 고정하던 문제를 제거.
let STORE_ENTRY_SAVED=false;
try{ sessionStorage.removeItem("baekeok_dedicated_store"); }catch(_){}
const STORE_ENTRY_ID=Number(STORE_ENTRY_PARAMS.get("store"))||((STORE_ENTRY_MODE==="store"||STORE_ENTRY_PATH)?1:0);
const STORE_ENTRY_LOCK=STORE_ENTRY_MODE==="store"||STORE_ENTRY_ID>0||STORE_ENTRY_PATH;
let CURRENT_STORE_ID=STORE_ENTRY_ID||1;
if(STORE_ENTRY_ID){ try{sessionStorage.setItem("baekeok_store_id",String(STORE_ENTRY_ID))}catch(_){} }
// Dedicated store entry: remove the selector node entirely so later CSS/header changes cannot revive it.
if(STORE_ENTRY_LOCK){
  const shell=document.querySelector(".store-select-shell");
  if(shell) shell.remove();
}
let STORE_NAME_BY_ID=new Map();
function syncStoreContextUI(){
  const dashboard=(location.hash||"")==="#dashboard";
  const sel=document.getElementById("storeSelect"),shell=document.querySelector(".store-select-shell"),crumb=document.getElementById("storeCrumb"),lockedName=document.getElementById("lockedStoreName"),tabs=document.querySelector(".tabwrap"),home=document.getElementById("hqHome");
  // 지점 선택 콤보는 본사 대시보드에서만 노출한다. 출퇴근/근무현황/레시피/관리/급여 등 모든 지점 화면에서는 숨김.
  const showSelector=dashboard&&!STORE_ENTRY_LOCK;
  if(sel){sel.classList.toggle("store-context-selector-hidden",!showSelector);sel.hidden=!showSelector;}
  if(shell){shell.classList.toggle("store-context-selector-hidden",!showSelector);shell.hidden=!showSelector;}
  if(crumb){crumb.classList.toggle("store-context-selector-hidden",dashboard);crumb.hidden=dashboard;}
  if(lockedName){const name=STORE_NAME_BY_ID.get(Number(CURRENT_STORE_ID))||sessionStorage.getItem("baekeok_store_name")||sel?.selectedOptions?.[0]?.text||"현재 지점";lockedName.textContent=name;lockedName.classList.toggle("show",STORE_ENTRY_LOCK&&!dashboard);lockedName.hidden=!(STORE_ENTRY_LOCK&&!dashboard);}
  if(tabs)tabs.style.display=dashboard?"none":"";
  if(home){home.disabled=STORE_ENTRY_LOCK;home.style.cursor=STORE_ENTRY_LOCK?"default":"pointer";home.setAttribute("aria-label",STORE_ENTRY_LOCK?"백억커피":"본사 대시보드");home.title=STORE_ENTRY_LOCK?"":"본사 대시보드";}
  if(STORE_ENTRY_LOCK&&dashboard)location.hash="#pos";
}
function openHqDashboard(){
  if(STORE_ENTRY_LOCK)return;
  if(location.hash!=="#dashboard")history.pushState(null,"",location.pathname+location.search+"#dashboard");
  route();
}
function syncStoreSelectDisplay(){
 const sel=document.getElementById("storeSelect");if(!sel)return;
 const id=Number(CURRENT_STORE_ID)||Number(sessionStorage.getItem("baekeok_store_id"))||1;
 if([...sel.options].some(o=>Number(o.value)===id))sel.value=String(id);
}
async function loadStores(){
 const sel=document.getElementById("storeSelect");
 if(!sel){
   if(STORE_ENTRY_LOCK){
     CURRENT_STORE_ID=STORE_ENTRY_ID||1;
     sessionStorage.setItem("baekeok_store_id",String(CURRENT_STORE_ID));
     try{
       const rows=await publicRpc("list_stores",{});
       STORE_NAME_BY_ID=new Map((rows||[]).map(x=>[Number(x.id),String(x.name||"")]));
       const name=STORE_NAME_BY_ID.get(Number(CURRENT_STORE_ID));if(name)sessionStorage.setItem("baekeok_store_name",name);
     }catch(e){}
     syncStoreContextUI();
   }
   return;
 }
 const applyStore=id=>{id=Number(id);if(!id||id===Number(CURRENT_STORE_ID))return;CURRENT_STORE_ID=id;sessionStorage.setItem("baekeok_store_id",String(id));const name=STORE_NAME_BY_ID.get(id)||sel.selectedOptions?.[0]?.text||"";if(name)sessionStorage.setItem("baekeok_store_name",name);if(location.hash==="#dashboard")location.hash="#pos";else route()};
 sel.onchange=()=>applyStore(sel.value);
 if(!LIVE){syncStoreSelectDisplay();return}
 try{
  const rows=await publicRpc("list_stores",{});if(!Array.isArray(rows)||!rows.length)throw new Error("EMPTY_STORES");
  STORE_NAME_BY_ID=new Map(rows.map(x=>[Number(x.id),String(x.name||"")]));
  sel.innerHTML=rows.map(x=>'<option value="'+Number(x.id)+'">'+safeHtml(x.name)+'</option>').join("");
  const requested=STORE_ENTRY_ID&&rows.some(x=>Number(x.id)===STORE_ENTRY_ID)?STORE_ENTRY_ID:0;
  const inha=rows.find(x=>Number(x.id)===1);
  CURRENT_STORE_ID=requested||(inha?1:Number(rows[0].id));
  sel.value=String(CURRENT_STORE_ID);sessionStorage.setItem("baekeok_store_id",String(CURRENT_STORE_ID));
  const name=STORE_NAME_BY_ID.get(CURRENT_STORE_ID);if(name)sessionStorage.setItem("baekeok_store_name",name);
  syncStoreContextUI();
 }catch(e){console.warn("store list load failed",e);syncStoreSelectDisplay()}
}
// Any database/user-controlled text inserted through innerHTML must pass this boundary.
function safeHtml(value){
  return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}
function employeeNumber(employee){ return Number(employee?.employee_no)||Number(employee?.id)||0; }

/* ============================ 공통 로직 ============================ */
// GPT판 pair_events 이식: IN/OUT 세션화 + 미완결/고아 감지
// 원본 이벤트 + 보정 → 유효 이벤트 목록 (원본 불변, 최신 보정 우선)
function applyCorrections(events, corrections){
  const corrByEvent={}; const added=[];
  for(const c of (corrections||[])){
    if(c.action==="ADD"){ added.push(c); continue; }
    // 같은 event_id의 보정 중 최신만 유효
    if(c.event_id!=null){ const prev=corrByEvent[c.event_id];
      if(!prev || new Date(c.created_at)>new Date(prev.created_at)) corrByEvent[c.event_id]=c; }
  }
  const eff=[];
  for(const e of (events||[])){
    const c=corrByEvent[e.id];
    if(c){
      if(c.action==="VOID") continue; // 무효화된 이벤트 제외
      eff.push({ id:e.id, employee_id:e.employee_id,
        event_type: c.action==="EDIT_TYPE"&&c.new_event_type ? c.new_event_type : e.event_type,
        event_at: c.action==="EDIT_TIME"&&c.new_event_at ? c.new_event_at : e.event_at,
        corrected:true });
    } else {
      eff.push({ id:e.id, employee_id:e.employee_id, event_type:e.event_type, event_at:e.event_at });
    }
  }
  // 관리자가 추가(ADD)한 누락분
  for(const c of added){
    eff.push({ id:"add_"+c.id, employee_id:c.employee_id, event_type:c.new_event_type,
      event_at:c.new_event_at, corrected:true, addedByAdmin:true });
  }
  return eff;
}
function pairEvents(rows){
  // 정렬: effective 시간값 우선, 동일 시각이면 event id로 deterministic tie-break
  //  (문자열 사전식 비교 제거 — 형식 혼재 시 순서 역전 방지. correction 후에도 원본 id 유지됨)
  const s=[...rows].sort((a,b)=>{
    const ta=fromIso(a.event_at).getTime(), tb=fromIso(b.event_at).getTime();
    const na=isNaN(ta), nb=isNaN(tb);
    if(na||nb){ if(na&&nb) return 0; return na?1:-1; }  // Invalid는 뒤로
    if(ta!==tb) return ta-tb;
    // 동일 시각 → id 차선 (raw 생성순서 보존). id는 숫자 또는 "add_N"
    return idOrder(a.id) - idOrder(b.id);
  });
  const out=[]; let openIn=null, openInId=null, openInRaw=null;
  for(const r of s){
    const when=fromIso(r.event_at);
    if(r.event_type==="IN"){
      if(openIn!==null) out.push({in:openIn,out:null,sec:null,status:"INCOMPLETE",inId:openInId,outId:null,inRaw:openInRaw,outRaw:null});
      openIn=when; openInId=r.id; openInRaw=r.event_at;
    }else if(r.event_type==="OUT"){
      if(openIn!==null){
        // Invalid Date 방어: 어느 한쪽이라도 파싱 실패면 sec=null(합산 제외), status로 표시
        const sec=(isNaN(openIn)||isNaN(when))?null:(when-openIn)/1000;
        out.push({in:openIn,out:when,sec,status:sec==null?"INVALID_TIME":"COMPLETE",inId:openInId,outId:r.id,inRaw:openInRaw,outRaw:r.event_at}); openIn=null; openInId=null; openInRaw=null;
      }
      else out.push({in:null,out:when,sec:null,status:"ORPHAN_OUT",inId:null,outId:r.id,inRaw:null,outRaw:r.event_at});
    }
  }
  if(openIn!==null) out.push({in:openIn,out:null,sec:null,status:"WORKING",inId:openInId,outId:null,inRaw:openInRaw,outRaw:null});
  return out;
}
// id 정렬 보조: 숫자 id는 그대로, "add_N"(관리자 추가)은 N을 큰 오프셋 뒤에 둬 raw 뒤 안정 배치
function idOrder(id){
  if(typeof id==="number") return id;
  const m=String(id).match(/^add_(\d+)$/);
  if(m) return 1e15 + (+m[1]);   // add는 동일시각 시 raw 다음
  const n=Number(id); return isNaN(n)?0:n;
}
async function empState(id){
  const last=await BE.lastEvent(id);
  if(last && last.event_type==="IN") return {state:"WORKING",last};
  return {state:"OFF",last};
}

/* ============================ UI: 라우팅 ============================ */
const view=document.getElementById("view");
let _posTimer=null;
// addVeil 열기: modal 우상단 X 자동 주입(닫기 = 취소와 동일). 모든 열기 지점이 이걸 사용.
function openAddVeil(){
  const v=document.getElementById("addVeil");
  const modal=v.querySelector(".modal");
  if(modal && !modal.querySelector(".modal-x")){
    const x=document.createElement("button");
    x.className="btn-icon modal-x"; x.setAttribute("aria-label","닫기"); x.innerHTML=ICON.close;
    x.onclick=()=>{ v.classList.remove("show"); restoreAddModal(); };
    modal.insertBefore(x, modal.firstChild);
  }
  attachNoDoubleTapZoom(v);   // 모달 영역 한정 double-tap zoom 차단 (helper, 1회 부착)
  v.classList.add("show");
  refreshNextEmployeeNumber();
}
async function refreshNextEmployeeNumber(){
  const el=document.getElementById("newEmpNo");
  if(!el) return;
  el.textContent="계산 중…";
  try{
    const emps=await BE.allEmployees();
    const maxNo=(emps||[]).reduce((m,e)=>Math.max(m,employeeNumber(e)),0);
    el.textContent="No."+String(maxNo+1);
  }catch(_){
    el.textContent="등록 시 자동 발급";
  }
}
// iOS Safari double-tap zoom 국소 차단.
//  - 대상: 전달된 요소(모달 오버레이) 내부에서만. document/body 전역 아님.
//  - 판정: 300ms 이내 + 근접 좌표(30px)에서 두 번째 touchend = 실제 double-tap → 그것만 preventDefault.
//  - single tap / 먼 위치 / 느린 탭 = 통과 → 버튼 click·세로스크롤 정상. touchend double-fire 유발 안 함.
//  - 핀치는 별도 gesture/멀티터치 핸들러가 담당(그대로 유지).
function attachNoDoubleTapZoom(el){
  if(!el || el.__ndtz) return;   // 중복 부착 방지
  el.__ndtz = true;
  let lastT=0, lastX=0, lastY=0;
  el.addEventListener("touchend", (e)=>{
    if(e.touches && e.touches.length>0) return;      // 멀티터치 잔여는 무시
    // 파일선택/select/textarea/input 등 네이티브 동작이 필요한 타겟은 제외 (다이얼로그/키보드 보호)
    const tgt=e.target;
    if(tgt && tgt.closest && tgt.closest('input,select,textarea,label')) { return; }
    const t=e.changedTouches && e.changedTouches[0];
    if(!t) return;
    const now=Date.now();
    const dt=now-lastT;
    const dx=Math.abs(t.clientX-lastX), dy=Math.abs(t.clientY-lastY);
    if(dt>0 && dt<=300 && dx<30 && dy<30){
      e.preventDefault();
      lastT=0;
    }else{
      lastT=now; lastX=t.clientX; lastY=t.clientY;
    }
  }, {passive:false});
}
async function renderDashboard(){
  let rows=[];try{rows=LIVE?await BE.dashboard():[];}catch(e){view.innerHTML='<div class="empty">대시보드 데이터를 불러오지 못했습니다.</div>';return;}
  const money=n=>Number(n||0).toLocaleString("ko-KR")+"원";
  const total7=rows.reduce((a,r)=>a+Number(r.sales_7d||0),0),totalTx=rows.reduce((a,r)=>a+Number(r.tx_count||0),0);
  const avg=rows.length?Math.round(total7/rows.length):0;
  let ranked=[...rows];
  const summary='<div class="hq-summary"><div><span>운영 지점</span><b>'+rows.length+'개</b></div><div><span>전체 최근 7일 매출</span><b>'+money(total7)+'</b></div><div><span>지점 평균 7일 매출</span><b>'+money(avg)+'</b></div><div><span>누적 거래</span><b>'+totalTx.toLocaleString("ko-KR")+'건</b></div></div>';
  const cards=ranked.map((r,idx)=>{
    const pts=Array.isArray(r.trend)?r.trend:[],recent=pts.slice(-14),max=Math.max(1,...recent.map(x=>Number(x.sales||0)));
    const md=v=>{const d=String(v||"").slice(0,10).split("-");return d.length===3?Number(d[1])+"/"+Number(d[2]):String(v||"");};
    const trendRange=recent.length?(md(recent[0].date)+" ~ "+md(recent[recent.length-1].date)):"기간 없음";
    const bars=recent.map(x=>'<i class="hq-tip-target" tabindex="0" data-tip="'+safeHtml(md(x.date)+' · '+money(x.sales))+'" aria-label="'+safeHtml(md(x.date)+' '+money(x.sales))+'" style="height:'+Math.max(16,Math.round(Number(x.sales||0)/max*74))+'px"><span class="hq-bar-date">'+safeHtml(md(x.date))+'</span></i>').join("");
    const menus=Array.isArray(r.menu_trend)?r.menu_trend:[],menuMax=Math.max(1,...menus.map(x=>Number(x.sales||0)));
    const menuRows=menus.slice(0,5).map(m=>{const ch=m.channels||{};const parts=Object.entries(ch).map(([k,v])=>k+' '+Number(v||0).toLocaleString("ko-KR")+'건');const tip=m.name+' · 총 '+Number(m.orders||0).toLocaleString("ko-KR")+'건'+(parts.length?'\n'+parts.join(' · '):'');return '<div class="hq-menu-row"><span class="hq-flow"><span class="hq-flow-inner">'+safeHtml(m.name)+'</span></span><i class="hq-tip-target" tabindex="0" data-tip="'+safeHtml(tip)+'" aria-label="'+safeHtml(tip)+'"><em style="width:'+Math.round(Number(m.sales||0)/menuMax*100)+'%"></em></i><b class="hq-flow"><span class="hq-flow-inner">'+money(m.sales)+'</span></b></div>'}).join("");
    return '<article class="hq-store-panel" data-store="'+r.store_id+'" data-store-name="'+safeHtml(r.store_name)+'"><div class="hq-store-head"><div class="hq-flow"><span class="hq-flow-inner"><small>#'+(idx+1)+'</small><b>'+safeHtml(r.store_name)+'</b></span></div><button type="button">상세 ›</button></div><div class="hq-store-kpi hq-flow"><span class="hq-flow-inner"><b>'+money(r.sales_7d)+'</b><span>최근 7일 매출</span><span class="hq-total-sales">(누적: '+money(r.sales_total)+')</span></span></div><div class="hq-chart-title">매출 추이 · 최근 14일 <span class="hq-chart-range">('+trendRange+')</span></div><div class="hq-bars">'+bars+'</div><div class="hq-chart-title">메뉴별 매출 · 최근 7일</div><div class="hq-menu-list">'+menuRows+'</div></article>';
  }).join("");
  const regions=["전체 지역",...new Set(rows.map(r=>r.region_group||"기타"))];
  view.innerHTML='<div class="hq-dashboard"><div class="hq-title"><div class="hq-title-row"><h2>지점 현황</h2><button type="button" class="btn btn-secondary btn-sm hq-product-button" id="hqProductControl">상품 배포</button></div><div class="hq-filterbar"><label class="hq-store-search" aria-label="지점명 검색"><input id="hqStoreSearch" type="search" placeholder="지점명 검색" autocomplete="off"></label><label class="hq-region-filter" aria-label="지역 선택"><select id="hqRegionSelect">'+regions.map(x=>'<option value="'+safeHtml(x)+'">'+safeHtml(x)+'</option>').join("")+'</select></label><label class="hq-region-filter" aria-label="정렬 기준 선택"><select id="hqSortSelect"><option value="sales7">최근 7일 매출</option><option value="total">누적 매출</option><option value="tx">거래 건수</option><option value="name">지점명</option></select></label></div></div>'+summary+'<div class="hq-grid">'+cards+'</div><div class="empty" id="hqRegionEmpty" style="display:none">이 지역에 운영 중인 지점이 없습니다.</div></div>';
  document.getElementById("hqProductControl").onclick=()=>window.openHqProductModal?.();
  const bindStoreButtons=()=>view.querySelectorAll(".hq-store-panel button").forEach(btn=>btn.onclick=()=>{const c=btn.closest(".hq-store-panel"),sel=document.getElementById("storeSelect");sel.value=c.dataset.store;CURRENT_STORE_ID=Number(c.dataset.store);sessionStorage.setItem("baekeok_store_id",String(CURRENT_STORE_ID));if(c.dataset.storeName)STORE_NAME_BY_ID.set(CURRENT_STORE_ID,c.dataset.storeName);sel.value=String(CURRENT_STORE_ID);syncStoreSelectDisplay();location.hash="#pos";});
  bindStoreButtons();
  const regionSel=document.getElementById("hqRegionSelect"),sortSel=document.getElementById("hqSortSelect"),searchEl=document.getElementById("hqStoreSearch"),empty=document.getElementById("hqRegionEmpty"),grid=view.querySelector(".hq-grid");
  const applyDashboardView=()=>{const region=regionSel.value,key=sortSel.value,q=String(searchEl.value||"").trim().toLocaleLowerCase("ko-KR");ranked.sort((a,b)=>key==="total"?Number(b.sales_total)-Number(a.sales_total):key==="tx"?Number(b.tx_count)-Number(a.tx_count):key==="name"?String(a.store_name).localeCompare(String(b.store_name),"ko"):Number(b.sales_7d)-Number(a.sales_7d));let visible=0;ranked.forEach(r=>{const el=view.querySelector('.hq-store-panel[data-store="'+r.store_id+'"]');if(!el)return;grid.appendChild(el);const regionOk=region==="전체 지역"||(r.region_group||"기타")===region,nameOk=!q||String(r.store_name||"").toLocaleLowerCase("ko-KR").includes(q),show=regionOk&&nameOk;el.style.display=show?"":"none";if(show)visible++;});empty.style.display=visible?"none":"block";};
  regionSel.onchange=applyDashboardView;sortSel.onchange=applyDashboardView;searchEl.oninput=applyDashboardView;applyDashboardView();const flow=()=>view.querySelectorAll('.hq-flow').forEach(box=>{const inner=box.querySelector('.hq-flow-inner');if(!inner)return;box.classList.remove('flow-over');inner.style.transform='';const d=Math.max(0,inner.scrollWidth-box.clientWidth);if(d>2){box.style.setProperty('--hq-flow-distance',d+'px');box.style.setProperty('--hq-flow-duration',Math.max(7,Math.min(15,d/14+7))+'s');box.classList.add('flow-over')}});requestAnimationFrame(flow);window.addEventListener('resize',flow,{passive:true,once:true});const tip=document.createElement('div');tip.className='hq-tooltip';document.body.appendChild(tip);let tipTimer;const clearTipActive=()=>view.querySelectorAll('.hq-tip-target.tip-active').forEach(x=>x.classList.remove('tip-active'));const showTip=(el,e)=>{clearTimeout(tipTimer);clearTipActive();el.classList.add('tip-active');tip.textContent=el.dataset.tip||'';tip.classList.add('show');const r=el.getBoundingClientRect(),w=tip.offsetWidth,h=tip.offsetHeight,x=Math.max(8,Math.min(innerWidth-w-8,(e?.clientX||r.left+r.width/2)-w/2)),y=Math.max(8,r.top-h-8);tip.style.left=x+'px';tip.style.top=y+'px'};const dismissTip=()=>{clearTimeout(tipTimer);tip.classList.remove('show');clearTipActive()};view.querySelectorAll('.hq-tip-target').forEach(el=>{el.addEventListener('mouseenter',e=>showTip(el,e));el.addEventListener('mousemove',e=>showTip(el,e));el.addEventListener('mouseleave',dismissTip);el.addEventListener('focus',e=>showTip(el,e));el.addEventListener('blur',dismissTip);el.addEventListener('click',e=>{e.stopPropagation();showTip(el,e)});el.addEventListener('touchstart',e=>{const t=e.touches[0];el._tipTouch={x:t.clientX,y:t.clientY,moved:false}},{passive:true});el.addEventListener('touchmove',e=>{const t=e.touches[0],p=el._tipTouch;if(p&&Math.hypot(t.clientX-p.x,t.clientY-p.y)>8){p.moved=true;dismissTip()}},{passive:true});el.addEventListener('touchend',e=>{const p=el._tipTouch;el._tipTouch=null;if(!p||p.moved)return;e.stopPropagation();const t=e.changedTouches[0];showTip(el,t)},{passive:true});el.addEventListener('touchcancel',()=>{el._tipTouch=null;dismissTip()},{passive:true})});view.addEventListener('click',e=>{if(!e.target.closest('.hq-tip-target'))dismissTip()});view.addEventListener('touchstart',e=>{if(!e.target.closest('.hq-tip-target'))dismissTip()},{passive:true});
}
function setTab(t){
  document.getElementById("tabPos").classList.toggle("on",t==="pos");
  document.getElementById("tabAttendance").classList.toggle("on",t==="attendance");
  document.getElementById("tabRecipe").classList.toggle("on",t==="recipe");
  document.getElementById("tabAdmin").classList.toggle("on",["admin","pay","hours","report","sales","inventory"].includes(t));
}
function isHiddenInhaTestEmployee(e){
  if(Number(CURRENT_STORE_ID)!==1||!e)return false;
  const memo=String(e.memo||"").trim();
  const name=String(e.name||"").trim().toLowerCase();
  return memo==="데모 지점 직원"||memo.includes("테스트")||name.startsWith("test")||name.startsWith("테스트");
}
function adminSubnav(active){
  // 미완성 운영 기능은 인하대점에서만 개발/검증하고 다른 지점에는 노출하지 않는다.
  const tabs=Number(CURRENT_STORE_ID)===1
    ? [["report","리포트"],["admin","직원 관리"],["pay","급여"],["hours","운영시간"],["sales","매출·매입"],["inventory","재고"]]
    : [["admin","직원 관리"],["pay","급여"],["hours","운영시간"]];
  const accountIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path></svg>';
  return '<div class="admin-subnav-shell"><div class="tabs admin-subtabs admin-subtabs-wide">'+tabs.map(([k,n])=>'<a href="#'+k+'" class="'+(active===k?"on":"")+'">'+n+'</a>').join("")+'</div><button type="button" class="admin-account-trigger" id="adminAccountTrigger" aria-label="관리자 계정 메뉴" aria-haspopup="true" aria-expanded="false">'+accountIcon+'</button><div class="admin-account-popover" id="adminAccountPopover" role="menu" hidden><div class="admin-account-label">로그인 계정</div><div class="admin-account-email" id="adminAccountEmail">불러오는 중…</div><div class="admin-account-actions"><button type="button" class="btn btn-secondary" id="adminAccountSettings">설정</button><button type="button" class="btn btn-secondary" id="adminAccountLogout">로그아웃</button></div></div></div>';
}
async function mountAdminSubnav(active){
  // Idempotent: operations shell may rebuild #view; always keep exactly one admin subnav.
  view.querySelectorAll(".admin-subnav-shell").forEach(el=>el.remove());
  view.insertAdjacentHTML("afterbegin",adminSubnav(active));
  const trigger=document.getElementById("adminAccountTrigger"),popover=document.getElementById("adminAccountPopover");
  if(!trigger||!popover)return;
  const close=()=>{popover.hidden=true;trigger.setAttribute("aria-expanded","false")};
  trigger.onclick=async e=>{
    e.stopPropagation();
    const opening=popover.hidden;
    if(!opening){close();return}
    popover.hidden=false;trigger.setAttribute("aria-expanded","true");
    const email=document.getElementById("adminAccountEmail");
    try{const user=LIVE?await Auth.getUser():null;email.textContent=user?.email||"관리자";email.title=user?.email||"관리자"}catch(_){email.textContent="관리자"}
  };
  popover.onclick=e=>e.stopPropagation();
  document.getElementById("adminAccountSettings").onclick=()=>{close();if(LIVE)openPersonalSettings();else toast("out","로컬 모드","설정은 클라우드 연결 후 사용할 수 있습니다.")};
  document.getElementById("adminAccountLogout").onclick=()=>{if(!confirm("로그아웃하시겠습니까?"))return;Auth.clear();location.reload()};
  const outside=e=>{if(!e.target.closest(".admin-subnav-shell"))close()};
  const escape=e=>{if(e.key==="Escape")close()};
  document.addEventListener("click",outside);
  document.addEventListener("keydown",escape);
  window._adminAccountMenuCleanup=()=>{document.removeEventListener("click",outside);document.removeEventListener("keydown",escape)};
}
function upgradeLegacyPageTitle(selector,title){
  const old=view.querySelector(selector);if(!old)return;
  old.className="page-title-row";
  old.innerHTML='<h2 class="page-title">'+safeHtml(title)+'</h2>';
}
function route(){
  const h=(location.hash||"#pos").replace("#","");
  if(window._adminAccountMenuCleanup){window._adminAccountMenuCleanup();window._adminAccountMenuCleanup=null}
  syncStoreContextUI();
  if(h!=="pos"){ clearInterval(_posTimer); }
  if(h==="dashboard"){if(STORE_ENTRY_LOCK){location.hash="#pos";return}setTab("dashboard");requireAuth(renderDashboard);}
  else if(h==="admin"){
    const q=new URLSearchParams(location.search);
    setTab("admin");
    requireAuth(async()=>{
      await renderAdmin();
      await mountAdminSubnav("admin");
      const task=q.get("task"),focus=q.get("focus");
      if(task==="employees"||task==="docs"||focus==="employees") document.getElementById("adEmps")?.scrollIntoView({block:"start"});
      else if(task==="today") document.getElementById("adList")?.scrollIntoView({block:"start"});
      else window.scrollTo({top:0,left:0,behavior:"auto"});
      // focus/resume are one-shot return-navigation hints. Consume them so later normal Admin taps start at the top.
      if(q.has("focus")||q.has("resume")){
        q.delete("focus"); q.delete("resume");
        const qs=q.toString();
        history.replaceState(null,"",location.pathname+(qs?"?"+qs:"")+location.hash);
      }
    });
  }
  else if(h==="attendance"){ setTab("attendance"); if(!LIVE){ location.href="actual_attendance.html"; return; } sessionStorage.removeItem("staff_attendance_auth"); if(Auth.isLoggedIn()){ BE.isAdmin().then(isAdmin=>{ if(isAdmin) location.href="actual_attendance.html"; else openMyRecord(); }).catch(()=>openMyRecord()); return; } openMyRecord(); }
  else if(h==="pay"){ setTab("pay"); requireAuth(async()=>{await renderPay();await mountAdminSubnav("pay");}); }
  else if(["report","sales","inventory","ops"].includes(h)&&Number(CURRENT_STORE_ID)!==1){location.hash="#admin";return;}
  else if(h==="report"){ setTab("report"); requireAuth(async()=>{await renderOperations("dashboard");await mountAdminSubnav("report");}); } else if(h==="sales"){ setTab("sales"); requireAuth(async()=>{await renderOperations("inquiry");await mountAdminSubnav("sales");}); } else if(h==="inventory"){ setTab("inventory"); requireAuth(async()=>{await renderOperations("inventory");await mountAdminSubnav("inventory");}); } else if(h==="recipe"){ setTab("recipe"); renderRecipeHub(); } else if(h==="products"){location.hash="#dashboard";return;} else if(h==="ops"){ setTab("report"); requireAuth(async()=>{await renderOperations("dashboard");await mountAdminSubnav("report");}); }
  else if(h==="hours"){ setTab("hours"); requireAuth(async()=>{await renderStoreHours();upgradeLegacyPageTitle(".store-hours-page>.section-t","운영시간");await mountAdminSubnav("hours");}); }
  else{ setTab("pos"); renderPos(); }
}
// 관리자 탭 로그인 게이트
function requireAuth(then){
  if(!LIVE || Auth.isLoggedIn()){ then(); return; }
  view.innerHTML=`
    <div class="page-title-row"><h2 class="page-title">관리자 로그인</h2></div>
    <div class="field"><label>이메일</label><input id="loginEmail" type="email" autocomplete="username" placeholder="관리자 이메일"></div>
    <div class="field"><label>비밀번호</label><input id="loginPw" type="password" autocomplete="current-password" placeholder="비밀번호"></div>
    <button class="btn btn-primary btn-block btn-lg" id="loginBtn">로그인</button>
    <div id="loginErr" style="color:var(--warn);font-size:.85rem;margin-top:10px"></div>`;
  const submitAdminLogin=async()=>{
    const email=document.getElementById("loginEmail").value.trim();
    const pw=document.getElementById("loginPw").value;
    const errEl=document.getElementById("loginErr");
    if(!email||!pw){ errEl.textContent="이메일과 비밀번호를 입력하세요."; return; }
    document.getElementById("loginBtn").textContent="로그인 중…";
    try{
      await Auth.login(email,pw);
      // 로그인 성공 ≠ 관리자. 서버 is_admin()으로 권한 확인
      let ok=false; try{ ok = await BE.isAdmin(); }catch(_){ ok=false; }
      if(!ok){
        Auth.clear();
        errEl.textContent="이 계정은 관리자 권한이 없습니다. 관리자에게 문의하세요.";
        document.getElementById("loginBtn").textContent="로그인";
        return;
      }
      then();
    }
    catch(e){ errEl.textContent="로그인 실패: 이메일/비밀번호를 확인하세요."; document.getElementById("loginBtn").textContent="로그인"; }
  };
  document.getElementById("loginBtn").onclick=submitAdminLogin;
  ["loginEmail","loginPw"].forEach(id=>document.getElementById(id).addEventListener("keydown",e=>{
    if(e.key==="Enter"&&!e.isComposing){ e.preventDefault(); submitAdminLogin(); }
  }));
}
window.addEventListener("hashchange",route);

/* ---------------------- POS 화면 ---------------------- */
function fmtElapsed(sinceIso){
  if(!sinceIso) return "";
  const sec=(kstNow()-fromIso(sinceIso))/1000;
  const m=Math.max(0,Math.floor(sec/60)); const h=Math.floor(m/60), mm=m%60;
  if(h&&mm) return `${h}시간 ${mm}분`; if(h) return `${h}시간`; return `${mm}분`;
}
async function renderPos(){
  view.innerHTML=`<div class="pos-screen"><div class="page-title-row pos-page-title"><h2 class="page-title">출퇴근</h2><span class="page-title-meta" id="empCount">총 0명</span></div><div class="grid employee-scroll-surface" id="empGrid"></div></div>`;
  const grid=document.getElementById("empGrid");
  let adminMode=false;
  if(LIVE&&Auth.isLoggedIn()){try{adminMode=!!(await BE.isAdmin())}catch(_){adminMode=false}}
  let emps=[];
  try{ emps=await BE.listEmployeesState(); }catch(e){ grid.innerHTML=`<div class="empty">불러오기 실패: ${e.message}</div>`; return; }
  document.getElementById("empCount").textContent=`총 ${emps.length}명`;
  if(!emps.length){ grid.innerHTML=`<div class="empty">등록된 직원이 없습니다.<br>관리자 탭에서 먼저 직원을 등록하세요.</div>`; return; }
  for(const e of emps){
    const card=document.createElement("div");
    card.className="emp"+(e.working?" working":"");
    if(e.working){
      card.innerHTML=`
        <div class="employee-card-primary"><span class="employee-card-identity"><span class="employee-card-name">${safeHtml(e.name)}</span><small class="employee-card-id">(No.${safeHtml(employeeNumber(e))})</small></span><span class="att-card-head-actions"><span class="badge-on">근무중</span></span></div>
        <div class="employee-card-secondary"><div class="employee-card-attendance since" data-since="${e.working_since||''}">${e.working_since?`<span class="employee-card-attendance-main">출근 ${hhmm(fromIso(e.working_since))}</span><span class="employee-card-attendance-duration">${fmtElapsed(e.working_since)}째</span>`:'<span class="employee-card-attendance-main">근무 중</span>'}</div></div>`;
    }else{
      card.innerHTML=`
        <div class="employee-card-primary"><span class="employee-card-identity"><span class="employee-card-name">${safeHtml(e.name)}</span><small class="employee-card-id">(No.${safeHtml(employeeNumber(e))})</small></span><span class="att-card-head-actions"><span class="badge-off">${Number(e.today_work_seconds)>0?"근무 완료":"출근 전"}</span></span></div>
        <div class="employee-card-secondary"><span class="employee-card-secondary-main">${Number(e.today_work_seconds)>0?`오늘 ${fmtDur(Number(e.today_work_seconds))} 근무 · ${e.today_first_in?hhmm(fromIso(e.today_first_in)):"—"}–${e.today_last_out?hhmm(fromIso(e.today_last_out)):"—"}`:"출근 기록 없음"}</span></div>`;
    }
    card.onclick=()=>openPad(e, e.working?"WORKING":"OFF");
    grid.appendChild(card);
    applyCardFlow(card);
  }
  // 경과시간 1분마다 갱신 (초 단위 렌더링 안 함)
  clearInterval(_posTimer);
  _posTimer=setInterval(()=>{
    document.querySelectorAll(".since[data-since]").forEach(el=>{
      const since=el.getAttribute("data-since"); if(!since) return;
      el.innerHTML=`<span class="employee-card-attendance-main">출근 ${hhmm(fromIso(since))}</span><span class="employee-card-attendance-duration">${fmtElapsed(since)}째</span>`;
    });
  }, 60000);
}


function applyCardFlow(root){
  root.querySelectorAll(".employee-card-name,.employee-card-secondary-main,.employee-card-attendance-main,.att-name,.att-info .line1-main,.att-info .line2,.sch-line,.sch-prog-sub").forEach(el=>{
    if(el.dataset.flowReady) return;
    const w=document.createElement("span"); w.className="flow-text";
    while(el.firstChild) w.appendChild(el.firstChild);
    el.appendChild(w); el.dataset.flowReady="1";
    requestAnimationFrame(()=>{ const d=Math.max(0,w.scrollWidth-el.clientWidth); if(d>2){el.classList.add("flow-over");el.style.setProperty("--flow-distance",d+"px");el.style.setProperty("--flow-duration",Math.max(6,Math.min(16,6+d/18))+"s");} });
  });
}

/* ---------------------- PIN 패드 ---------------------- */
const padVeil=document.getElementById("padVeil");
let padBuf="", padEmp=null, padState=null, padBusy=false;
async function openPad(emp,state){
  padEmp=emp; padState=state; padBuf="";
  const subBox=document.getElementById("substitutePunchBox"),subCheck=document.getElementById("substitutePunchCheck"),subSel=document.getElementById("substitutePunchSelect");
  subCheck.checked=false;subSel.style.display="none";subSel.innerHTML="";
  if(state!=="WORKING"){
    subBox.style.display="block";
    try{
      const emps=await BE.listEmployeesState();
      subSel.innerHTML='<option value="">대타 대상 직원 선택</option>'+emps.filter(x=>Number(x.id)!==Number(emp.id)).map(x=>'<option value="'+x.id+'">'+safeHtml(x.name)+'</option>').join("");
    }catch(_){subSel.innerHTML='<option value="">대타 대상 직원 선택</option>';}
    subCheck.onchange=()=>{subSel.style.display=subCheck.checked?"block":"none";};
  }else subBox.style.display="none";
  const isOut = state==="WORKING";
  document.getElementById("padTitle").textContent = emp.name;
  document.getElementById("padWho").textContent = isOut ? "● 근무중 · 비밀번호 입력" : "출근 전 · 비밀번호 입력";
  buildKeys(); drawDots(); padVeil.classList.add("show");
}
function closePad(){ padVeil.classList.remove("show"); padBuf=""; padBusy=false; }
document.getElementById("padCancel").onclick=closePad;
// PIN 패드도 backdrop 클릭으로 닫지 않음 — "취소" 버튼으로만 종료 (오터치 방지)
function drawDots(){
  const d=document.getElementById("padDots"); d.innerHTML="";
  for(let i=0;i<4;i++){ const s=document.createElement("i"); if(i<padBuf.length)s.className="f"; d.appendChild(s); }
}
function buildKeys(){
  const k=document.getElementById("padKeys"); k.innerHTML="";
  const actionLabel = padState==="WORKING" ? "퇴근하기" : "출근하기";
  const layout=["1","2","3","4","5","6","7","8","9","del","0","ok"];
  for(const key of layout){
    const b=document.createElement("button");
    if(key==="del"){ b.textContent="←"; b.className="act"; b.onclick=()=>{ if(padBusy)return; padBuf=padBuf.slice(0,-1);drawDots(); }; }
    else if(key==="ok"){ b.textContent=actionLabel; b.className="act ok-action"; b.onclick=submitPad; }
    else { b.textContent=key; b.onclick=()=>{ if(padBusy)return; if(padBuf.length<4){padBuf+=key;drawDots();} }; }
    k.appendChild(b);
  }
}
async function submitPad(){
  if(padBusy) return;
  if(padBuf.length<4){ return; }
  padBusy=true;                       // 즉시 잠금 (이중발화 방지)
  const okBtn=document.querySelector("#padKeys .ok-action");
  if(okBtn){ okBtn.disabled=true; okBtn.style.opacity="0.4"; okBtn.textContent="처리 중…"; }
  const pin=padBuf;
  try{
    const subCheck=document.getElementById("substitutePunchCheck"),subSel=document.getElementById("substitutePunchSelect");
    let subForId=null;
    if(padState!=="WORKING"&&subCheck.checked){
      subForId=Number(subSel.value)||null;
      if(!subForId){padBusy=false;if(okBtn){okBtn.disabled=false;okBtn.style.opacity="";okBtn.textContent="출근하기";}toast("err","대타 대상 선택","누구의 대타인지 선택하세요.");return;}
    }
    const res=await BE.punch(padEmp.id,pin,subForId);
    if(!res||!res.ok){
      const msg={NO_EMPLOYEE:"직원을 찾을 수 없습니다.",BAD_PIN:"비밀번호가 올바르지 않습니다.",TOO_SOON:"방금 처리되었습니다. 잠시 후 다시.",STORE_CLOSED:"영업 종료 후 출근 제한 시간입니다."}[res&&res.error]||"처리 실패";
      closePad(); toast("err",(res&&res.error==="BAD_PIN")?"비밀번호 오류":"오류",msg); return;
    }
    closePad();
    // 출퇴근 PIN 인증 성공을 현재 브라우저 세션의 직원 인증으로 재사용.
    // 근무현황에서 같은 직원에게 PIN을 다시 요구하지 않는다.
    sessionStorage.setItem("staff_attendance_auth",JSON.stringify({employee_id:Number(padEmp.id),pin:String(pin)}));
    if(res.type==="IN") sessionStorage.setItem("recipe_last_employee",String(padEmp.id));
    else if(sessionStorage.getItem("recipe_last_employee")===String(padEmp.id)) sessionStorage.removeItem("recipe_last_employee");
    showSuccess(res.type, res.name||padEmp.name, kstNow(), res);
    renderPos();
  }catch(e){
    closePad(); toast("err","처리 실패","네트워크를 확인하고 다시 시도해주세요.");
  }finally{
    padBusy=false;
  }
}
// 전체화면 성공 오버레이 (2초 후 자동 종료)
let _successTimer=null;
function showSuccess(type, name, now, res){
  const el=document.getElementById("success");
  const isIn = type==="IN";
  el.className="success "+(isIn?"in":"out");
  document.getElementById("successCheck").textContent="✓";
  document.getElementById("successAction").textContent = isIn?"출근 완료":"퇴근 완료";
  document.getElementById("successName").textContent = name;
  document.getElementById("successTime").textContent = hhmm(now);
  const msgEl=document.getElementById("successMsg");
  msgEl.textContent = isIn ? (res&&res.substitute_for_name ? res.substitute_for_name+"님 대타 출근으로 기록되었습니다" : "오늘도 좋은 하루 되세요") : "수고하셨습니다";
  el.classList.add("show");
  clearTimeout(_successTimer);
  _successTimer=setTimeout(()=>el.classList.remove("show"), 2000);
  el.onclick=()=>{ clearTimeout(_successTimer); el.classList.remove("show"); };
}

/* ---------------------- 직원 본인 기록 / 정정요청 (M4) ---------------------- */
// ── 내 근태 flow: 업무 state 기반 (화면 history 아님) ──
// STEP1 인증(직원선택+PIN) → STEP2 내기록 → STEP3 정정작성
// 뒤로: STEP3→STEP2 (같은 직원, 인증 유지) / STEP2→STEP1 (인증 폐기 = 재인증 강제)
// 다른 직원으로 바꾸려면 STEP1에서 PIN 재입력 필수 → 인증 우회 불가.
async function openMyRecord(){
  let emps=[];
  try{ emps=await BE.listEmployeesState(); }catch(e){ toast("err","오류",e.message); return; }
  if(!emps.length){ toast("err","직원 없음",""); return; }
  // 근무현황 탭은 진입할 때마다 반드시 직원 PIN을 다시 확인한다.
  // 출퇴근 타각 때 사용한 인증/이전 근무현황 인증을 재사용하지 않는다.
  sessionStorage.removeItem("staff_attendance_auth");
  let staffAuth=null;
  try{ staffAuth=JSON.parse(sessionStorage.getItem("staff_attendance_auth")||"null"); }catch(_){ staffAuth=null; }
  if(staffAuth&&staffAuth.employee_id&&/^\d{4}$/.test(String(staffAuth.pin||""))){
    const emp=emps.find(e=>Number(e.id)===Number(staffAuth.employee_id));
    if(emp){
      const r=mrRange();
      try{
        const res=await BE.myEvents(Number(emp.id),String(staffAuth.pin),r.fs,r.ts);
        if(res&&res.ok){ location.href="actual_attendance.html?mode=staff"; return; }
      }catch(_){}
    }
    sessionStorage.removeItem("staff_attendance_auth");
  }
  mrShowAuth(emps, null);
}
// STEP 1: 인증 화면 (preselId: 뒤로 왔을 때 직원 선택만 복원, PIN은 항상 재입력)
function mrShowAuth(emps, preselId){
  const v=document.getElementById("addVeil"); const modal=v.querySelector(".modal");
  modal.classList.remove("has-back");
  modal.innerHTML=`
    <h3>근무현황</h3>
    <div class="field"><label>본인 선택</label>
      <select id="mrEmp" style="height:50px;border-radius:12px;border:1px solid var(--line);background:var(--panel2);color:var(--ink);padding:0 12px">
        ${emps.map(e=>`<option value="${e.id}" ${preselId===e.id?'selected':''}>${safeHtml(e.name)}</option>`).join("")}</select></div>
    <div class="field"><label>비밀번호 (4자리)</label><input id="mrPin" inputmode="numeric" maxlength="4" type="password" placeholder="비밀번호를 입력하세요"></div>
    <div id="mrHint" style="font-size:.8rem;color:var(--warn);min-height:1.1em;margin:-6px 0 6px"></div>
    <button class="btn btn-primary btn-block btn-lg" id="mrView">내 기록 보기</button>`;
  openAddVeil();
  modal.querySelector("#mrView").onclick=async()=>{
    const id=Number(document.getElementById("mrEmp").value);
    const pin=document.getElementById("mrPin").value;
    const hint=document.getElementById("mrHint");
    if(!/^\d{4}$/.test(pin)){ hint.textContent="비밀번호 4자리를 입력하세요."; document.getElementById("mrPin").focus(); return; }
    hint.textContent="";
    const r=mrRange();
    let res;
    try{ res=await BE.myEvents(id,pin,r.fs,r.ts); }catch(e){ toast("err","오류",e.message); return; }
    if(!res||!res.ok){
      if(res&&res.error==="BAD_PIN"){ hint.textContent="비밀번호가 올바르지 않습니다."; document.getElementById("mrPin").value=""; document.getElementById("mrPin").focus(); }
      else toast("err","오류","");
      return;
    }
    // actual_attendance.html로 넘기는 1회성 인증. 다음 근무현황 탭 진입 시 route/openMyRecord가 폐기한다.
    sessionStorage.setItem("staff_attendance_auth",JSON.stringify({employee_id:id,pin:String(pin)}));
    location.href="actual_attendance.html?mode=staff";
  };
}
// STEP 2: 내 기록 (뒤로 = 인증 폐기하고 STEP1)
function mrShowRecord(empId,pin,events,requests,emps){
  const v=document.getElementById("addVeil"); const modal=v.querySelector(".modal");
  const empName=(emps.find(e=>e.id===empId)||{}).name||"";
  modal.innerHTML=`
    <h3>${empName} · 근무현황</h3>
    <div id="mrResult"></div>`;
  openAddVeil();
  // 좌상단 뒤로(‹) 주입: 본인 선택으로 = 인증 폐기 (pin 버려짐 → 재인증 강제)
  modal.classList.add("has-back");
  const oldBk=modal.querySelector(".modal-back"); if(oldBk) oldBk.remove();
  const bk=document.createElement("button");
  bk.className="btn-icon modal-back"; bk.setAttribute("aria-label","뒤로"); bk.innerHTML=ICON.back;
  bk.onclick=()=>{ mrShowAuth(emps, empId); };
  modal.insertBefore(bk, modal.firstChild);
  renderMyResult(empId,pin,events,requests,emps);
}
function fmtDT(d){ if(!d) return "—"; const p=n=>String(n).padStart(2,"0"); return `${d.getMonth()+1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`; }
function fmtDur(sec){ if(sec==null) return "—"; const m=Math.floor(sec/60); const h=Math.floor(m/60),mm=m%60; return h?`${h}시간 ${mm}분`:`${mm}분`; }
const LONG_SESSION_THRESHOLD_HOURS = 16; // heuristic (합의/법률 아님) — 장시간근무 확인필요 표시용
function renderMyResult(empId,pin,events,requests,emps){
  const el=document.getElementById("mrResult");
  const allSess=pairEvents(events).filter(s=>Number(s.employee_id)===Number(empId));
  const now=kstNow(), p=n=>String(n).padStart(2,"0");
  let ym=`${now.getFullYear()}-${p(now.getMonth()+1)}`;
  function shift(delta){const [y,m]=ym.split("-").map(Number),d=new Date(y,m-1+delta,1);ym=`${d.getFullYear()}-${p(d.getMonth()+1)}`;draw();}
  function key(d){return d?`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`:"";}
  function issue(s,day){return s.status==="INCOMPLETE"||s.status==="ORPHAN_OUT"||(s.status==="WORKING"&&day!==key(now))||(s.status==="COMPLETE"&&s.sec>LONG_SESSION_THRESHOLD_HOURS*3600);}
  function draw(){
    const [y,m]=ym.split("-").map(Number), days=new Date(y,m,0).getDate(), off=new Date(y,m-1,1).getDay();
    let h=`<div style="display:grid;grid-template-columns:44px 1fr 44px;align-items:center;border:1px solid var(--line);margin-bottom:10px"><button class="btn btn-secondary" id="mrPrev" style="border:0;border-radius:0">‹</button><b style="text-align:center">${y}년 ${m}월</b><button class="btn btn-secondary" id="mrNext" style="border:0;border-radius:0">›</button></div>`;
    h+=`<div style="display:grid;grid-template-columns:repeat(7,1fr);text-align:center;color:var(--sub);font-size:.72rem;margin-bottom:4px">${["일","월","화","수","목","금","토"].map(x=>`<div>${x}</div>`).join("")}</div><div style="display:grid;grid-template-columns:repeat(7,1fr);border-left:1px solid var(--line);border-top:1px solid var(--line)">`;
    for(let i=0;i<off;i++)h+=`<div style="min-height:62px;border-right:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--panel2)"></div>`;
    for(let d=1;d<=days;d++){const day=`${ym}-${p(d)}`,ss=allSess.filter(s=>key(s.in||s.out)===day),secs=ss.reduce((a,s)=>a+(s.sec||0),0),bad=ss.some(s=>issue(s,day)),working=ss.some(s=>s.status==="WORKING"&&!issue(s,day));
      const dot=bad?"#dc3b32":working?"#2474d2":"#159455";
      h+=`<button type="button" data-mr-day="${day}" style="min-width:0;min-height:62px;padding:5px;border:0;border-right:1px solid var(--line);border-bottom:1px solid var(--line);background:#fff;text-align:left;color:var(--ink)"><b style="display:block;color:var(--brand-700)">${d}</b>${ss.length?`<span style="display:block;margin-top:6px;font-size:.66rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><i style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${dot};margin-right:3px"></i>${working?"근무 중":bad?"확인 필요":fmtDur(secs)}</span>`:""}</button>`;
    }
    h+=`</div><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;color:var(--sub);font-size:.7rem"><span>● 근무 완료</span><span>● 근무 중</span><span>● 확인 필요</span><span>날짜를 누르면 상세</span></div><div id="mrDayDetail"></div>`;
    el.innerHTML=h;
    el.querySelector("#mrPrev").onclick=()=>shift(-1); el.querySelector("#mrNext").onclick=()=>shift(1);
    el.querySelectorAll("[data-mr-day]").forEach(b=>b.onclick=()=>showDay(b.dataset.mrDay));
  }
  function showDay(day){
    const ss=allSess.filter(s=>key(s.in||s.out)===day), box=el.querySelector("#mrDayDetail"); if(!box)return;
    let h=`<div class="section-t" style="margin-top:14px">${day} 근무 상세</div>`;
    if(!ss.length)h+=`<div style="color:var(--muted);font-size:.85rem">근무 기록이 없습니다.</div>`;
    ss.forEach((s,i)=>{h+=`<div style="padding:10px 0;border-bottom:1px solid var(--line);font-size:.84rem"><div><b>출근 ${fmtDT(s.in)} → 퇴근 ${fmtDT(s.out)}</b></div><div style="display:flex;justify-content:space-between;align-items:center;margin-top:5px;color:var(--sub)"><span>근무 ${fmtDur(s.sec)}</span><button class="btn btn-secondary btn-sm" data-mr-fix="${i}">정정요청</button></div></div>`;});
    box.innerHTML=h; box.querySelectorAll("[data-mr-fix]").forEach(b=>b.onclick=()=>openReqForm(empId,pin,ss[Number(b.dataset.mrFix)],events,requests,emps));
  }
  draw();
}
// 정정요청 폼: 날짜+시간 분리 입력, 실시간 예상근무시간, 전송전 validation
function openReqForm(empId,pin,sess,events,requests,emps){
  const el=document.getElementById("mrResult");
  // 제목을 정정 요청용으로 변경 + 좌상단 뒤로 버튼 재주입 (모바일 백버튼 위치)
  const modal=document.getElementById("addVeil").querySelector(".modal");
  const empName=(emps.find(e=>e.id===empId)||{}).name||"";
  const h3=modal.querySelector("h3"); if(h3) h3.textContent=`${empName} · 근태 정정 요청`;
  modal.classList.add("has-back");
  const oldBk=modal.querySelector(".modal-back"); if(oldBk) oldBk.remove();
  const bk=document.createElement("button");
  bk.className="btn-icon modal-back"; bk.setAttribute("aria-label","뒤로"); bk.innerHTML=ICON.back;
  bk.onclick=()=>{ mrShowRecord(empId,pin,events,requests,emps); };  // STEP3 뒤로 = 내 기록(STEP2)
  modal.insertBefore(bk, modal.firstChild);
  // 기본값: 세션의 기존 출근/퇴근 (없으면 세션 기준일)
  const baseDay = sess.in||sess.out||kstNow();
  const inInit = sess.in||baseDay, outInit = sess.out||baseDay;
  const canFixOut = !!sess.out; // 실제 퇴근 기록이 있으면 퇴근시간 정정 허용
  el.innerHTML=`
    <div class="section-t">기존 근태 기록</div>
    <div style="background:var(--panel2);border:1px solid var(--line);border-radius:10px;padding:10px;font-size:.85rem;margin-bottom:12px">
      <div style="color:var(--sub);margin-bottom:4px">현재 기록</div>
      <div>출근: <b>${fmtDT(sess.in)}</b></div>
      <div>퇴근: <b>${fmtDT(sess.out)}</b></div>
      <div style="color:var(--sub);margin-top:2px">근무 ${fmtDur(sess.sec)}</div>
    </div>
    <div class="section-t" style="font-size:.85rem">수정된 근태 기록</div>
    <label style="display:flex;align-items:center;gap:6px;font-size:.85rem;margin-bottom:4px">
      <input type="checkbox" id="fixIn" ${sess.status==='ORPHAN_OUT'?'checked':''} style="width:auto"> 출근 수정</label>
    <div id="inRow" style="display:flex;gap:6px;margin-bottom:10px">
      ${dateTimeInputs('in', inInit)}</div>
    <label style="display:flex;align-items:center;gap:6px;font-size:.85rem;margin-bottom:4px">
      <input type="checkbox" id="fixOut" ${sess.status==='INCOMPLETE'?'checked':''} ${canFixOut?'':'disabled'} style="width:auto"> 퇴근 수정</label>
    <div id="outRow" style="display:flex;gap:6px;margin-bottom:10px;opacity:${canFixOut?'1':'.45'};pointer-events:${canFixOut?'auto':'none'}">
      ${dateTimeInputs('out', outInit)}</div>
    <div id="reqPreview" style="font-size:.85rem;padding:8px;border-radius:8px;background:var(--chip);margin-bottom:10px"></div>
    <div class="field"><label>정정 사유</label><input id="reqNote" placeholder="예: 마감하고 퇴근 못 찍음"></div>
    <button class="btn btn-primary btn-block btn-lg" id="reqSend">정정 요청 보내기</button>`;

  // 예상 근무시간 실시간 계산 + validation
  function readDT(prefix){
    const y=+document.getElementById(prefix+"Y").value, mo=+document.getElementById(prefix+"Mo").value,
      da=+document.getElementById(prefix+"D").value, h=+document.getElementById(prefix+"H").value, mi=+document.getElementById(prefix+"Mi").value;
    return new Date(y,mo-1,da,h,mi,0);
  }
  // 입력한 년/월/일이 실제 존재하는 날짜인지 검사 (예: 2월 31일 → new Date가 3월로 넘김)
  function validDT(prefix){
    const y=+document.getElementById(prefix+"Y").value, mo=+document.getElementById(prefix+"Mo").value,
      da=+document.getElementById(prefix+"D").value;
    const d=new Date(y,mo-1,da);
    return d.getFullYear()===y && d.getMonth()===mo-1 && d.getDate()===da;
  }
  function updatePreview(){
    const fixIn=document.getElementById("fixIn").checked, fixOut=document.getElementById("fixOut").checked;
    const inD = fixIn?readDT("in"):(sess.in||null);
    const outD = fixOut?readDT("out"):(sess.out||null);
    const pv=document.getElementById("reqPreview"); const btn=document.getElementById("reqSend");
    if(inD&&outD){
      const sec=(outD-inD)/1000;
      if(sec<=0){ pv.innerHTML=`<span style="color:var(--warn)">⚠ 퇴근 시각은 출근 시각보다 늦어야 합니다. 날짜/시간을 확인하세요.</span>`; btn.disabled=true; btn.style.opacity=".5"; return; }
      const long = sec>LONG_SESSION_THRESHOLD_HOURS*3600;
      pv.innerHTML=`예상 근무시간 <b>${fmtDur(sec)}</b>${long?` <span style="color:var(--warn)">· 장시간 근무 · 확인필요</span>`:''}`;
      btn.disabled=false; btn.style.opacity="1";
    } else { pv.innerHTML=`<span style="color:var(--sub)">출근 또는 퇴근 한쪽만 수정합니다.</span>`; btn.disabled=false; btn.style.opacity="1"; }
  }
  // 년/월이 바뀌면 일(day) 옵션을 그 달 실제 일수로 재생성 (2월 31일 등 아예 안 보이게)
  function syncDays(prefix){
    const y=+document.getElementById(prefix+"Y").value, mo=+document.getElementById(prefix+"Mo").value;
    const last=new Date(y,mo,0).getDate();            // 해당 월의 말일 (28/29/30/31)
    const daSel=document.getElementById(prefix+"D");
    let cur=+daSel.value; if(cur>last) cur=last;       // 초과 선택은 말일로 clamp
    daSel.innerHTML=Array.from({length:last},(_,k)=>`<option value="${k+1}" ${k+1===cur?'selected':''}>${k+1}</option>`).join("");
  }
  // 해당 행(출근/퇴근)의 날짜·시간을 건드리면 그 항목을 자동으로 '수정' 체크
  function autoCheck(prefix){
    const cb=document.getElementById(prefix==="in"?"fixIn":"fixOut");
    if(cb && !cb.checked){ cb.checked=true; }
  }
  ["in","out"].forEach(p=>{
    ["Y","Mo","D","H","Mi"].forEach(part=>{
      const sel=document.getElementById(p+part);
      sel.addEventListener("change",()=>{
        if(part==="Y"||part==="Mo") syncDays(p);  // 년/월 바뀌면 일 옵션 재생성
        autoCheck(p);                              // 값 건드리면 자동 체크
        updatePreview();
      });
    });
  });
  document.getElementById("fixIn").addEventListener("change",updatePreview);
  document.getElementById("fixOut").addEventListener("change",updatePreview);
  document.getElementById("reqNote").addEventListener("change",updatePreview);
  updatePreview();

  document.getElementById("reqSend").onclick=async()=>{
    const fixIn=document.getElementById("fixIn").checked, fixOut=document.getElementById("fixOut").checked;
    const note=document.getElementById("reqNote").value.trim();
    if(!fixIn&&!fixOut){ alert("수정할 항목(출근/퇴근)을 선택하세요."); return; }
    if(fixIn && !validDT("in")){ alert("출근 날짜가 올바르지 않습니다. 해당 월에 없는 날짜입니다."); return; }
    if(fixOut && !validDT("out")){ alert("퇴근 날짜가 올바르지 않습니다. 해당 월에 없는 날짜입니다."); return; }
    const reqs=[];
    if(fixIn){ const d=readDT("in"); const at=isoLocal(d);
      if(sess.inId) reqs.push({kind:"WRONG_TIME",eventId:sess.inId,at,type:"IN"});
      else reqs.push({kind:"MISSING_IN",eventId:null,at,type:"IN"}); }
    if(fixOut){ const d=readDT("out"); const at=isoLocal(d);
      if(sess.outId) reqs.push({kind:"WRONG_TIME",eventId:sess.outId,at,type:"OUT"});
      else reqs.push({kind:"MISSING_OUT",eventId:null,at,type:"OUT"}); }
    // validation: 둘 다 수정 시 퇴근>출근
    if(fixIn&&fixOut){ if(readDT("out")<=readDT("in")){ alert("퇴근 시각은 출근 시각보다 늦어야 합니다."); return; } }
    try{
      for(const r of reqs){
        const res=await BE.requestCorrection(empId,pin,r.kind,r.eventId,r.at,r.type,note);
        if(!res||!res.ok){ toast("err","실패",(res&&res.error)||""); return; }
      }
      document.getElementById("addVeil").classList.remove("show"); restoreAddModal();
      toast("in","정정 요청 전송됨","관리자 승인을 기다려주세요.");
    }catch(e){ toast("err","오류",e.message); }
  };
}
// 날짜(년/월/일 select) + 시간(시:분 select) 분리 입력 — datetime-local 의존 줄임
function dateTimeInputs(prefix, d){
  const y=d.getFullYear(), mo=d.getMonth()+1, da=d.getDate(), h=d.getHours(), mi=d.getMinutes();
  const opt=(n,sel)=>`<option value="${n}" ${n===sel?'selected':''}>${n}</option>`;
  const years=[y-1,y,y+1].map(v=>opt(v,y)).join("");
  const months=Array.from({length:12},(_,k)=>opt(k+1,mo)).join("");
  const days=Array.from({length:new Date(y,mo,0).getDate()},(_,k)=>opt(k+1,da)).join("");
  const hours=Array.from({length:24},(_,k)=>`<option value="${k}" ${k===h?'selected':''}>${String(k).padStart(2,'0')}</option>`).join("");
  const mins=Array.from({length:60},(_,k)=>`<option value="${k}" ${k===mi?'selected':''}>${String(k).padStart(2,'0')}</option>`).join("");
  const sty="height:44px;border-radius:8px;border:1px solid var(--line);background:var(--panel2);color:var(--ink);padding:0 4px";
  return `<select id="${prefix}Y" style="${sty};flex:1.3">${years}</select>
    <select id="${prefix}Mo" style="${sty};flex:1">${months}</select>
    <select id="${prefix}D" style="${sty};flex:1">${days}</select>
    <select id="${prefix}H" style="${sty};flex:1">${hours}</select>
    <select id="${prefix}Mi" style="${sty};flex:1">${mins}</select>`;
}
function isoLocal(d){ const p=n=>String(n).padStart(2,"0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`; }
function mrRange(){ const t=kstNow(); const p=n=>String(n).padStart(2,"0");
  const to=new Date(t); to.setDate(to.getDate()+1); const from=new Date(t); from.setDate(from.getDate()-14);
  return {fs:`${from.getFullYear()}-${p(from.getMonth()+1)}-${p(from.getDate())}T00:00:00`, ts:`${to.getFullYear()}-${p(to.getMonth()+1)}-${p(to.getDate())}T00:00:00`}; }

/* ---------------------- 토스트 ---------------------- */
let toastTimer=null;
function toast(kind,big,sub){
  const t=document.getElementById("toast");
  t.className="toast "+kind;
  t.replaceChildren();
  const title=document.createElement("div");title.className="big";title.textContent=String(big??"");
  const detail=document.createElement("div");detail.className="sub";detail.textContent=String(sub??"");
  t.append(title,detail);
  t.classList.add("show"); clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove("show"),2200);
}

function setAccountTab(tab){
  document.querySelectorAll("[data-account-tab]").forEach(b=>b.classList.toggle("on",b.dataset.accountTab===tab));
  document.querySelectorAll("[data-account-pane]").forEach(p=>p.classList.toggle("on",p.dataset.accountPane===tab));
}
async function openAccountMgmt(){
  const v=document.getElementById("accountVeil");
  document.getElementById("accountClose").innerHTML=ICON.close;
  document.getElementById("accountClose").onclick=()=>v.classList.remove("show");
  attachNoDoubleTapZoom(v); v.classList.add("show");
  await renderAccountMgmt();
}

/* ---------------------- 계정 관리 (V0 global admin) ---------------------- */
async function renderAccountMgmt(){
  const box=document.getElementById("adAccount"); if(!box) return;
  box.innerHTML=`<div class="empty">불러오는 중…</div>`;
  let me=null, admins=[];
  try{
    me=await Auth.getUser();
    admins=await BE.listAuthUsers();
  }catch(e){
    box.innerHTML=`<div class="empty">계정 정보 불러오기 실패: ${e.message}</div>`; return;
  }
  const myId = me && me.id;
  let html='<div style="display:flex;flex-direction:column;gap:8px">';
  for(const a of admins){
    const isMe=a.user_id===myId, role=a.is_admin?"관리자":"일반", em=safeHtml(a.email||"");
    html+='<div class="row" style="margin:0;padding:10px 12px"><div style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis">'+em+'</div><span class="badge '+(a.is_admin?"success":"")+'">'+role+(isMe?" · 나":"")+'</span>'+(isMe?"":a.is_admin?'<button class="btn btn-danger btn-sm" data-revoke="'+a.user_id+'" data-email="'+em+'">관리자 해제</button>':'<button class="btn btn-secondary btn-sm" data-promote="'+em+'">관리자 지정</button>')+'</div>';
  }
  html+='</div>';
  box.innerHTML=html;

  // 해제
  box.querySelectorAll("[data-revoke]").forEach(b=>b.onclick=async()=>{
    const uid=b.getAttribute("data-revoke"), em=b.getAttribute("data-email");
    if(!confirm(`${em} 관리자 권한을 해제할까요?`)) return;
    try{
      const r=await BE.revokeAdmin(uid);
      if(r&&r.ok){ toast("out","해제됨",em); renderAccountMgmt(); }
      else{ toast("err","해제 실패", r&&r.error==="CANNOT_REMOVE_LAST_ADMIN"?"마지막 관리자는 해제 불가":r&&r.error==="CANNOT_REVOKE_SELF"?"자기 자신은 해제 불가":r&&r.error==="ADMIN_NOT_FOUND"?"이미 관리자가 아님":(r&&r.error||"")); }
    }catch(e){ toast("err","해제 실패",e.message); }
  });
  box.querySelectorAll("[data-promote]").forEach(b=>b.onclick=async()=>{
    const em=b.getAttribute("data-promote"); if(!confirm(em+" 계정을 관리자로 지정할까요?")) return;
    try{const r=await BE.grantAdmin(em);if(r&&r.ok){toast("in","관리자 지정됨",em);renderAccountMgmt();}else toast("err","지정 실패",r&&r.error||"");}catch(e){toast("err","지정 실패",e.message);}
  });

}

function openPersonalSettings(){
  const v=document.getElementById("settingsVeil"),box=document.getElementById("personalSettings");
  document.getElementById("settingsClose").innerHTML=ICON.close;
  document.getElementById("settingsClose").onclick=()=>v.classList.remove("show");
  box.innerHTML='<div class="row" style="flex-direction:column;align-items:stretch;gap:8px;margin:0"><div style="font-size:.85rem;color:var(--text-muted)">내 로그인 이메일 변경</div><input class="form-control" id="settingsEmail" placeholder="새 이메일" inputmode="email"><button class="btn btn-primary" id="settingsEmailBtn">이메일 변경 요청</button><div id="settingsEmailMsg" style="font-size:.8rem;color:var(--text-muted)"></div></div>';
  document.getElementById("settingsEmailBtn").onclick=async()=>{
    const input=document.getElementById("settingsEmail"),msg=document.getElementById("settingsEmailMsg"),ne=input.value.trim();
    if(!ne){msg.textContent="새 이메일을 입력하세요.";return;}
    try{await Auth.requestEmailChange(ne);const u=await Auth.getUser();msg.textContent=(u&&u.email&&u.email.toLowerCase()===ne.toLowerCase())?"이메일이 변경 완료되었습니다.":"변경 요청됨. 이메일로 온 확인 링크를 완료한 뒤 재로그인하세요.";}catch(e){msg.textContent="이메일 변경 요청에 실패했습니다.";}
  };
  attachNoDoubleTapZoom(v);v.classList.add("show");
}

/* ---------------------- 관리자 화면 ---------------------- */
async function renderAdmin(){
  view.innerHTML=`
    <div class="page-title-row employee-page-title"><h2 class="page-title">직원 관리</h2><button class="btn btn-primary employee-add-small" id="adAdd">+ 직원 등록</button></div>
    <div class="employee-panel">
      <div class="employee-tabs" role="tablist" aria-label="직원 상태">
        <button type="button" id="empTabActive" class="on" role="tab" aria-selected="true">재직중</button>
        <button type="button" id="empTabRetired" role="tab" aria-selected="false">퇴직</button>
      </div>
      <div id="adEmps" class="employee-list-mask"></div>
    </div>`;
  const t=kstNow(); const p=n=>String(n).padStart(2,"0");
  const day=`${t.getFullYear()}-${p(t.getMonth()+1)}-${p(t.getDate())}`;
  document.getElementById("adAdd").onclick=()=>{ restoreAddModal(); openAddVeil(); };
  document.getElementById("requestsClose").onclick=()=>document.getElementById("requestsVeil").classList.remove("show");

  // 정정요청 대기 큐 (LIVE 전용)
  if(LIVE){ renderPendingRequests(); }

  // 직원 관리 데이터만 조회. 오늘 근태/근무 기록은 출퇴근 및 근무현황 화면에서 담당한다.
  let emps=[], contractStatuses=[];
  try{
    emps=await BE.allEmployees();
    try{ contractStatuses=LIVE?await BE.employeeContractStatuses():[]; }catch(_){ contractStatuses=[]; }
  }catch(e){
    if(String(e.message).includes("JWT")||String(e.message).includes("401")){ Auth.clear(); requireAuth(renderAdmin); return; }
    if(String(e.message).includes("NOT_AUTHORIZED")){ toast("err","직원 관리","관리자 권한이 없습니다."); return; }
    toast("err","직원 관리",`불러오기 실패: ${e.message}`); return;
  }
  const active=emps.filter(e=>e.is_active!==false && e.active!==false).sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"ko-KR"));
    // 직원 관리: 모바일은 문서 전체 스크롤, 데스크톱은 넓은 목록 영역 사용
  const empsEl=document.getElementById("adEmps");
  const retired=emps.filter(e=>(e.is_active===false||e.active===false)&&!isHiddenInhaTestEmployee(e)).sort((a,b)=>String(a.name||"").localeCompare(String(b.name||""),"ko-KR"));
  let employeeStatusTab="active";
  const renderEmployeeList=()=>{
    const rows=employeeStatusTab==="active"?active:retired;
    const aBtn=document.getElementById("empTabActive"),rBtn=document.getElementById("empTabRetired");
    if(aBtn){aBtn.classList.toggle("on",employeeStatusTab==="active");aBtn.setAttribute("aria-selected",employeeStatusTab==="active"?"true":"false")}
    if(rBtn){rBtn.classList.toggle("on",employeeStatusTab==="retired");rBtn.setAttribute("aria-selected",employeeStatusTab==="retired"?"true":"false")}
    if(!rows.length){
      empsEl.innerHTML=`<div class="employee-empty">등록된 ${employeeStatusTab==="active"?"재직중 직원":"퇴직 직원"}이 없습니다.</div>`;
      return;
    }
    empsEl.innerHTML="";
    for(const e of rows){
      const div=document.createElement("div"); div.className="employee-manage-card";
      const cs=contractStatuses.find(x=>Number(x.employee_id)===Number(e.id));
      const contractNeedsAttention=employeeStatusTab==="active"&&(!cs?.contract_registered||!cs?.contract_effective||!cs?.document_attached);
      div.innerHTML=`
        <div class="employee-manage-head">
          <div class="employee-manage-name employee-card-identity"><span>${safeHtml(e.name)}</span><small class="employee-card-id">(No.${safeHtml(employeeNumber(e))})</small></div>
          <div class="employee-manage-actions">${employeeStatusTab==="active"?'<span class="badge success">재직중</span>':'<span class="badge-off">퇴직</span>'}</div>
        </div>
        <div class="employee-manage-body">
          <button class="btn btn-secondary contract-btn" data-contract="${e.id}">계약${contractNeedsAttention?'<span class="contract-alert" aria-label="계약 확인 필요">!</span>':''}</button>
          ${employeeStatusTab==="active"?`<button class="btn btn-danger retire-mini" data-retire="${e.id}">퇴직</button>`:'<span style="font-size:.72rem;color:var(--muted)">기록 보존</span>'}
        </div>`;
      div.querySelector("[data-contract]").onclick=()=>{ location.href=`employment_contracts.html?employee=${e.id}&from=employees`; };
      const rb=div.querySelector("[data-retire]");
      if(rb) rb.onclick=async()=>{
        const ended=prompt(`${e.name}님의 퇴직일을 입력하세요.\n고용·계약 이력의 종료일로 기록됩니다.`,day);
        if(ended===null)return;
        if(!/^\d{4}-\d{2}-\d{2}$/.test(ended)){alert("퇴직일은 YYYY-MM-DD 형식으로 입력하세요.");return}
        if(!confirm(`${e.name}님을 ${ended} 기준으로 퇴직 처리할까요?\n기존 근태·급여·계약 기록은 보존됩니다.`))return;
        try{
          const res=await BE.retireEmployee(e.id,ended);
          if(!res?.ok) throw new Error(res?.error||"RETIRE_FAILED");
          toast("out","퇴직 처리 완료",`No.${employeeNumber(e)} · ${e.name}`);
          renderAdmin();
        }catch(err){alert("퇴직 처리 실패: "+err.message)}
      };
      empsEl.appendChild(div);
    }
  };
  document.getElementById("empTabActive").onclick=()=>{employeeStatusTab="active";renderEmployeeList()};
  document.getElementById("empTabRetired").onclick=()=>{employeeStatusTab="retired";renderEmployeeList()};
  renderEmployeeList();
}

// 정정요청 대기 큐
async function renderPendingRequests(){
  const sec=document.getElementById("adReqSection"), alert=document.getElementById("attendanceAlert"), alertText=document.getElementById("attendanceAlertText");
  let reqs=[];
  try{ reqs=await BE.pendingRequests(); }catch(e){ if(alertText) alertText.textContent="—"; return; }
  if(alertText) alertText.textContent=`${reqs.length}건`;
  if(alert) alert.classList.toggle("quiet",!reqs.length);
  if(!reqs||!reqs.length){ if(sec)sec.innerHTML=""; const modalList=document.getElementById("requestsModalList");if(modalList)modalList.innerHTML=""; const badge=document.getElementById("requestCountBadge");if(badge)badge.textContent="0"; return; }
  const kindLabel={MISSING_OUT:"퇴근 누락 보완",MISSING_IN:"출근 누락 보완",WRONG_TIME:"시각 정정",OTHER:"기타"};
  const typeLabel={IN:"출근",OUT:"퇴근"};
  if(sec)sec.innerHTML=""; const modalList=document.getElementById("requestsModalList");if(modalList)modalList.innerHTML="";const badge=document.getElementById("requestCountBadge");if(badge)badge.textContent=String(reqs.length);
  for(const r of reqs){
    const p=n=>String(n).padStart(2,"0");
    const fmt=iso=>{ if(!iso) return "—"; const d=fromIso(iso); return `${d.getMonth()+1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
    const target = r.requested_type?typeLabel[r.requested_type]:(r.orig_event_type?typeLabel[r.orig_event_type]:"");
    const beforeVal = r.orig_event_at?fmt(r.orig_event_at):(r.kind==="MISSING_OUT"?"퇴근 기록 없음":r.kind==="MISSING_IN"?"출근 기록 없음":"—");
    const afterVal = fmt(r.requested_at);
    const div=document.createElement("div"); div.className="row"; div.style.flexDirection="column"; div.style.alignItems="stretch"; div.style.gap="8px";
    div.innerHTML=`
      <div class="nm">${safeHtml(r.employee_name)} · ${safeHtml(kindLabel[r.kind]||r.kind)}${target?` (${safeHtml(target)})`:""}</div>
      <div style="background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:8px;font-size:.85rem">
        <div style="display:flex;justify-content:space-between;padding:2px 0">
          <span style="color:var(--sub)">수정 전</span><span style="text-decoration:line-through;color:var(--muted)">${beforeVal}</span></div>
        <div style="display:flex;justify-content:space-between;padding:2px 0">
          <span style="color:var(--sub)">수정 후</span><span style="font-weight:700;color:var(--accent)">${afterVal}</span></div>
      </div>
      ${r.note?`<div style="font-size:.82rem;color:var(--muted)">사유: ${safeHtml(r.note)}</div>`:""}
      <div class="btn-pair" style="margin-top:4px">
        <button class="btn btn-primary" data-ap="${r.id}">승인</button>
        <button class="btn btn-danger" data-rj="${r.id}">반려</button>
      </div>`;
    div.querySelector("[data-ap]").onclick=async()=>{
      if(!confirm(`${r.employee_name}님의 ${target?target+' ':''}${kindLabel[r.kind]} 요청을 승인할까요?\n${beforeVal} → ${afterVal}`)) return;
      const res=await BE.resolveRequest(r.id,true,null);
      if(res&&res.ok){ toast("in","승인됨","정정이 반영되었습니다."); renderAdmin(); }
      else toast("err","실패",(res&&res.error)||"오류");
    };
    div.querySelector("[data-rj]").onclick=async()=>{
      const reason=prompt("반려 사유(선택):");
      if(reason===null) return;  // prompt 취소 → 아무 것도 안 함 (반려 안 됨)
      const res=await BE.resolveRequest(r.id,false,reason||"");
      if(res&&res.ok){ toast("out","반려됨",""); renderAdmin(); }
      else toast("err","실패",(res&&res.error)||"오류");
    };
    if(sec)sec.appendChild(div);if(modalList){const copy=div.cloneNode(true);copy.querySelector("[data-ap]").onclick=div.querySelector("[data-ap]").onclick;copy.querySelector("[data-rj]").onclick=div.querySelector("[data-rj]").onclick;modalList.appendChild(copy);}
  }
}

// 관리자 직접 수정 모달
function openAdminFix(emp, effRows){
  const v=document.getElementById("addVeil");
  const modal=v.querySelector(".modal");
  const rowsHtml = effRows.length
    ? effRows.map(r=>`<div style="display:flex;gap:8px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)">
        <span style="flex:1">${r.event_type==="IN"?"출근":"퇴근"} ${hhmm(fromIso(r.event_at))}${r.corrected?' <span style="color:var(--accent);font-size:.7rem">(보정됨)</span>':''}</span>
        <button class="btn btn-danger btn-sm" data-void="${r.id}" data-emp="${emp.id}">무효화</button>
      </div>`).join("")
    : `<div style="color:var(--muted);font-size:.85rem">등록된 오늘 근태 기록이 없습니다.</div>`;
  modal.innerHTML=`
    <h3>${emp.name} · 근태 수정</h3>
    <div style="margin-bottom:14px">${rowsHtml}</div>
    <div class="section-t">누락분 추가</div>
    <div class="field"><label>종류</label>
      <select id="fixType" style="height:50px;border-radius:12px;border:1px solid var(--line);background:var(--panel2);color:var(--ink);padding:0 12px">
        <option value="IN">출근</option><option value="OUT">퇴근</option></select></div>
    <div class="field"><label>시각</label><div style="display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:8px"><input id="fixDate" type="date" aria-label="날짜"><input id="fixClock" type="time" step="60" aria-label="시간"></div></div>
    <div class="field"><label>사유</label><input id="fixReason" placeholder="예: 퇴근 누락 보정"></div>
    <button class="btn btn-primary btn-block btn-lg" id="fixAdd">추가</button>`;
  openAddVeil();
  { const d=kstNow(); modal.querySelector("#fixDate").value=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; modal.querySelector("#fixClock").value=`${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }
  modal.querySelectorAll("[data-void]").forEach(b=>b.onclick=async()=>{
    if(!confirm("이 기록을 무효화할까요? (원본은 보존됩니다)")) return;
    const reason=prompt("무효화 사유:")||"관리자 무효화";
    const eid=b.getAttribute("data-void"); const empId=b.getAttribute("data-emp");
    if(String(eid).startsWith("add_")){ toast("err","불가","추가된 항목은 무효화 대신 다시 추가로 관리하세요."); return; }
    const res=await BE.correctEvent("VOID",Number(eid),Number(empId),null,null,reason);
    if(res!=null){ toast("out","무효화됨",""); v.classList.remove("show"); restoreAddModal(); if(location.hash==="#pos")renderPos();else renderAdmin(); }
  });
  modal.querySelector("#fixAdd").onclick=async()=>{
    const type=document.getElementById("fixType").value;
    const dv=document.getElementById("fixDate").value,cv=document.getElementById("fixClock").value;
    const reason=document.getElementById("fixReason").value.trim()||"관리자 추가";
    if(!dv||!cv){ alert("날짜와 시간을 입력하세요."); return; }
    const at=`${dv}T${cv}:00`;
    const res=await BE.correctEvent("ADD",null,emp.id,at,type,reason);
    if(res!=null){ toast("in","추가됨","누락분이 반영되었습니다."); v.classList.remove("show"); restoreAddModal(); if(location.hash==="#pos")renderPos();else renderAdmin(); }
    else toast("err","실패","");
  };
}

/* 직원 등록 모달: 기본정보 → 급여조건 → 근무조건 → 확인 */
let EMP_ONBOARD=null;
function newEmployeeOnboardingState(){
  const d=kstNow(),p=n=>String(n).padStart(2,"0");
  return {step:1,name:"",pin:"",startedOn:`${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`,
    payrollType:"HOURLY",amount:"",taxTreatment:"BUSINESS_INCOME",rate:"3.3",
    weekdays:new Set([1,2,3,4,5]),start:"09:00",end:"18:00",
    night:false,nightMode:"RATE",nightValue:"",nightStart:"22:00",memo:""};
}
function empOnboardSaveVisible(){
  if(!EMP_ONBOARD) EMP_ONBOARD=newEmployeeOnboardingState();
  const get=id=>document.getElementById(id);
  if(EMP_ONBOARD.step===1){
    EMP_ONBOARD.name=get("newName")?.value.trim()||"";
    EMP_ONBOARD.pin=get("newPin")?.value.trim()||"";
    EMP_ONBOARD.startedOn=get("newStart")?.value||EMP_ONBOARD.startedOn;
  }else if(EMP_ONBOARD.step===2){
    EMP_ONBOARD.payrollType=get("newPayrollType")?.value||"HOURLY";
    EMP_ONBOARD.amount=get("newPayAmount")?.value.trim()||"";
    EMP_ONBOARD.taxTreatment=get("newTaxTreatment")?.value||"BUSINESS_INCOME";
    EMP_ONBOARD.rate=get("newTaxRate")?.value.trim()||"";
  }else if(EMP_ONBOARD.step===3){
    EMP_ONBOARD.weekdays=new Set([...document.querySelectorAll("[data-ob-day]:checked")].map(x=>Number(x.value)));
    EMP_ONBOARD.start=get("newWorkStart")?.value||"";
    EMP_ONBOARD.end=get("newWorkEnd")?.value||"";
    EMP_ONBOARD.night=!!get("newNightEnabled")?.checked;
    EMP_ONBOARD.nightMode=get("newNightMode")?.value||"RATE";
    EMP_ONBOARD.nightValue=get("newNightValue")?.value.trim()||"";
    EMP_ONBOARD.nightStart=get("newNightStart")?.value||"22:00";
    EMP_ONBOARD.memo=get("newContractMemo")?.value.trim()||"";
  }
}
function empOnboardValidate(step){
  empOnboardSaveVisible();
  const s=EMP_ONBOARD;
  if(step===1){
    if(!s.name) return "이름을 입력하세요.";
    if(!/^\d{4}$/.test(s.pin)) return "비밀번호는 숫자 4자리입니다.";
    if(!s.startedOn) return "입사일을 입력하세요.";
  }
  if(step===2){
    const amount=Number(s.amount);
    if(!Number.isFinite(amount)||amount<=0) return s.payrollType==="HOURLY"?"시급을 입력하세요.":"월급액을 입력하세요.";
    if(s.taxTreatment==="BUSINESS_INCOME"){
      const rate=Number(s.rate);
      if(!Number.isFinite(rate)||rate<0||rate>100) return "사업소득 공제율을 확인하세요.";
    }
  }
  if(step===3 && s.payrollType==="HOURLY"){
    if(!s.weekdays.size) return "계약 근무요일을 하나 이상 선택하세요.";
    if(!s.start||!s.end||s.start===s.end) return "계약 근무시간을 확인하세요.";
    if(s.night){
      const v=Number(s.nightValue);
      if(!Number.isFinite(v)||v<0) return "야간수당 값을 입력하세요.";
    }
  }
  return "";
}
function renderEmployeeOnboardingStep(){
  const host=document.getElementById("employeeOnboarding"); if(!host)return;
  if(!EMP_ONBOARD) EMP_ONBOARD=newEmployeeOnboardingState();
  const s=EMP_ONBOARD,WD=["일","월","화","수","목","금","토"];
  const prog=`<div style="display:flex;gap:5px;margin:2px 0 16px">${[1,2,3,4].map(n=>`<span style="height:4px;flex:1;border-radius:4px;background:${n<=s.step?'var(--brand-700)':'var(--border)'}"></span>`).join("")}</div>`;
  let body="";
  if(s.step===1) body=`
    <h3>직원 등록 · 기본정보</h3>${prog}
    <div style="display:flex;align-items:center;gap:8px;margin:-4px 0 14px;font-size:.82rem;color:var(--text-muted)"><span>예정 사번</span><b id="newEmpNo" style="font-size:.9rem;color:var(--brand-700);font-variant-numeric:tabular-nums">계산 중…</b></div>
    <div class="field"><label>이름</label><input id="newName" autocomplete="off" value="${safeHtml(s.name)}" placeholder="예: 이현진"></div>
    <div class="field"><label>비밀번호 (4자리)</label><input id="newPin" inputmode="numeric" maxlength="4" autocomplete="off" value="${safeHtml(s.pin)}" placeholder="숫자 4자리"></div>
    <div class="field"><label>입사일</label><input id="newStart" type="date" value="${s.startedOn}"></div>`;
  if(s.step===2) body=`
    <h3>직원 등록 · 급여조건</h3>${prog}
    <div class="field"><label>급여 방식</label><select id="newPayrollType"><option value="HOURLY" ${s.payrollType==="HOURLY"?"selected":""}>시급제</option><option value="MONTHLY" ${s.payrollType==="MONTHLY"?"selected":""}>월급제</option></select></div>
    <div class="field"><label id="newPayAmountLabel">${s.payrollType==="HOURLY"?"시급 (원)":"월급액 (원)"}</label><input id="newPayAmount" inputmode="numeric" value="${safeHtml(s.amount)}" placeholder="${s.payrollType==="HOURLY"?"예: 12500":"예: 2500000"}"></div>
    <div class="field"><label>세금·보험</label><select id="newTaxTreatment"><option value="BUSINESS_INCOME" ${s.taxTreatment==="BUSINESS_INCOME"?"selected":""}>사업소득</option><option value="FOUR_INSURANCE" ${s.taxTreatment==="FOUR_INSURANCE"?"selected":""}>4대보험</option></select></div>
    <div class="field" id="newTaxRateWrap" ${s.taxTreatment==="BUSINESS_INCOME"?"":"style='display:none'"}><label>공제율 (%)</label><input id="newTaxRate" inputmode="decimal" value="${safeHtml(s.rate)}" placeholder="예: 3.3"></div>`;
  if(s.step===3) body=`
    <h3>직원 등록 · 근무조건</h3>${prog}
    ${s.payrollType==="HOURLY"?`<div class="field"><label>계약 근무요일</label><div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px">${WD.map((x,i)=>`<label class="ob-weekday"><input class="ob-check" data-ob-day type="checkbox" value="${i}" ${s.weekdays.has(i)?"checked":""}>${x}</label>`).join("")}</div></div>
    <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px"><div class="field"><label>시작</label><input id="newWorkStart" type="time" value="${s.start}"></div><div class="field"><label>종료</label><input id="newWorkEnd" type="time" value="${s.end}"></div></div>`:`<div class="empty" style="margin-bottom:12px">월급제 계약은 상세 근무요일을 계약관리에서 별도로 관리합니다.</div>`}
    <div class="field"><label class="ob-night-label"><span>야간수당</span><input class="ob-check" id="newNightEnabled" type="checkbox" ${s.night?"checked":""}></label></div>
    <div id="newNightFields" ${s.night?"":"style='display:none'"}>
      <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px"><div class="field"><label>방식</label><select id="newNightMode"><option value="RATE" ${s.nightMode==="RATE"?"selected":""}>정률 (%)</option><option value="FLAT" ${s.nightMode==="FLAT"?"selected":""}>정액 (원)</option></select></div><div class="field"><label>값</label><input id="newNightValue" inputmode="decimal" value="${safeHtml(s.nightValue)}"></div></div>
      <div class="field"><label>야간 시작</label><input id="newNightStart" type="time" value="${s.nightStart}"></div>
    </div>
    <div class="field"><label>계약 메모</label><textarea id="newContractMemo" rows="3" placeholder="필요한 내용만 기록">${safeHtml(s.memo)}</textarea></div>`;
  if(s.step===4){
    const pay=Number(s.amount||0).toLocaleString(),days=[...s.weekdays].sort().map(i=>WD[i]).join("·");
    body=`<h3>직원 등록 · 최종확인</h3>${prog}
      <div class="card" style="padding:14px;margin:0 0 12px">
        <div style="display:grid;grid-template-columns:84px 1fr;gap:8px 10px;font-size:.9rem">
          <span style="color:var(--muted)">이름</span><b>${safeHtml(s.name)}</b>
          <span style="color:var(--muted)">입사일</span><b>${s.startedOn}</b>
          <span style="color:var(--muted)">급여</span><b>${s.payrollType==="HOURLY"?"시급":"월급"} ${pay}원</b>
          <span style="color:var(--muted)">세금·보험</span><b>${s.taxTreatment==="BUSINESS_INCOME"?"사업소득 "+safeHtml(s.rate)+"%":"4대보험"}</b>
          ${s.payrollType==="HOURLY"?`<span style="color:var(--muted)">근무조건</span><b>${days} · ${s.start}~${s.end}</b>`:""}
          <span style="color:var(--muted)">야간수당</span><b>${s.night?"사용":"사용 안 함"}</b>
        </div>
      </div>
      <div class="empty" style="text-align:left">등록을 누르면 직원·고용기간·계약조건이 함께 생성됩니다.</div>`;
  }
  host.innerHTML=body+`<div class="ob-actions ${s.step>1?"":"ob-actions--single"}">${s.step>1?'<button class="btn btn-secondary btn-lg" id="obPrev">이전</button>':""}<button class="btn btn-primary btn-lg" id="obNext">${s.step===4?"등록 완료":"다음"}</button></div>`;
  refreshNextEmployeeNumber();
  document.getElementById("newPayrollType")?.addEventListener("change",e=>{empOnboardSaveVisible();s.payrollType=e.target.value;renderEmployeeOnboardingStep()});
  document.getElementById("newTaxTreatment")?.addEventListener("change",e=>{empOnboardSaveVisible();s.taxTreatment=e.target.value;renderEmployeeOnboardingStep()});
  document.getElementById("newNightEnabled")?.addEventListener("change",e=>{empOnboardSaveVisible();s.night=e.target.checked;renderEmployeeOnboardingStep()});
  document.getElementById("obPrev")?.addEventListener("click",()=>{empOnboardSaveVisible();s.step--;renderEmployeeOnboardingStep()});
  document.getElementById("obNext").onclick=async()=>{
    const err=empOnboardValidate(s.step); if(err){alert(err);return}
    if(s.step<4){s.step++;renderEmployeeOnboardingStep();return}
    const btn=document.getElementById("obNext");btn.disabled=true;btn.textContent="등록 중…";
    const amount=Math.round(Number(s.amount));
    const workdays=s.payrollType==="HOURLY"?[...s.weekdays].sort().map(weekday=>({weekday,start:s.start,end:s.end})):[];
    try{
      const r=await BE.createEmployeeOnboarding({
        p_name:s.name,p_pin:s.pin,p_started_on:s.startedOn,p_payroll_type:s.payrollType,
        p_hourly_wage:s.payrollType==="HOURLY"?amount:null,p_monthly_salary:s.payrollType==="MONTHLY"?amount:null,
        p_tax_treatment:s.taxTreatment,p_business_deduction_rate:s.taxTreatment==="BUSINESS_INCOME"?Number(s.rate)/100:null,
        p_night_allowance_enabled:s.night,p_night_allowance_mode:s.night?s.nightMode:null,
        p_night_allowance_value:s.night?Number(s.nightValue):null,p_night_allowance_start:s.night?s.nightStart:"22:00",
        p_memo:s.memo||null,p_workdays:workdays
      });
      document.getElementById("addVeil").classList.remove("show");
      toast("in","직원 등록 완료","No."+(r.employee_no||r.employee_id)+" · 계약정보까지 저장됨");
      EMP_ONBOARD=null;restoreAddModal();renderAdmin();
    }catch(e){alert("등록 실패: "+e.message);btn.disabled=false;btn.textContent="등록 완료"}
  };
}
function bindAddModal(){ if(!EMP_ONBOARD) EMP_ONBOARD=newEmployeeOnboardingState(); renderEmployeeOnboardingStep(); }
// backdrop(배경) 클릭으로 닫지 않음 — 입력값 보호. 명시적 취소/닫기 버튼으로만 종료.
// (P0-1/P0-2: 실수로 배경 눌러 PIN·급여설정·정정 입력이 사라지는 문제 방지)
bindAddModal();

/* ---------------------- 급여 화면 (Sprint 2) ---------------------- */
// 월 내 각 직원의 완결세션 합계시간 + 근무주수(주휴 계산용) 산출
function weeksInMonth(ym){
  // 과거월의 기존 4주 기준은 보존하되, 현재/미래월은 아직 끝나지 않은 주를 선반영하지 않는다.
  return window.__payrollElapsedWeeksV1.completedWeeksInMonth(ym,kstNow());
}
async function renderPay(){
  const now=kstNow(); const p=n=>String(n).padStart(2,"0");
  const curYm=`${now.getFullYear()}-${p(now.getMonth()+1)}`;
  view.innerHTML=`
    <div class="page-title-row payroll-page-title"><h2 class="page-title">급여</h2></div>
    <div class="payroll-summary-shell">
      <div class="field payroll-month-field">
        <div class="month-wrap pay-month-nav"><button type="button" class="btn-icon" id="payMonthPrev" aria-label="이전 달">◀</button><input id="payMonth" type="month" value="${curYm}" aria-label="급여 정산 월"><button type="button" class="btn-icon" id="payMonthNext" aria-label="다음 달">▶</button></div>
      </div>
      <div id="paySummarySlot"></div>
    </div>
    <div id="payList"></div>`;
  const payMonth=document.getElementById("payMonth");
  const movePayMonth=delta=>{ const [y,m]=payMonth.value.split("-").map(Number); const d=new Date(y,m-1+delta,1); payMonth.value=`${d.getFullYear()}-${p(d.getMonth()+1)}`; drawPay(payMonth.value); };
  payMonth.addEventListener("change",e=>drawPay(e.target.value));
  document.getElementById("payMonthPrev").onclick=()=>movePayMonth(-1);
  document.getElementById("payMonthNext").onclick=()=>movePayMonth(1);
  drawPay(curYm);
}
// 공통 계산: ym → {active, events, weeks, overrides, rows[], totalNet}
// drawPay(화면)와 buildSheetSyncPayload(시트)가 동일하게 재사용 (계산 중복 방지)
async function computeMonthPayroll(ym){
  let emps=[], events=[];
  emps=await BE.allEmployees();
  if(LIVE){
    const [y,m]=ym.split("-").map(Number); const p=n=>String(n).padStart(2,"0");
    const start=new Date(y,m-1,1); start.setDate(start.getDate()-1);
    const end=new Date(y,m,1); end.setDate(end.getDate()+2);
    const sd=`${start.getFullYear()}-${p(start.getMonth()+1)}-${p(start.getDate())}`;
    const ed=`${end.getFullYear()}-${p(end.getMonth()+1)}-${p(end.getDate())}`;
    const data=await BE.eventsWithCorrections(`${sd}T00:00:00`,`${ed}T00:00:00`);
    events=applyCorrections(data.events, data.corrections);
  } else {
    events=await BE.monthEvents(ym);
  }
  const isActive=e=>e.is_active!==false && e.active!==false;
  const active=emps.filter(isActive);
  const eventEmployeeIds=new Set(events.map(x=>Number(x.employee_id)));
  const payrollCandidates=emps.filter(e=>!isHiddenInhaTestEmployee(e)&&(isActive(e)||eventEmployeeIds.has(Number(e.id))));
  let periodWeeks=null, overrides={}, contracts={}, contractWorkdays={}, substitutions=[], breakDecisions=[];
  if(LIVE){
    try{
      const pd=await BE.payrollPeriod(ym);
      periodWeeks = pd.period && pd.period.weeks;
      (pd.overrides||[]).forEach(o=>{ overrides[o.employee_id]=o; });
    }catch(e){ console.warn("payroll period load failed",e); }
    try{
      const cs=await BE.payrollContracts(ym);
      (cs||[]).forEach(c=>{ contracts[Number(c.employee_id)]=c; });
      const ws=await BE.payrollContractWorkdays(ym);
      (ws||[]).forEach(w=>{
        const id=Number(w.employee_id); if(!contractWorkdays[id]) contractWorkdays[id]={weeklyMinutes:Number(w.weekly_contracted_minutes||0),days:{}};
        if(w.weekday!=null) contractWorkdays[id].days[Number(w.weekday)]=Number(w.contracted_minutes||0);
      });
    }catch(e){ console.warn("payroll contract load failed",e); }
    try{ substitutions=await BE.payrollSubstitutions(ym)||[]; }catch(e){ console.warn("payroll substitution load failed",e); }
    try{ const [by,bm]=ym.split("-").map(Number),bp=n=>String(n).padStart(2,"0"),bend=new Date(by,bm,2); breakDecisions=await BE.payrollBreakDecisions(`${ym}-01T00:00:00`,`${bend.getFullYear()}-${bp(bend.getMonth()+1)}-${bp(bend.getDate())}T00:00:00`)||[]; }catch(e){ console.warn("break decisions load failed",e); }
  }
  const weeks = periodWeeks || weeksInMonth(ym);
  const p2=n=>String(n).padStart(2,"0");
  const rows=[]; let totalNet=0, totalGross=0;
  for(const e of payrollCandidates){
    const evs=events.filter(x=>Number(x.employee_id)===Number(e.id));
    const allSess=pairEvents(evs);
    const sess=allSess.filter(s=>{ const a=s.in||s.out; if(!a)return false;
      const payrollAnchor=s.in||s.out; // 말일 심야근무도 출근한 달 급여에 전부 귀속
      return `${payrollAnchor.getFullYear()}-${p2(payrollAnchor.getMonth()+1)}`===ym; });
    // Deactivation is a current roster state, not a reason to erase historical payroll.
    if(!isActive(e)&&!sess.length) continue;
    const completedSec=sess.filter(s=>s.status==="COMPLETE").reduce((a,s)=>a+(s.sec||0),0);
    const liveSec=sess.filter(s=>s.status==="WORKING"&&s.in).reduce((a,x)=>a+Math.max(0,(kstNow()-x.in)/1000),0);
    const sec=completedSec+liveSec;
    const hours=secToHours(sec);
    const nightMinutes=sess.filter(s=>s.status==="COMPLETE"&&s.in&&s.out).reduce((sum,s)=>{
      let cur=new Date(s.in), end=new Date(s.out), mins=0;
      while(cur<end){ const h=cur.getHours(); if(h>=22||h<6) mins++; cur=new Date(cur.getTime()+60000); }
      return sum+mins;
    },0);
    const eligibleBreakSessions=sess.filter(s=>s.status==="COMPLETE"&&s.inId&&Number(s.sec||0)>=4*3600);
    const breakByIn=new Map(breakDecisions.map(x=>[Number(x.in_event_id),x]));
    const breakEligibleCount=eligibleBreakSessions.length;
    const breakConfirmedCount=eligibleBreakSessions.filter(s=>breakByIn.has(Number(s.inId))).length;
    const breakNotProvidedCount=eligibleBreakSessions.filter(s=>breakByIn.get(Number(s.inId))?.break_provided===false).length;
    const breakCompensateCount=eligibleBreakSessions.filter(s=>breakByIn.get(Number(s.inId))?.compensate_30m===true).length;
    const issues=sess.filter(s=>s.status==="INCOMPLETE"||s.status==="ORPHAN_OUT").length;
    const ov=overrides[e.id]||null;
    const contract=contracts[Number(e.id)]||null;
    const payrollType=contract?.payroll_type||((e.wage||0)>0?"HOURLY":null);
    const substituteRows=substitutions.filter(x=>Number(x.substitute_employee_id)===Number(e.id));
    const substituteMinutes=substituteRows.reduce((sum,x)=>sum+Math.max(0,Number(x.actual_minutes||0)),0);
    let substitutePay=0;
    for(const sr of substituteRows){
      const requesterContract=contracts[Number(sr.requester_employee_id)]||null;
      const requesterEmp=emps.find(x=>Number(x.id)===Number(sr.requester_employee_id));
      const substituteWage=Number(requesterContract?.hourly_wage||requesterEmp?.wage||0);
      if(substituteWage>0) substitutePay+=xround(substituteWage*(Math.max(0,Number(sr.actual_minutes||0))/60),-1);
    }
    const contractWage=payrollType==="HOURLY"?Number(contract?.hourly_wage||0):0;
    const effWage=(ov&&ov.wage_override!=null)?Number(ov.wage_override):(contractWage||Number(e.wage||0));
    let pay=null;
    if(payrollType==="MONTHLY"&&Number(contract?.monthly_salary||0)>0){
      // 월급제 대표값은 정상 출퇴근이 완료된 날짜만 일할 누적한다.
      // 예: 260만원 / 30일 × 정상 출퇴근 1일.
      const [yy,mm]=ym.split("-").map(Number);
      const daysInMonth=new Date(yy,mm,0).getDate();
      const monthlySalary=Number(contract.monthly_salary);
      const completedDayKeys=new Set(sess.filter(x=>x.status==="COMPLETE"&&x.in&&x.out).map(x=>`${x.in.getFullYear()}-${p2(x.in.getMonth()+1)}-${p2(x.in.getDate())}`));
      const accruedDays=completedDayKeys.size;
      const accruedBase=Math.round(monthlySalary/daysInMonth*accruedDays);
      const gross=Math.round(accruedBase+substitutePay+(ov?.adjust_amount||0));
      const rate=(ov?.tax_rate_override!=null)?Number(ov.tax_rate_override):(contract.tax_treatment==="BUSINESS_INCOME"?Number(contract.business_deduction_rate||0.033):0);
      pay={base:accruedBase,weekly:0,juhyu:0,substitutePay,substituteMinutes,adjust:ov?.adjust_amount||0,gross,net:xrounddown(gross*(1-rate),-1),rate,wage:0,jweeks:0,usedOverride:!!ov,payrollType:"MONTHLY",monthlySalary,accruedDays,daysInMonth};
    }else if(effWage>0){
      const payrollEmp=contract?{...e,wage:effWage,juhyu_hours:0}:{...e,wage:effWage};
      const payrollOv=contract?{...ov,juhyu_hours_override:0,juhyu_weeks_override:0}:ov;
      pay=calcPayroll(payrollEmp,hours,weeks,payrollOv); pay.payrollType="HOURLY";
      // Never preload a month's holiday allowance. Holiday pay is earned only
      // from weeks that actually satisfy the contracted weekly minutes.
      pay.weekly=0; pay.juhyu=0; pay.jweeks=0;
      if(contract){
        // A contract-based hourly employee with no completed work must never receive prefilled/legacy holiday pay.
        if(hours<=0){pay.base=0;pay.weekly=0;pay.juhyu=0;pay.adjust=0;pay.gross=0;pay.net=0;pay.jweeks=0;}
        const cw=contractWorkdays[Number(e.id)];
        const weeklyContractMin=Number(cw?.weeklyMinutes||0);
        let qualifiedWeeks=0, juhyuHours=0;
        if(weeklyContractMin>=900 && cw){
          const weekMap={};
          for(const ss of sess.filter(x=>x.status==="COMPLETE")){
            if(!ss.in) continue;
            const d=new Date(ss.in); const day=(d.getDay()+6)%7;
            const monday=new Date(d); monday.setHours(0,0,0,0); monday.setDate(d.getDate()-day);
            const key=`${monday.getFullYear()}-${p2(monday.getMonth()+1)}-${p2(monday.getDate())}`;
            const mins=ss.status==="WORKING"?Math.max(0,(kstNow()-ss.in)/60000):Math.max(0,(ss.sec||0)/60);
            weekMap[key]=(weekMap[key]||0)+mins;
          }
          const weeklyHolidayHours=Math.min(8,weeklyContractMin/300);
          const [py,pm]=ym.split("-").map(Number);
          const monthStart=new Date(py,pm-1,1); monthStart.setHours(0,0,0,0);
          const monthEnd=new Date(py,pm,0); monthEnd.setHours(23,59,59,999);
          const nowLimit=kstNow();
          for(const [weekKey,mins] of Object.entries(weekMap)){
            const monday=new Date(weekKey+"T00:00:00");
            // 인하대점 운영일은 일요일 심야근무(26:00 = 월요일 02:00)까지 포함해 주간을 마감한다.
            // 진행 중 세션은 위에서 제외했으므로, 주휴는 완료된 근무만으로 확정된다.
            const settleAt=new Date(monday); settleAt.setDate(monday.getDate()+7); settleAt.setHours(2,0,0,0);
            const weekClosed=(ym<`${nowLimit.getFullYear()}-${p2(nowLimit.getMonth()+1)}`) || settleAt<=nowLimit;
            if(weekClosed && mins>=weeklyContractMin){ qualifiedWeeks++; juhyuHours+=weeklyHolidayHours; }
          }
        }
        pay.jweeks=qualifiedWeeks;
        pay.weekly=Math.round(effWage*Math.min(8,weeklyContractMin/300));
        pay.juhyu=Math.round(effWage*juhyuHours);
        if(hours<=0){pay.base=0;pay.weekly=0;pay.juhyu=0;pay.adjust=0;pay.gross=0;pay.net=0;pay.jweeks=0;}
        else {const breakCompPay=Math.round((effWage||0)*0.5*breakCompensateCount);pay.breakCompPay=breakCompPay;pay.gross=Math.round(pay.base+pay.juhyu+pay.adjust+breakCompPay);pay.net=xrounddown(pay.gross*(1-pay.rate),-1);}
      }
    }
    if(pay && sec<=0 && payrollType!=="MONTHLY"){ pay.base=0; pay.weekly=0; pay.juhyu=0; pay.adjust=0; pay.gross=0; pay.net=0; pay.jweeks=0; }
    // Final payroll invariant: no completed work in the selected month means no earned pay
    // for wage-based employees, regardless of legacy juhyu/override data.
    if(sec<=0 && Number(e.wage||0)>0){
      const zeroWage=Number(effWage||e.wage||0);
      pay={base:0,weekly:0,juhyu:0,adjust:0,gross:0,net:0,rate:0,wage:zeroWage,jweeks:0,usedOverride:false,payrollType:"HOURLY"};
    }
    const hasWage=!!pay;
    if(pay){ totalNet+=Number(pay.net||0); totalGross+=Number(pay.gross||0); }
    rows.push({employee_id:e.id, employee_name:e.name, emp:e, hours, sec, sessions:sess, issues, ov,
      hasWage, pay, contract, payrollType, substitutePay, substituteMinutes, nightMinutes, breakEligibleCount, breakConfirmedCount, breakNotProvidedCount, breakCompensateCount, breakDecisions:eligibleBreakSessions.map(s=>({session:s,decision:breakByIn.get(Number(s.inId))||null})), memo:(ov&&ov.memo)||e.memo||""});
  }
  const payrollEmployees=rows.map(r=>r.emp);
  return {active:payrollEmployees, events, weeks, overrides, rows, totalNet, totalGross};
}

let PAYROLL_DRAW_SEQ=0;
function closePayrollDetailPopovers(except=null){
  document.querySelectorAll(".payroll-detail-popover").forEach(x=>{ if(x!==except) x.hidden=true; });
  document.querySelectorAll(".payroll-pay-detail").forEach(x=>{
    const detail=x.parentElement?.querySelector(".payroll-detail-popover");
    if(detail!==except) x.setAttribute("aria-expanded","false");
  });
}
if(!window.__payrollPopoverDismissBound){
  window.__payrollPopoverDismissBound=true;
  document.addEventListener("pointerdown",e=>{
    if(!e.target.closest?.(".payroll-pay-detail")&&!e.target.closest?.(".payroll-detail-popover")) closePayrollDetailPopovers();
  },true);
  document.addEventListener("scroll",()=>closePayrollDetailPopovers(),true);
  document.addEventListener("pointerover",e=>{
    if(matchMedia("(hover:hover)").matches&&!e.target.closest?.(".payroll-employee-card")) closePayrollDetailPopovers();
  },true);
}
async function drawPay(ym){
  const drawSeq=++PAYROLL_DRAW_SEQ;
  const el=document.getElementById("payList");
  el.innerHTML=`<div class="empty">계산 중…</div>`;
  let R;
  try{ R=await computeMonthPayroll(ym); }
  catch(e){ if(drawSeq===PAYROLL_DRAW_SEQ) el.innerHTML=`<div class="empty">불러오기 실패: ${e.message}</div>`; return; }
  if(drawSeq!==PAYROLL_DRAW_SEQ || !el.isConnected) return;
  const active=R.active, weeks=R.weeks, overrides=R.overrides;
  if(!active.length){ el.innerHTML=`<div class="empty">등록된 급여 대상 직원이 없습니다.</div>`; return; }
  // UI boundary invariant: an hourly row rendered as 0 completed work can never display pay.
  // Recalculate the summary from the exact row objects that will be rendered.
  for(const rec of R.rows){
    if(Number(rec.sec||0)<=0 && rec.pay && rec.payrollType==="HOURLY"){
      rec.pay.base=0; rec.pay.weekly=0; rec.pay.juhyu=0; rec.pay.adjust=0;
      rec.pay.gross=0; rec.pay.net=0; rec.pay.jweeks=0;
    }
  }
  R.totalGross=R.rows.reduce((sum,rec)=>sum+Number(rec.pay?.gross||0),0);
  R.totalNet=R.rows.reduce((sum,rec)=>sum+Number(rec.pay?.net||0),0);
  const wi=document.getElementById("payWeeks"); if(wi && R.weeks) wi.value=R.weeks;
  el.innerHTML="";
  const payrollRows=[];   // 마감/엑셀용 결과 수집

  // 급여 화면은 의사결정에 필요한 요약만 먼저 보여준다.
  const sum=document.createElement("div");
  sum.className="kpi-row payroll-total-summary";
  sum.style.cssText="padding:12px 18px 13px;margin:0;display:block";
  sum.innerHTML=`<div class="kpi-label" style="font-size:.82rem;color:var(--muted)">세전 합계</div><div class="payroll-total-value" style="width:100%;text-align:center;font-size:1.50rem!important;line-height:1.12!important;font-weight:850!important;letter-spacing:-.02em;color:var(--ink)!important">${R.totalGross.toLocaleString()}원</div>`;
  const summarySlot=document.getElementById("paySummarySlot"); if(summarySlot) summarySlot.replaceChildren(sum); else el.appendChild(sum);
  const payTitle=document.createElement("div");
  payTitle.className="payroll-list-title";
  payTitle.textContent="직원별 급여";
  el.appendChild(payTitle);
  const payEmployees=document.createElement("div");
  payEmployees.className="employee-scroll-surface compact payroll-employee-grid";
  el.appendChild(payEmployees);

  for(const rec of R.rows){
    const e=rec.emp;
    const sec=rec.sec; const hours=rec.hours; const issues=rec.issues; const ov=rec.ov;
    const hasWage=rec.hasWage; const pay=rec.pay;
    if(pay){
      payrollRows.push({employee_id:rec.employee_id, employee_name:rec.employee_name, hours:Math.round(hours*100)/100,
        wage:pay.wage, weeks:pay.jweeks, base_pay:pay.base, juhyu_pay:pay.juhyu, adjust:pay.adjust,
        gross_pay:pay.gross, tax_rate:pay.rate, net_pay:pay.net, issues,
        night_minutes:rec.nightMinutes, break_eligible:rec.breakEligibleCount, break_confirmed:rec.breakConfirmedCount, break_not_provided:rec.breakNotProvidedCount, break_compensate_30m:rec.breakCompensateCount, break_comp_pay:Number(pay.breakCompPay||0), memo:rec.memo});
    }
    const eName=rec.employee_name;
    const card=document.createElement("div");
    card.className="row payroll-employee-card";
    if(rec.payrollType==="MONTHLY"&&rec.contract) card.classList.add("monthly-payroll-card");
    card.style.cssText="flex-direction:column;align-items:stretch;gap:4px";
    
    const workingSession=[...rec.sessions].reverse().find(s=>s.status==="WORKING"&&s.in);
    const isMonthly=rec.payrollType==="MONTHLY"&&rec.contract;
    const completedDayKeys=new Set(rec.sessions.filter(s=>s.status==="COMPLETE"&&s.in).map(s=>{const d=s.in;return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}));
    const completedDays=completedDayKeys.size;
    const workInfo=isMonthly?`<span class="payroll-card-metric"><span>이번 달 근무</span><strong>${completedDays}일 · ${fmtHM(sec)}</strong></span>`:`<span class="payroll-card-metric"><span>이번 달 근무</span><strong>${fmtHM(sec)}</strong></span>`;
    const representativePay=Number(pay?.gross||0);
    const payLabel="현재 급여";
    const detailLines=isMonthly
      ? [`인정일 ${completedDays}/${pay?.daysInMonth||0}일`,`월 기본급 ${Number(pay?.monthlySalary||0).toLocaleString()}원`,`일할 누적 ${Number(pay?.base||0).toLocaleString()}원`,...(rec.substituteMinutes>0?[`대타근무 ${fmtHM(rec.substituteMinutes*60)} · +${Number(rec.substitutePay||0).toLocaleString()}원`]:[]),...(Number(pay?.adjust||0)!==0?[`조정액 ${Number(pay.adjust).toLocaleString()}원`]:[])]
      : [`시급 ${Number(pay?.wage||0).toLocaleString()}원`,`기본 근무급 ${Number(pay?.base||0).toLocaleString()}원`,...(Number(pay?.juhyu||0)>0?[`주휴수당 ${Number(pay.juhyu).toLocaleString()}원`]:[]),...(rec.substituteMinutes>0?[`대타근무 ${fmtHM(rec.substituteMinutes*60)} · +${Number(rec.substitutePay||0).toLocaleString()}원`]:[]),...(Number(pay?.breakCompPay||0)>0?[`휴게 미제공 보상 +${Number(pay.breakCompPay).toLocaleString()}원`]:[]),...(Number(pay?.adjust||0)!==0?[`조정액 ${Number(pay.adjust).toLocaleString()}원`]:[])];
    card.innerHTML=`
      <div class="employee-card-primary">
        <span class="employee-card-identity"><span class="employee-card-name">${safeHtml(eName)}</span><small class="employee-card-id">(No.${safeHtml(employeeNumber(e))})</small></span>
        ${issues?`<span class="badge issue">근태확인 ${issues}</span>`:(isMonthly?`<span class="badge">월급제</span>`:'<span></span>')}
      </div>
      <div class="employee-card-secondary"><span class="employee-card-secondary-main">${workInfo}</span></div>
      <div class="payroll-employee-payline">${pay?`<button type="button" class="payroll-pay-detail" aria-expanded="false"><span class="payroll-card-metric"><span>${payLabel}</span><strong class="payroll-gross-value">${representativePay.toLocaleString()}원</strong></span><span class="payroll-info-dot" aria-hidden="true">ⓘ</span></button><div class="payroll-detail-popover" hidden>${detailLines.map(x=>`<div>${x}</div>`).join("")}<div class="payroll-detail-total">현재 급여 ${pay.gross.toLocaleString()}원</div></div>`:'<span aria-hidden="true">&nbsp;</span>'}</div>
    `;
    if(LIVE){
      const detailBtn=card.querySelector(".payroll-pay-detail"), detail=card.querySelector(".payroll-detail-popover");
      if(detailBtn&&detail){
        detailBtn.onclick=ev=>{ev.stopPropagation();const open=detail.hidden;closePayrollDetailPopovers(detail);detail.hidden=!open;detailBtn.setAttribute("aria-expanded",String(open));};
        detailBtn.addEventListener("pointerenter",()=>{if(matchMedia("(hover:hover)").matches){closePayrollDetailPopovers(detail);detail.hidden=false;detailBtn.setAttribute("aria-expanded","true");}});
      }
    }
    card.addEventListener("mouseleave",()=>{const d=card.querySelector(".payroll-detail-popover"),b=card.querySelector(".payroll-pay-detail");if(d&&!d.hidden&&matchMedia("(hover:hover)").matches){d.hidden=true;b?.setAttribute("aria-expanded","false");}});
    const secondary=card.querySelector(":scope > .employee-card-secondary");
    const payline=card.querySelector(":scope > .payroll-employee-payline");
    if(secondary&&payline){
      const body=document.createElement("div");
      body.className="payroll-card-body";
      secondary.before(body);
      body.append(secondary,payline);
    }
    if(rec.breakEligibleCount>0){const bb=document.createElement("button");bb.type="button";bb.className=`payroll-break-trigger ${rec.breakConfirmedCount>=rec.breakEligibleCount?"done":"pending"}`;bb.title=`휴게 확인 ${rec.breakConfirmedCount}/${rec.breakEligibleCount}`;bb.setAttribute("aria-label",bb.title);bb.textContent="휴게";bb.onclick=async()=>{const veil=document.getElementById("addVeil"),m=veil.querySelector(".modal");m.classList.add("payroll-break-modal");
      const [yy,mm]=ym.split("-").map(Number),first=new Date(yy,mm-1,1),last=new Date(yy,mm,0),startDow=first.getDay();
      const byDay=new Map();rec.breakDecisions.forEach((x,i)=>{const day=x.session.in.getDate();if(!byDay.has(day))byDay.set(day,[]);byDay.get(day).push({x,i})});
      const renderCalendar=()=>{let cells="";for(let i=0;i<startDow;i++)cells+='<div class="break-cal-cell empty"></div>';for(let d=1;d<=last.getDate();d++){const items=byDay.get(d)||[],done=items.length&&items.every(({x})=>!!x.decision),cls=items.length?(done?"has-break done":"has-break pending"):"";cells+=`<button type="button" class="break-cal-cell ${cls}" data-day="${d}" ${items.length?"":"disabled"}><span>${d}</span>${items.length?`<small>${items.length}건</small>`:""}</button>`};m.innerHTML=`<div class="correction-head"><div><h3 style="margin:0">${safeHtml(rec.employee_name)} · 휴게시간 확인</h3><div style="font-size:.8rem;color:var(--muted);margin-top:4px">${yy}년 ${mm}월 · 4시간 이상 근무 ${rec.breakEligibleCount}건</div></div><button id="breakClose">×</button></div><div class="break-cal-week"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div><div class="break-calendar">${cells}</div><div class="break-cal-legend"><span><i class="pending"></i>확인 필요</span><span><i class="done"></i>확인 완료</span></div>`;m.querySelector("#breakClose").onclick=()=>closeAddVeil();m.querySelectorAll("[data-day]").forEach(b=>b.onclick=()=>renderDay(Number(b.dataset.day)));};
      const renderDay=day=>{const items=byDay.get(day)||[];const lines=items.map(({x,i})=>{const s=x.session,d=x.decision;return `<div class="break-shift"><div class="break-shift-title">${hhmmBusiness(s.in,s.in)}–${hhmmBusiness(s.out,s.in)} · ${fmtHM(s.sec)}</div><div class="break-options"><button class="btn ${d?.break_provided===true?'btn-primary':'btn-secondary'}" data-bi="${i}" data-v="yes">30분 휴게 제공</button><button class="btn ${d?.break_provided===false&&!d?.compensate_30m?'btn-primary':'btn-secondary'}" data-bi="${i}" data-v="no">휴게 미제공 · 추가지급 안 함</button><button class="btn ${d?.compensate_30m?'btn-primary':'btn-secondary'}" data-bi="${i}" data-v="pay">휴게 미제공 · 30분 시급 추가지급</button></div></div>`}).join("");m.innerHTML=`<div class="correction-head"><div><h3 style="margin:0">${safeHtml(rec.employee_name)} · ${mm}월 ${day}일</h3><div style="font-size:.8rem;color:var(--muted);margin-top:4px">휴게 확인 대상 ${items.length}건</div></div><button id="breakClose">×</button></div>${lines}<button class="btn btn-secondary btn-block" id="breakBack">달력으로</button>`;m.querySelector("#breakClose").onclick=()=>closeAddVeil();m.querySelector("#breakBack").onclick=renderCalendar;m.querySelectorAll("[data-bi]").forEach(b=>b.onclick=async()=>{const x=rec.breakDecisions[Number(b.dataset.bi)],v=b.dataset.v;await BE.payrollBreakDecisionSave(rec.employee_id,x.session.inId,v==="yes",v==="pay");x.decision={break_provided:v==="yes",compensate_30m:v==="pay"};toast("in","저장됨","휴게시간 반영");renderDay(day);});};renderCalendar();openAddVeil();}};const head=card.querySelector(".employee-card-primary");if(head)head.appendChild(bb);else card.appendChild(bb);}
    payEmployees.appendChild(card);
  }
  payEmployees.style.setProperty("--payroll-row-count",String(Math.max(1,Math.ceil(R.rows.length/2))));
  // 급여마감/Excel 미리출력 UI 제거: 최신 effective 근태 기준으로 급여/시트 유지.\n  // M8.7: 구글시트 갱신 / 열기 (LIVE 전용)
  if(LIVE){
    const formatSyncStamp=d=>d.toLocaleString("ko-KR",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:true}).replace(/\. /g,".").replace(",","");
    const showOwnerInviteHelp=()=>{
      const veil=document.createElement("div");
      veil.className="payroll-info-veil";
      veil.innerHTML=`<div class="payroll-info-card" role="dialog" aria-modal="true" aria-labelledby="ownerInviteHelpTitle"><h3 id="ownerInviteHelpTitle">점주 초대 방법</h3><p>구글시트를 연 뒤 우측 상단 <b>공유</b>를 누르고, 점주 이메일 주소를 입력한 다음 권한을 <b>뷰어</b>로 선택해 초대하면 됩니다.</p><button class="btn btn-primary" id="ownerInviteHelpClose">확인</button></div>`;
      document.body.appendChild(veil);
      const close=()=>veil.remove();
      veil.querySelector("#ownerInviteHelpClose").onclick=close;
      veil.addEventListener("click",e=>{if(e.target===veil)close()});
    };
    const gbox=document.createElement("div");
    gbox.className="payroll-action-block";
    gbox.innerHTML=`<div class="payroll-sheet-actions"><button class="btn btn-secondary" id="btnSyncSheet">지금 갱신</button><button class="btn btn-secondary" id="btnOpenSheet">구글시트 열기</button></div>
      <div class="payroll-sheet-meta"><div id="syncMsg" class="payroll-sync-time">자동 갱신 대기</div><div class="payroll-invite-wrap"><button type="button" class="payroll-invite-help" id="btnOwnerInviteHelp">점주 초대 방법</button></div></div>`;
    el.appendChild(gbox);
    try{const st=JSON.parse(localStorage.getItem("baekeok_sheet_sync_v1")||"null"),msg=document.getElementById("syncMsg");if(st?.ok&&st?.at){msg.textContent=`${formatSyncStamp(new Date(st.at))} 자동 갱신됨`;}else if(st?.ok===false){msg.textContent="자동 갱신 재시도 예정";}else{msg.textContent="자동 갱신 중…";setTimeout(()=>SheetAutoSync.run("view"),0);}}catch(_){const msg=document.getElementById("syncMsg");if(msg)msg.textContent="자동 갱신 중…";setTimeout(()=>SheetAutoSync.run("view"),0);}
    document.getElementById("btnOwnerInviteHelp").onclick=showOwnerInviteHelp;
    document.getElementById("btnOpenSheet").onclick=()=>{
      let url=`https://docs.google.com/spreadsheets/d/${CONFIG.SHEET_ID}/edit`;
      try{const st=JSON.parse(localStorage.getItem("baekeok_sheet_sync_v1")||"null");if(st?.sheet_url)url=st.sheet_url;}catch(_){}
      // 동기화 응답이 월 탭 URL(gid 포함)을 주면 그대로 사용한다. 없을 때만 현재 월의 기존 gid 규칙으로 보정한다.
      if(!/#gid=\d+/.test(url)){const monthNo=Number(String(ym).slice(5,7));const gid=220260100+monthNo;url=url.split("#")[0]+"#gid="+gid;}
      window.open(url,"_blank");
    };
    document.getElementById("btnSyncSheet").onclick=async()=>{
      const btn=document.getElementById("btnSyncSheet"); const msg=document.getElementById("syncMsg");
      btn.disabled=true; btn.textContent="갱신 중…";
      try{
        const payload=await buildSheetSyncPayload(ym);
        const res=await BE.syncSheet(ym, payload);
        const syncAt=new Date();
        localStorage.setItem("baekeok_sheet_sync_v1",JSON.stringify({ok:true,ym,at:syncAt.toISOString(),sheet_url:res?.result?.spreadsheet_url||res?.spreadsheet_url||null}));
        msg.textContent=`${formatSyncStamp(syncAt)} 수동 갱신됨`;
        toast("in","구글시트 갱신 완료", res.closed?"마감 확정본":"예상(미마감)");
      }catch(e){
        msg.textContent="갱신 실패";
        toast("err","구글시트 갱신 실패", e.message.slice(0,40));
      }finally{ btn.disabled=false; btn.textContent="지금 갱신"; }
    };
  }


}
// M8.7: 시트 동기화 payload 생성 (DOM 아님 — DB조회+기존 계산함수 재사용)
async function buildSheetSyncPayload(ym){
  const R=await computeMonthPayroll(ym);
  const p2=n=>String(n).padStart(2,"0");
  const dstr=d=>`${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`;
  // 근태 일별요약 + 세션상세
  const attRows=[], sessRows=[];
  for(const rec of R.rows){
    // 날짜별 그룹핑 (출근일 기준)
    const byDay={};
    for(const s of rec.sessions){
      const anchor=s.in||s.out; if(!anchor) continue;
      const day=dstr(anchor);
      (byDay[day]=byDay[day]||[]).push(s);
    }
    for(const day of Object.keys(byDay).sort()){
      const daySess=byDay[day];
      let daySec=0, hasCorrected=false, issue=false;
      daySess.forEach((s,i)=>{
        if(s.status==="COMPLETE") daySec+=(s.sec||0);
        if(s.status==="INCOMPLETE"||s.status==="ORPHAN_OUT") issue=true;
        if(s.corrected) hasCorrected=true;
        const sessionAnchor=s.in||s.out;
        sessRows.push([day, rec.employee_name, i+1,
          s.in?hhmmBusiness(s.in,sessionAnchor):"—", s.out?hhmmBusiness(s.out,sessionAnchor):"—",
          s.status==="COMPLETE"?fmtHM(s.sec):(s.status==="WORKING"?"근무중":"—"),
          _statusLabel(s.status)]);
      });
      const firstIn=daySess.find(s=>s.in), lastOut=[...daySess].reverse().find(s=>s.out);
      attRows.push([day, rec.employee_name,
        firstIn?hhmmBusiness(firstIn.in,firstIn.in):"—", lastOut?hhmmBusiness(lastOut.out,firstIn?.in||lastOut.out):"—",
        daySec?fmtHM(daySec):"—", daySess.length,
        issue?"확인필요":"정상", hasCorrected?"정정":""]);
    }
  }
  // 급여 (마감 전 예상; 마감 후엔 Edge Function이 snapshot으로 대체)
  const payRows=[];
  for(const rec of R.rows){
    if(!rec.pay){ payRows.push([rec.employee_name, fmtHM(rec.sec), fmtHM(rec.nightMinutes*60), "미설정","—","—",`${rec.breakConfirmedCount}/${rec.breakEligibleCount}`,rec.breakNotProvidedCount,rec.breakCompensateCount,"—","—","—","시급 설정 필요"]); continue; }
    const p=rec.pay;
    payRows.push([rec.employee_name, fmtHM(rec.sec), fmtHM(rec.nightMinutes*60), won(p.wage), won(p.base),
      won(p.juhyu), `${rec.breakConfirmedCount}/${rec.breakEligibleCount}`, rec.breakNotProvidedCount, rec.breakCompensateCount, won(p.breakCompPay||0), won(p.adjust), won(p.gross), "예상"]);
  }
  return {
    store_key:String(CURRENT_STORE_ID||1),
    store_name:STORE_NAME_BY_ID.get(Number(CURRENT_STORE_ID))||CONFIG.STORE_NAME,
    attendance:{ header:["날짜","직원명","출근","퇴근","실근무시간","세션수","상태","정정여부"], rows:attRows },
    sessions:{ header:["날짜","직원명","세션#","출근","퇴근","근무시간","상태"], rows:sessRows },
    payroll:{ header:["직원명","총 실근무시간","22시 이후 야간근무","시급","기본급","주휴","휴게확인","휴게미제공","30분 추가지급","휴게보상액","조정","예상 세전급여","상태"], rows:payRows },
  };
}
function hhmmBusiness(value,anchor){
  const d=value instanceof Date?value:fromIso(value),a=anchor instanceof Date?anchor:fromIso(anchor);
  if(!Number.isFinite(d.getTime())||!Number.isFinite(a.getTime()))return "—";
  const dm=new Date(d.getFullYear(),d.getMonth(),d.getDate());
  const am=new Date(a.getFullYear(),a.getMonth(),a.getDate());
  const dayOffset=Math.max(0,Math.round((dm-am)/86400000));
  return `${String(d.getHours()+dayOffset*24).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}
function _statusLabel(s){ return {COMPLETE:"정상",WORKING:"근무중",INCOMPLETE:"퇴근누락",ORPHAN_OUT:"출근누락"}[s]||s; }

// Google Sheet auto-sync: existing sheet remains a read/report replica; Supabase is authoritative.
// Runs only in LIVE + authenticated admin sessions. Failures never affect attendance/payroll writes.
const SheetAutoSync=(()=>{
  let busy=false,lastFingerprint="",retryMs=0,timer=null;
  const currentYm=()=>{const d=kstNow();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`};
  const fingerprint=p=>JSON.stringify(p);
  async function run(reason="timer"){
    if(!LIVE||!Auth.token||busy||document.visibilityState==="hidden")return;
    busy=true;
    try{
      const ym=currentYm(),payload=await buildSheetSyncPayload(ym),fp=fingerprint(payload);
      if(reason==="timer"&&fp===lastFingerprint)return;
      const syncResult=await BE.syncSheet(ym,payload);
      lastFingerprint=fp;retryMs=0;
      localStorage.setItem("baekeok_sheet_sync_v1",JSON.stringify({ok:true,ym,at:new Date().toISOString(),sheet_url:syncResult?.result?.spreadsheet_url||syncResult?.spreadsheet_url||null}));
      const msg=document.getElementById("syncMsg");if(msg){const d=new Date();const stamp=d.toLocaleString("ko-KR",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hour12:true}).replace(/\\. /g,".").replace(",","");msg.textContent=`${stamp} 자동 갱신됨`;}
    }catch(e){
      retryMs=retryMs?Math.min(retryMs*2,300000):15000;
      localStorage.setItem("baekeok_sheet_sync_v1",JSON.stringify({ok:false,at:new Date().toISOString(),error:String(e?.message||e)}));
      const msg=document.getElementById("syncMsg");if(msg)msg.textContent="자동 갱신 재시도 예정";
      clearTimeout(timer);timer=setTimeout(()=>run("retry"),retryMs);
      console.warn("[sheet auto sync]",e);
    }finally{busy=false}
  }
  function start(){
    if(!LIVE)return;
    setTimeout(()=>run("resume"),2500);
    setInterval(()=>run("timer"),60000);
    document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")setTimeout(()=>run("resume"),1200)});
    window.addEventListener("online",()=>setTimeout(()=>run("retry"),1200));
  }
  return {start,run};
})();
SheetAutoSync.start();
function won(n){ return (n||0).toLocaleString("ko-KR")+"원"; }

// 근태 지문: 이벤트 개수 + 최신 시각 (마감 후 변경 감지)
function fingerprintOf(events){
  // Stable 64-bit FNV-1a over every effective event. Any corrected time/type/id change must invalidate a closed snapshot.
  const canonical=[...(events||[])].map(e=>[
    e.id??"",e.employee_id??"",e.event_type??"",e.event_at??"",e.corrected?1:0
  ].join("|")).sort().join("\n");
  let h=0xcbf29ce484222325n;
  for(let i=0;i<canonical.length;i++){
    h^=BigInt(canonical.charCodeAt(i));
    h=BigInt.asUintN(64,h*0x100000001b3n);
  }
  return `${events?.length||0}|${h.toString(16).padStart(16,"0")}`;
}
// 세무사용 Excel 출력 (SheetJS, 브라우저에서 바로 다운로드)
function exportPayrollXlsx(ym, rows, totalNet, weeks, effectiveRows=[]){
  if(typeof XLSX==="undefined"){ toast("err","Excel 모듈 로딩중","잠시 후 다시 시도"); return; }
  const header=["성명","실근무시간","시급","주휴주수","기본급","주휴수당","조정","세전급여","원천징수율","세후급여","비고"];
  const data=[header];
  for(const r of rows){
    data.push([r.employee_name, r.hours, r.wage, r.weeks, r.base_pay, r.juhyu_pay, r.adjust,
      r.gross_pay, (r.tax_rate*100).toFixed(1)+"%", r.net_pay, r.memo||""]);
  }
  data.push([]);
  data.push(["합계","","","","","","","","","", ""]);
  data.push(["세후 합계",""," "," ","","","","","",totalNet,""]);
  const ws=XLSX.utils.aoa_to_sheet(data);
  ws["!cols"]=[{wch:10},{wch:11},{wch:9},{wch:8},{wch:11},{wch:11},{wch:9},{wch:11},{wch:10},{wch:12},{wch:20}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, ym);
  const att=[["날짜","성명","출근","퇴근","실근무시간","상태","정정반영"]];
  const p2=n=>String(n).padStart(2,"0");
  for(const rec of effectiveRows){for(const s of rec.sessions||[]){const a=s.in||s.out;if(!a)continue;att.push([`${a.getFullYear()}-${p2(a.getMonth()+1)}-${p2(a.getDate())}`,rec.employee_name,s.in?hhmmBusiness(s.in,s.in):"—",s.out?hhmmBusiness(s.out,s.in||s.out):"—",s.status==="COMPLETE"?fmtHM(s.sec):(s.status==="WORKING"?"근무중":"—"),_statusLabel(s.status),s.corrected?"정정 반영":""]);}}
  const aws=XLSX.utils.aoa_to_sheet(att);aws["!cols"]=[{wch:12},{wch:10},{wch:9},{wch:9},{wch:12},{wch:10},{wch:10}];XLSX.utils.book_append_sheet(wb,aws,"정정반영 근태");
  XLSX.writeFile(wb, `백억커피_인하대점_급여_${ym}.xlsx`);
  toast("in","Excel 생성됨",`${ym} 급여자료`);
}
// M5: 이번 달만의 조정 (직원 영구설정과 분리)
/* ---------------------- 계약서 (schema_v11, 관리자 전용) ---------------------- */
function uuidv4(){
  if(typeof crypto!=="undefined" && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==='x'?r:(r&0x3|0x8)).toString(16);});
}
const DOC_TYPES={ "application/pdf":"pdf", "image/jpeg":"jpg", "image/png":"png" };
// 계약서 삭제 에러 → 사용자 문구 (raw/RPC부재 노출 안 함)
function mapDocDeleteErr(r){
  const e=(r&&r.error)||"";
  if(e==="NOT_OWN_UPLOAD") return "본인이 올린 파일만 삭제할 수 있습니다.";
  if(e==="TOO_OLD_TO_DELETE") return "첨부 후 24시간이 지나 삭제할 수 없습니다(보존).";
  if(e==="DOC_NOT_FOUND") return "이미 삭제된 파일입니다.";
  if(e==="NOT_AUTHORIZED") return "관리자 권한이 없습니다.";
  // RPC 미배포(함수 없음)·기타 서버오류: 원문 대신 일반 안내
  return "삭제 기능을 사용할 수 없습니다. 관리자에게 문의하세요.";
}
async function openScheduleModal(){
  const v=document.getElementById("addVeil"); const modal=v.querySelector(".modal");
  const t=kstNow(); const p=n=>String(n).padStart(2,"0");
  const today=`${t.getFullYear()}-${p(t.getMonth()+1)}-${p(t.getDate())}`;
  modal.innerHTML=`
    <h3>근무 스케줄 관리</h3>
    <div class="field"><label>날짜</label><input id="schDate" type="date" value="${today}"></div>
    <div id="schList"><div class="empty">불러오는 중…</div></div>`;
  openAddVeil();
  const dateEl=document.getElementById("schDate");
  async function refresh(){
    const box=document.getElementById("schList");
    const date=dateEl.value; if(!date){ box.innerHTML=""; return; }
    let emps=[], sched=[];
    try{ emps=await BE.allEmployees(); sched=await BE.scheduleList(date,date); }
    catch(e){ box.innerHTML=`<div class="empty">불러오기 실패: ${e.message}</div>`; return; }
    const active=emps.filter(e=>e.is_active!==false && e.active!==false);
    box.innerHTML="";
    for(const e of active){
      const w=sched.find(x=>x.employee_id===e.id);
      const st=w?w.status:""; const ss=w&&w.planned_start?w.planned_start.slice(0,5):""; const se=w&&w.planned_end?w.planned_end.slice(0,5):"";
      const row=document.createElement("div"); row.className="row"; row.style.cssText="flex-direction:column;align-items:stretch;gap:6px;border-bottom:1px solid var(--border);padding:10px 0";
      row.innerHTML=`
        <div style="font-weight:600">${safeHtml(e.name)}${w?'':' <span style="color:var(--muted);font-size:.75rem">미등록</span>'}</div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
          <select class="sch-st" style="height:44px;min-width:132px;flex:1 1 132px;padding:0 10px;border:1px solid var(--line);border-radius:10px;background:var(--panel)">
            <option value="">선택</option>
            <option value="WORK" ${st==="WORK"?"selected":""}>근무</option>
            <option value="OFF" ${st==="OFF"?"selected":""}>휴무(OFF)</option>
          </select>
          <input class="sch-s" type="time" value="${ss}" style="height:44px;${st==="WORK"?"":"display:none"}">
          <span class="sch-tilde" style="${st==="WORK"?"":"display:none"}">~</span>
          <input class="sch-e" type="time" value="${se}" style="height:44px;${st==="WORK"?"":"display:none"}">
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-primary btn-sm sch-save" style="flex:1">저장</button>
          ${w?`<button class="btn btn-danger btn-sm sch-del" style="flex:0 0 auto">등록취소</button>`:''}
        </div>`;
      const stSel=row.querySelector(".sch-st"), sIn=row.querySelector(".sch-s"), eIn=row.querySelector(".sch-e"), til=row.querySelector(".sch-tilde");
      stSel.onchange=()=>{
        const on=stSel.value==="WORK";
        if(on && !sIn.value && !eIn.value){
          const now=kstNow(); const h=now.getHours();
          sIn.value=`${p(h)}:00`; eIn.value=`${p((h+1)%24)}:00`;
        }
        sIn.style.display=on?"":"none"; eIn.style.display=on?"":"none"; til.style.display=on?"":"none";
      };
      row.querySelector(".sch-save").onclick=async()=>{
        const status=stSel.value;
        if(!status){ toast("err","선택 필요","근무 또는 휴무를 선택하세요"); return; }
        if(status==="WORK" && (!sIn.value||!eIn.value)){ toast("err","시간 필요","예정 출근/퇴근을 입력하세요"); return; }
        try{
          const r=await BE.scheduleSet(e.id,date,status,sIn.value,eIn.value,null);
          if(r&&r.ok!==false){ toast("in","저장됨",e.name); refresh(); }
          else{ toast("err","저장 실패", r&&r.error==="ZERO_DURATION"?"출근/퇴근 시각이 같습니다":(r&&r.error||"")); }
        }catch(err){
          const raw=String(err&&err.message||err||"");
          const isNetwork=(err&&err.name==="TypeError")||/failed to fetch|load failed|networkerror|network request failed|fetch/i.test(raw);
          toast("err","저장 실패",isNetwork?"네트워크 연결을 확인한 뒤 다시 저장하세요. 입력값은 유지됩니다.":(raw||"알 수 없는 오류"));
        }
      };
      const del=row.querySelector(".sch-del");
      if(del) del.onclick=async()=>{
        if(!confirm(`${e.name}의 ${date} 스케줄 등록을 취소할까요?\n(미등록 상태로 돌아갑니다)`)) return;
        try{ await BE.scheduleDelete(e.id,date); toast("out","등록취소",e.name); refresh(); }
        catch(err){ toast("err","취소 실패",err.message); }
      };
      box.appendChild(row);
    }
  }
  dateEl.onchange=refresh;
  refresh();
}

async function openDocsModal(emp){
  const v=document.getElementById("addVeil"); const modal=v.querySelector(".modal");
  // 현재 관리자 email (본인 업로드 판정용). 실패해도 진행(그 경우 삭제버튼 안 뜸=안전).
  let myEmail=null; try{ const u=await Auth.getUser(); myEmail=u&&u.email; }catch(_){}
  const DELETE_WINDOW_MS = 24*3600*1000;
  let timers=[];  // countdown interval 목록 (cleanup용)
  function clearTimers(){ timers.forEach(t=>clearInterval(t)); timers=[]; }
  // 모달이 닫히거나 다른 내용으로 바뀌면 timer 정리
  const closeObserver=()=>{ if(!document.body.contains(modal)||!modal.querySelector("#docList")) { clearTimers(); } };

  modal.innerHTML=`
    <h3>${emp.name} · 근로계약서</h3>
    <div style="font-size:.78rem;color:var(--muted);margin-bottom:12px">PDF/JPEG/PNG, 최대 10MB. 새로 첨부해도 기존 파일은 보존됩니다.</div>
    <input type="file" id="docFile" accept="application/pdf,image/jpeg,image/png" style="display:none">
    <div class="btn-pair">
      <button class="btn btn-secondary" id="docPickBtn">${ICON.file} 파일 선택</button>
      <button class="btn btn-primary" id="docUploadBtn">${ICON.upload} 첨부</button>
    </div>
    <div id="docPicked" style="font-size:.82rem;color:var(--text-muted);margin-top:8px">선택된 파일 없음</div>
    <div id="docMsg" style="font-size:.8rem;color:var(--text-muted);margin-top:6px"></div>
    <div class="section-t" style="margin-top:16px;font-size:.85rem">첨부 목록 <span id="docCount"></span></div>
    <div id="docList"><div class="empty">불러오는 중…</div></div>`;
  openAddVeil();
  // X버튼/뒤로 눌러 닫힐 때도 timer 정리 (openAddVeil이 주입한 close 핸들러에 얹기)
  const xbtn=modal.querySelector(".modal-x"); if(xbtn){ const orig=xbtn.onclick; xbtn.onclick=(e)=>{ clearTimers(); if(orig) orig(e); }; }

  const msg=document.getElementById("docMsg");
  const fEl=document.getElementById("docFile");
  const picked=document.getElementById("docPicked");
  document.getElementById("docPickBtn").onclick=()=>fEl.click();
  fEl.onchange=()=>{ const f=fEl.files&&fEl.files[0]; picked.textContent = f?`${f.name} · ${Math.round(f.size/1024)}KB`:"선택된 파일 없음"; msg.textContent=""; };

  // 남은시간 → "N시간 N분" / 마지막 1분 "N초" / 만료
  function fmtRemain(ms){
    if(ms<=0) return null;
    if(ms < 60*1000){ return `${Math.ceil(ms/1000)}초`; }
    const totalMin=Math.floor(ms/60000);
    const h=Math.floor(totalMin/60), m=totalMin%60;
    return h>0 ? `${h}시간 ${m}분` : `${m}분`;
  }

  async function refresh(){
    clearTimers();  // refresh 시 기존 timer 전부 제거 (중복 방지)
    const box=document.getElementById("docList");
    const cnt=document.getElementById("docCount");
    try{
      const rows=await BE.docList(emp.id);
      cnt.textContent = rows&&rows.length ? `(${rows.length})` : "";
      if(!rows||!rows.length){ box.innerHTML=`<div class="empty">등록된 계약서가 없습니다.</div>`; return; }
      box.innerHTML="";
      for(const d of rows){
        const item=document.createElement("div"); item.className="row";
        const dt=new Date(d.uploaded_at); const p=n=>String(n).padStart(2,"0");
        const when=`${dt.getFullYear()}-${p(dt.getMonth()+1)}-${p(dt.getDate())}`;
        const isMine = myEmail && d.uploaded_by_email && d.uploaded_by_email===myEmail;
        const expireAt = dt.getTime() + DELETE_WINDOW_MS;

        // 액션 버튼: 타인=열기만 / 본인=열기+삭제(countdown 또는 만료)
        let actionHtml = `<button class="btn btn-secondary btn-sm" data-open="${d.storage_path}">열기</button>`;
        if(isMine){
          actionHtml += `<button class="btn btn-danger btn-sm doc-del-btn" data-del="${d.id}" data-exp="${expireAt}">삭제</button>`;
        }
        item.innerHTML=`<div style="flex:1;min-width:0"><div style="font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${d.filename}</div><div style="color:var(--muted);font-size:.75rem">${when} · ${Math.round((d.byte_size||0)/1024)}KB</div></div>${actionHtml}`;

        item.querySelector("[data-open]").onclick=async()=>{
          try{ const url=await BE.docSignedUrl(d.storage_path,60); window.open(url,"_blank"); }
          catch(e){ toast("err","열람 실패","다시 시도하세요"); }
        };

        const delBtn=item.querySelector("[data-del]");
        if(delBtn){
          // countdown 렌더 + 만료 전환
          const applyLabel=()=>{
            const remain = expireAt - Date.now();
            if(remain>0){
              delBtn.textContent = `삭제 · ${fmtRemain(remain)}`;
              delBtn.classList.remove("btn-expired");
              delBtn.dataset.expired="0";
            }else{
              delBtn.textContent = "삭제 · 만료";
              delBtn.classList.add("btn-expired");   // 회색 비활성 스타일(실제 disabled 아님)
              delBtn.dataset.expired="1";
            }
          };
          applyLabel();
          // timer: 만료 전이면 갱신. 남은시간 1분 초과면 30초마다, 1분 이하면 1초마다.
          const tick=()=>{
            const remain=expireAt-Date.now();
            applyLabel();
            if(remain<=0){ clearInterval(iv); timers=timers.filter(t=>t!==iv); }
          };
          const iv=setInterval(tick, 1000);  // 1초마다(초단위 표시 위해). 분 단위 구간도 1초 tick이나 표시는 분.
          timers.push(iv);

          delBtn.onclick=async()=>{
            if(delBtn.dataset.expired==="1"){
              // 만료: 실제 삭제 호출 안 함. 안내만.
              alert("삭제할 수 없는 계약서입니다\n\n오첨부 정정을 위한 삭제 가능시간인 업로드 후 24시간이 만료되었습니다. 계약 기록 보존을 위해 24시간이 지난 파일은 삭제할 수 없습니다.");
              return;
            }
            const remainNow = expireAt - Date.now();
            const remainStr = fmtRemain(remainNow) || "곧 만료";
            if(!confirm(`계약서를 삭제할까요?\n\n오첨부 정정을 위해 업로드 후 24시간 동안만 삭제할 수 있습니다. 24시간이 지나면 계약 기록 보존을 위해 삭제할 수 없습니다.\n\n현재 삭제 가능 시간: ${remainStr}`)) return;
            try{
              // Storage → metadata 순서 (실패 시 재시도 가능)
              let storageOk=false;
              try{ storageOk=await BE.docRemove(d.storage_path); }catch(_){ storageOk=false; }
              if(!storageOk){ toast("err","삭제 실패","파일 삭제에 실패했습니다. 잠시 후 다시 시도하세요."); return; }
              let r=null;
              try{ r=await BE.docDelete(d.id); }catch(_){ r={ok:false,error:"RPC_UNAVAILABLE"}; }
              if(!r||!r.ok){
                // 확인창 열어둔 사이 서버 24h 만료 등
                if(r&&r.error==="TOO_OLD_TO_DELETE"){
                  toast("err","삭제 불가","삭제 가능시간이 만료되어 보존된 계약서입니다.");
                }else{
                  toast("err","삭제 실패", mapDocDeleteErr(r));
                }
                refresh(); return;
              }
              toast("out","삭제됨",d.filename);
              refresh();
            }catch(e){ toast("err","삭제 실패","잠시 후 다시 시도하세요."); }
          };
        }
        box.appendChild(item);
      }
    }catch(e){ box.innerHTML=`<div class="empty">목록 실패: ${e.message}</div>`; }
  }
  document.getElementById("docUploadBtn").onclick=async()=>{
    const file=fEl.files&&fEl.files[0];
    if(!file){ msg.textContent="파일을 선택하세요."; return; }
    if(!DOC_TYPES[file.type]){ msg.textContent="PDF/JPEG/PNG만 첨부할 수 있습니다."; return; }
    if(file.size>10485760){ msg.textContent="10MB 이하만 첨부할 수 있습니다."; return; }
    const ext=DOC_TYPES[file.type];
    const path=`${emp.id}/${uuidv4()}.${ext}`;
    msg.textContent="업로드 중…";
    try{ await BE.docUpload(path,file); }
    catch(e){ msg.textContent="업로드 실패: 파일 저장에 실패했습니다."; return; }
    let added=null;
    try{ added=await BE.docAdd(emp.id,path,file.name,file.type,file.size); }
    catch(e){ added={ok:false,error:"RPC_"+e.message}; }
    if(!added||!added.ok){
      const removed=await BE.docRemove(path);
      msg.textContent = removed
        ? "첨부 실패: 정보 등록에 실패해 업로드를 취소했습니다. 다시 시도하세요."
        : "첨부 실패: 정보 등록 실패 + 파일 정리도 실패. 관리자에게 문의하세요.";
      return;
    }
    msg.textContent="첨부 완료.";
    fEl.value=""; picked.textContent="선택된 파일 없음";
    refresh();
  };
  refresh();
}

function openMonthAdjust(emp, ym, ov){
  ov = ov||{};
  const v=document.getElementById("addVeil"); const modal=v.querySelector(".modal");
  modal.innerHTML=`
    <h3>${emp.name} · ${ym} 이달 조정</h3>
    <input id="maWeeks" type="hidden" value="${ov.juhyu_weeks_override??''}">
    <input id="maWage" type="hidden" value="${ov.wage_override??''}">
    <input id="maJh" type="hidden" value="${ov.juhyu_hours_override??''}">
    <input id="maTax" type="hidden" value="${ov.tax_rate_override!=null?(ov.tax_rate_override*100).toString():''}">
    <div class="field"><label>가감액 (수당+/공제−, 원)</label><input id="maAdj" inputmode="numeric" value="${ov.adjust_amount||''}" placeholder="예: -20000"></div>
    <div class="field"><label>이달 사유</label><input id="maMemo" value="${ov.memo||''}" placeholder="예: 15h미만 1주 제외"></div>
    <button class="btn btn-primary btn-block btn-lg" id="maSave">이달 조정 저장</button>`;
  openAddVeil();
  modal.querySelector("#maSave").onclick=async()=>{
    const maTaxRaw=document.getElementById("maTax").value.trim();
    let taxOv="";
    if(maTaxRaw!==""){
      const p=parseTaxPct(maTaxRaw);
      if(p===false||p===null){ alert("이달 원천징수율은 0~100 사이 숫자(%)로 입력하거나 비워두세요."); return; }
      taxOv=String(p);   // numeric 문자열. RPC가 nullif+numeric 캐스팅
    }
    const fields={
      juhyu_weeks_override: document.getElementById("maWeeks").value,
      wage_override: document.getElementById("maWage").value,
      juhyu_hours_override: document.getElementById("maJh").value,
      tax_rate_override: taxOv,   // 빈문자열이면 RPC nullif로 NULL → fallback 유지
      adjust_amount: document.getElementById("maAdj").value,
      memo: document.getElementById("maMemo").value.trim(),
    };
    try{ await BE.setPeriodEmployee(ym, emp.id, fields); }catch(e){ alert(e.message); return; }
    v.classList.remove("show"); restoreAddModal();
    toast("in","이달 조정 저장",`${ym}에만 적용됩니다.`);
    drawPay(ym);
  };
}
function openPayEdit(emp){
  const v=document.getElementById("addVeil");
  const modal=v.querySelector(".modal");
  modal.innerHTML=`
    <h3>${emp.name} · 급여 설정</h3>
    <div class="field"><label>시급 (원)</label><input id="peWage" inputmode="numeric" value="${emp.wage||''}" placeholder="예: 12000"></div>
    <div class="field"><label>주당 주휴시간 (0=주휴없음)</label><input id="peJh" inputmode="decimal" value="${emp.juhyu_hours||0}" placeholder="예: 4.4"></div>
    <div class="field"><label>주휴 주당액 반올림 단위</label>
      <select id="peJr" style="height:48px;border-radius:12px;border:1px solid var(--line);background:var(--panel2);color:var(--ink);padding:0 12px">
        <option value="" ${emp.juhyu_round==null?'selected':''}>반올림 안 함</option>
        <option value="-1" ${emp.juhyu_round===-1?'selected':''}>10원 단위</option>
        <option value="-2" ${emp.juhyu_round===-2?'selected':''}>100원 단위</option>
        <option value="-3" ${emp.juhyu_round===-3?'selected':''}>1,000원 단위</option>
      </select></div>
    <div class="field"><label>원천징수율 (%)</label>
      <input id="peTax" inputmode="decimal" value="${((emp.tax_rate??0.033)*100).toString()}" placeholder="예: 3.3">
      <div style="font-size:.72rem;color:var(--muted);margin-top:4px">퍼센트로 입력 (예: 3.3, 0). 4대보험 등 정확한 율은 회계사 확인 후 반영</div></div>
    <div class="field"><label>메모 (예외 사유)</label><textarea id="peMemo" rows="4" placeholder="예: 15h미만 1주 차감">${emp.memo||''}</textarea></div>
    <button class="btn btn-primary btn-block btn-lg" id="peSave">저장</button>
    <button class="btn btn-tertiary btn-block" id="peCancel" style="margin-top:8px">취소</button>`;
  openAddVeil();
  modal.querySelector("#peCancel").onclick=()=>{ v.classList.remove("show"); restoreAddModal(); };
  modal.querySelector("#peSave").onclick=async()=>{
    const taxPct = parseTaxPct(document.getElementById("peTax").value);
    if(taxPct===false){ alert("원천징수율은 0 이상 100 이하의 숫자(%)로 입력하세요."); return; }
    const fields={
      wage: parseInt(document.getElementById("peWage").value)||null,
      juhyu_hours: parseFloat(document.getElementById("peJh").value)||0,
      juhyu_round: document.getElementById("peJr").value===''?null:parseInt(document.getElementById("peJr").value),
      tax_rate: taxPct===null ? 0.033 : taxPct,   // 빈값 → 기본 3.3% (기존 semantics 보존)
      memo: document.getElementById("peMemo").value.trim()||null,
    };
    try{ await BE.updateEmployee(emp.id,fields); }catch(e){ alert(e.message); return; }
    v.classList.remove("show"); restoreAddModal();
    drawPay(document.getElementById("payMonth").value);
  };
}
function restoreAddModal(){
  const modal=document.getElementById("addVeil").querySelector(".modal");
  modal.classList.remove("has-back");
  modal.innerHTML=`<div id="employeeOnboarding"></div>`;
  EMP_ONBOARD=newEmployeeOnboardingState();
  bindAddModal();
}

/* ---------------------- 부팅 ---------------------- */

document.getElementById("appVersion").textContent=APP_VERSION;
const connEl=document.getElementById("conn");
if(LIVE){ connEl.className="conn live"; connEl.textContent="클라우드 연결됨 · Supabase"; }else{ connEl.className="conn error"; connEl.textContent="설정 오류 · Supabase 구성 확인 필요"; }
function tick(){ document.getElementById("clock").textContent=hms(kstNow()); }
tick(); setInterval(tick,1000);
// iOS Safari zoom 차단 (viewport meta는 16.4+에서 무시되므로 JS로 보강)
// 단일 터치(세로 스크롤/버튼 탭/모달 조작/파일선택)는 그대로 두고, 확대 제스처만 차단.
// 1) 핀치 제스처(gesture 이벤트)
document.addEventListener("gesturestart", e=>e.preventDefault());
document.addEventListener("gesturechange", e=>e.preventDefault());
document.addEventListener("gestureend", e=>e.preventDefault());
// 2) 손가락 2개 이상 touchmove = 핀치 → 차단 (1개는 스크롤이므로 통과)
document.addEventListener("touchmove", e=>{ if(e.touches && e.touches.length>1) e.preventDefault(); }, {passive:false});
// 3) 더블탭 줌은 CSS touch-action:manipulation(html/body/전역)로 처리 — JS touchend 가로채기는
//    버튼 click 이중발화/취소 위험이 있어 쓰지 않음.


function removeLegacySubstituteEntry(){
  document.querySelectorAll('a,button').forEach(el=>{
    const label=(el.textContent||'').replace(/\s+/g,' ').trim();
    const href=el.getAttribute&&el.getAttribute('href')||'';
    if(label==='대타 근무'||label==='대타근무'||/substitution\.html/i.test(href)) el.remove();
  });
}
removeLegacySubstituteEntry();


document.getElementById("hqHome")?.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();if(!STORE_ENTRY_LOCK)openHqDashboard();});
if(LIVE) Auth.load();
loadStores().finally(()=>route());
