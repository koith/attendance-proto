const CONFIG={SUPABASE_URL:'https://waluhdgqhwjjwmflhrle.supabase.co',SUPABASE_ANON_KEY:'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndhbHVoZGdxaHdqandtZmxocmxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MTg4NjAsImV4cCI6MjEwMzE5NDg2MH0.-UugGE05V70Ecw__UdIZpWJr2mDYmLfV7mh_lR-U9Mw'};
const Auth={token:null,session:null,load(){try{this.session=JSON.parse(localStorage.getItem('baekeok_auth')||'null');this.token=this.session?.access_token||null}catch(_){this.session=null;this.token=null}return this.token},save(s){if(!s?.access_token)return;this.session={...(this.session||{}),...s};this.token=this.session.access_token;localStorage.setItem('baekeok_auth',JSON.stringify(this.session))}};
let authRefreshPromise=null;
async function refreshAuth(){if(authRefreshPromise)return authRefreshPromise;Auth.load();const rt=Auth.session?.refresh_token;if(!rt)return null;authRefreshPromise=(async()=>{try{const r=await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:CONFIG.SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:rt})});if(!r.ok)return null;const s=await r.json();Auth.save(s);return Auth.token}catch(_){return null}finally{authRefreshPromise=null}})();return authRefreshPromise}
async function rpc(fn,args={}){Auth.load();const call=async token=>{try{return await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/${fn}`,{method:'POST',headers:{apikey:CONFIG.SUPABASE_ANON_KEY,Authorization:`Bearer ${token||CONFIG.SUPABASE_ANON_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(args)})}catch(e){if(!(e instanceof TypeError))throw e;await new Promise(r=>setTimeout(r,220));return fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/${fn}`,{method:'POST',headers:{apikey:CONFIG.SUPABASE_ANON_KEY,Authorization:`Bearer ${token||CONFIG.SUPABASE_ANON_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(args)})}};let r=await call(Auth.token);let t=await r.text();const authFail=r.status===401||r.status===403||/JWT|NOT_AUTHORIZED|invalid claim|expired/i.test(t);if(authFail){const fresh=await refreshAuth();if(fresh){r=await call(fresh);t=await r.text()}}if(!r.ok)throw new Error(`RPC ${fn} ${r.status}: ${t||r.statusText}`);return t?JSON.parse(t):null}
const el=id=>document.getElementById(id),p2=n=>String(n).padStart(2,'0');
function parseWall(v){if(v instanceof Date)return v;const s=String(v||'').trim();const m=s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);return m?new Date(+m[1],+m[2]-1,+m[3],+m[4],+m[5],+(m[6]||0)):new Date(NaN)}
function dayKey(d){return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`}
function hm(d){return d&&!isNaN(d)?`${p2(d.getHours())}:${p2(d.getMinutes())}`:'—'}
function dur(sec){if(sec==null||!isFinite(sec))return '—';const m=Math.max(0,Math.floor(sec/60)),h=Math.floor(m/60),mm=m%60;return h?`${h}시간 ${mm}분`:`${mm}분`}
function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function applyCorrections(events,corrections){const latest=new Map(),added=[];for(const c of corrections||[]){if(c.action==='ADD'){added.push(c);continue}if(c.event_id==null)continue;const prev=latest.get(String(c.event_id));const a=String(c.created_at||'')+String(c.id||''),b=prev?String(prev.created_at||'')+String(prev.id||''):'';if(!prev||a>b)latest.set(String(c.event_id),c)}const out=[];for(const e of events||[]){const c=latest.get(String(e.id));if(c?.action==='VOID')continue;out.push({...e,event_at:c?.new_event_at||e.event_at,event_type:c?.new_event_type||e.event_type,corrected:!!c})}for(const c of added){out.push({id:`add_${c.id}`,employee_id:c.employee_id,event_type:c.new_event_type,event_at:c.new_event_at,corrected:true,addedByAdmin:true})}return out}
function pairEvents(events){const by=new Map();for(const e of events||[]){if(!by.has(Number(e.employee_id)))by.set(Number(e.employee_id),[]);by.get(Number(e.employee_id)).push(e)}const sessions=[];for(const [employeeId,rows] of by){rows.sort((a,b)=>parseWall(a.event_at)-parseWall(b.event_at)||String(a.id).localeCompare(String(b.id)));let open=null;for(const e of rows){const d=parseWall(e.event_at);if(isNaN(d))continue;if(e.event_type==='IN'){if(open)sessions.push({employee_id:employeeId,status:'INCOMPLETE',in:open.d,out:null,inId:open.e.id,corrected:!!open.e.corrected});open={d,e}}else if(e.event_type==='OUT'){if(open){sessions.push({employee_id:employeeId,status:'COMPLETE',in:open.d,out:d,inId:open.e.id,outId:e.id,sec:Math.max(0,(d-open.d)/1000),corrected:!!open.e.corrected||!!e.corrected});open=null}else sessions.push({employee_id:employeeId,status:'ORPHAN_OUT',in:null,out:d,outId:e.id,corrected:!!e.corrected})}}if(open)sessions.push({employee_id:employeeId,status:'WORKING',in:open.d,out:null,inId:open.e.id,corrected:!!open.e.corrected})}return sessions.sort((a,b)=>(a.in||a.out)-(b.in||b.out))}
function monthShift(ym,delta){const [y,m]=ym.split('-').map(Number),d=new Date(y,m-1+delta,1);return `${d.getFullYear()}-${p2(d.getMonth()+1)}`}
function addDays(iso,n){const [y,m,d]=iso.split('-').map(Number),x=new Date(y,m-1,d+n);return dayKey(x)}
function monthBounds(ym){const [y,m]=ym.split('-').map(Number);const first=`${y}-${p2(m)}-01`,next=monthShift(ym,1)+'-01';return {first,next}}
function kstToday(){return new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Seoul'}))}
const S={ym:'',employees:[],sessions:[],selectedDay:null,storeHours:{open_minute:420,close_minute:1500}};
function sessionAnchor(s){return s.in||s.out}
function sessionsForDay(day){return S.sessions.filter(s=>{const a=sessionAnchor(s);return a&&dayKey(a)===day})}
function isIssue(s,day){if(s.status==='INCOMPLETE'||s.status==='ORPHAN_OUT')return true;if(s.status==='WORKING'&&day!==dayKey(kstToday()))return true;if(s.status==='COMPLETE'&&s.sec>16*3600)return true;return false}
async function loadMonth(){const app=el('app');app.innerHTML='<div class="loading">실근무 기록 불러오는 중…</div>';const {first,next}=monthBounds(S.ym);el('monthLabel').textContent=S.ym.replace('-','년 ')+'월';try{let employees=[];try{employees=await rpc('admin_list_all_employees')}catch(_){employees=await rpc('admin_list_employees')}let hours;try{hours=await rpc('admin_store_settings_get',{p_store_id:Number(sessionStorage.getItem('baekeok_store_id'))||1});if(hours)S.storeHours=hours}catch(_){}const data=await rpc('admin_events_with_corrections',{p_from:addDays(first,-7)+'T00:00:00',p_to:addDays(next,7)+'T00:00:00'});const storeId=Number(sessionStorage.getItem('baekeok_store_id'))||1;S.employees=(employees||[]).filter(e=>!e.store_id||Number(e.store_id)===storeId).sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ko-KR'));const allowedIds=new Set(S.employees.map(e=>Number(e.id)));S.sessions=pairEvents(applyCorrections(data?.events||[],data?.corrections||[])).filter(s=>allowedIds.has(Number(s.employee_id)));renderMonth()}catch(e){console.error('[actual-attendance]',e);const msg=String(e?.message||e);if(/401|JWT|NOT_AUTHORIZED/i.test(msg)){app.innerHTML='<div class="empty">관리자 세션을 다시 확인해주세요.<br><button id="retry">다시 시도</button></div>'}else{app.innerHTML=`<div class="empty">실근무 현황을 불러오지 못했습니다.<br><span style="font-size:.72rem;color:var(--text-muted)">${escapeHtml(msg.slice(0,160))}</span><br><button id="retry">다시 시도</button></div>`}el('retry').onclick=loadMonth}}
function renderMonth(){
  S.selectedDay=null;
  const [y,m]=S.ym.split('-').map(Number),days=new Date(y,m,0).getDate(),offset=new Date(y,m-1,1).getDay(),today=dayKey(kstToday());
  let html='<div class="weekhead"><div>일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div>토</div></div><div class="calendar">';
  for(let i=0;i<offset;i++)html+='<div class="day blank"></div>';
  for(let d=1;d<=days;d++){
    const day=`${S.ym}-${p2(d)}`,ss=sessionsForDay(day),issues=ss.filter(x=>isIssue(x,day));
    const hasComplete=ss.some(x=>x.status==='COMPLETE'&&!isIssue(x,day));
    const hasWorking=ss.some(x=>x.status==='WORKING'&&!isIssue(x,day));
    const employeeIds=[...new Set(ss.map(x=>Number(x.employee_id)))];
    const people=employeeIds.map(id=>{
      const emp=S.employees.find(e=>Number(e.id)===id),es=ss.filter(x=>Number(x.employee_id)===id);
      const status=es.some(x=>isIssue(x,day))?'issue':es.some(x=>x.status==='WORKING')?'working':'normal';
      return {name:emp?.name||'직원 정보 없음',status};
    });
    const shown=people.slice(0,2),more=Math.max(0,people.length-shown.length);
    const lines=shown.map(x=>`<div class="line employee-status-line"><i class="status-dot calendar-${x.status}" aria-hidden="true"></i><b>${escapeHtml(x.name)}</b></div>`).join('')+(more?`<div class="more">+${more}명</div>`:'');
    html+=`<button class="day${day===today?' today':''}" data-day="${day}"><span class="num">${d}</span>${lines?`<div class="lines">${lines}</div>`:''}</button>`;
  }
  html+='</div><div class="legend"><span><i class="dot normal"></i>근무 완료</span><span><i class="dot working"></i>근무 중</span><span><i class="dot issue"></i>확인 필요</span><span>날짜를 누르면 상세</span></div><button class="today-fab" id="monthTodayBtn" aria-label="오늘 날짜 강조">오늘</button>';
  el('app').innerHTML=html;
  document.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>renderDay(b.dataset.day));
  el('monthTodayBtn').onclick=()=>{const t=dayKey(kstToday()),ym=t.slice(0,7);if(ym!==S.ym){S.ym=ym;loadMonth()}else{document.querySelector('.day.today')?.focus();document.querySelector('.day.today')?.scrollIntoView({block:'center',behavior:'smooth'})}};
}
function toAxisHour(d,day){const [y,m,da]=day.split('-').map(Number),base=new Date(y,m-1,da,0,0,0);return (d-base)/3600000}
function renderDay(day){
  S.selectedDay=day;
  const ss=sessionsForDay(day),byEmp=new Map();
  for(const s of ss){if(!byEmp.has(s.employee_id))byEmp.set(s.employee_id,[]);byEmp.get(s.employee_id).push(s)}
  const entries=[...byEmp.entries()].sort((a,b)=>{
    const ea=S.employees.find(x=>Number(x.id)===Number(a[0])),eb=S.employees.find(x=>Number(x.id)===Number(b[0]));
    return String(ea?.name||'').localeCompare(String(eb?.name||''),'ko-KR')
  });
  const axisStart=(Number(S.storeHours?.open_minute??420)-60)/60,axisEnd=(Number(S.storeHours?.close_minute??1500)+60)/60,axisSpan=Math.max(1,axisEnd-axisStart),tickStep=axisSpan<=12?2:4;const ticks=[];for(let h=Math.ceil(axisStart/tickStep)*tickStep;h<axisEnd;h+=tickStep)ticks.push(h);if(!ticks.length||Math.abs(ticks[0]-axisStart)>.01)ticks.unshift(axisStart);if(Math.abs(ticks[ticks.length-1]-axisEnd)>.01)ticks.push(axisEnd);const labels=ticks.map(h=>`<span style="left:${Math.max(0,Math.min(100,(h-axisStart)/axisSpan*100))}%">${p2(Math.floor(h)%24)}:${p2(Math.round((h%1)*60))}</span>`).join('');
  let rows='';
  for(const [empId,list] of entries){
    const emp=S.employees.find(x=>Number(x.id)===Number(empId));let bars='';
    for(const s of list){
      const start=s.in||s.out,end=s.out||(day===dayKey(kstToday())?kstToday():new Date(...day.split('-').map((v,i)=>i===1?+v-1:+v),1,0,0));
      let a=toAxisHour(start,day),b=s.out?toAxisHour(end,day):(day===dayKey(kstToday())?toAxisHour(end,day):24);
      if(s.status==='ORPHAN_OUT')a=Math.max(0,b-.25);
      const left=Math.max(0,Math.min(100,(a-axisStart)/axisSpan*100)),right=Math.max(left+.5,Math.min(100,(b-axisStart)/axisSpan*100)),width=Math.max(.6,right-left),issue=isIssue(s,day);
      bars+=`<div class="bar${s.status==='WORKING'?' open':''}${issue?' issue':''}${s.corrected?' corrected':''}" style="left:${left}%;width:${width}%"><span class="bar-label">${s.status==='WORKING'?hm(s.in)+'–진행':s.status==='ORPHAN_OUT'?'퇴근 '+hm(s.out):hm(s.in)+'–'+hm(s.out)}</span></div>`
    }
    rows+=`<div class="person-row"><div class="person">${escapeHtml(emp?.name||'직원 정보 없음')}</div><div class="track">${bars}</div></div>`
  }
  let detail='';
  for(const s of ss){
    const emp=S.employees.find(x=>Number(x.id)===Number(s.employee_id)),issue=isIssue(s,day),
      label=s.status==='COMPLETE'?`${hm(s.in)}–${hm(s.out)} · ${dur(s.sec)}`:s.status==='WORKING'?`${hm(s.in)}–진행 중`:s.status==='INCOMPLETE'?`${hm(s.in)}–퇴근 누락`:`출근 누락–${hm(s.out)}`;
    detail+=`<div class="session"><div><b>${escapeHtml(emp?.name||'직원 정보 없음')}</b><div class="meta">${label}</div></div><div>${s.corrected?'<span class="pill">정정</span> ':''}${issue?'<span class="pill warn">확인 필요</span>':''}</div></div>`
  }
  el('app').innerHTML=`<section class="dayview"><div class="dayhead"><span class="dayhead-spacer" aria-hidden="true"></span><div class="date">${day}</div><button class="day-close" id="dayClose" aria-label="월력으로 돌아가기">×</button></div><section class="timeline-group"><h3>직원별 실근무 시간</h3><div class="axis-wrap"><div class="axis"><div class="axis-labels">${labels}</div>${rows||'<div class="empty">이 날의 실제 출퇴근 기록이 없습니다.</div>'}</div></div></section><section class="records-group"><h3>근무 기록 및 정정</h3><div class="sessions">${detail}</div><p class="records-note">정정은 원본 출퇴근 기록을 변경하지 않고 정정 이력을 추가합니다.</p></section></section>`;
  el('dayClose').onclick=renderMonth;
}
function init(){Auth.load();if(!Auth.token&&!Auth.session?.refresh_token){location.href='index.html#admin';return}const t=kstToday();S.ym=`${t.getFullYear()}-${p2(t.getMonth()+1)}`;el('back').onclick=()=>location.href='index.html#admin';el('prevMonth').onclick=()=>{S.ym=monthShift(S.ym,-1);loadMonth()};el('nextMonth').onclick=()=>{S.ym=monthShift(S.ym,1);loadMonth()};el('monthLabel').onclick=()=>{const t=kstToday();S.ym=`${t.getFullYear()}-${p2(t.getMonth()+1)}`;loadMonth()};loadMonth()}
init();

/* Canonical actual-attendance modules: loaded in one owned runtime, not as HTML patch chain. */

/* integrated from actual_attendance_day_slices_v1.js */
/* Actual attendance V1.4: expand sessions crossing midnight into date-by-date display slices.
   Display-only derivation: source event ids/timestamps remain authoritative and raw attendance is never rewritten. */
(()=>{
  if(window.__baekeokActualAttendanceDaySlicesV1)return;
  window.__baekeokActualAttendanceDaySlicesV1=true;

  const sourceSessionsForDay=sessionsForDay;
  const sourceRenderDay=renderDay;
  const startOfDay=day=>{const [y,m,d]=day.split('-').map(Number);return new Date(y,m-1,d,0,0,0,0)};
  const nextDayStart=day=>{const d=startOfDay(day);d.setDate(d.getDate()+1);return d};
  const previousMoment=d=>new Date(d.getTime()-1000);
  const cloneSlice=(s,day,start,end,startBoundary,endBoundary)=>({
    ...s,
    in:start,
    out:end,
    sec:start&&end?Math.max(0,(end-start)/1000):s.sec,
    sourceIn:s.sourceIn||s.in||null,
    sourceOut:s.sourceOut||s.out||null,
    sourceSec:s.sourceSec??s.sec??null,
    sliceDay:day,
    sliceStartBoundary:!!startBoundary,
    sliceEndBoundary:!!endBoundary,
    sliceDerived:!!(startBoundary||endBoundary)
  });

  sessionsForDay=function(day){
    const ds=startOfDay(day),de=nextDayStart(day),now=kstToday();
    const out=[];
    for(const s of S.sessions||[]){
      if(s.status==='ORPHAN_OUT'){
        if(s.out&&dayKey(s.out)===day)out.push(cloneSlice(s,day,null,s.out,false,false));
        continue;
      }
      if(!s.in)continue;
      if(s.status==='INCOMPLETE'){
        if(dayKey(s.in)===day)out.push(cloneSlice(s,day,s.in,null,false,false));
        continue;
      }
      const sourceEnd=s.out||(s.status==='WORKING'?now:null);
      if(!sourceEnd)continue;
      if(s.in>=de||sourceEnd<=ds)continue;
      const startsBefore=s.in<ds,endsAfter=sourceEnd>=de;
      const sliceStart=startsBefore?ds:s.in;
      // Use 23:59:59 for legacy renderers so a full-day slice does not display 00:00 as its end.
      // The detail wrapper below presents the exact semantic boundary as 24:00.
      const sliceEnd=endsAfter?previousMoment(de):sourceEnd;
      out.push(cloneSlice(s,day,sliceStart,sliceEnd,startsBefore,endsAfter));
    }
    return out.sort((a,b)=>(a.in||a.out)-(b.in||b.out));
  };

  function sliceTimeLabel(s){
    if(s.status==='ORPHAN_OUT')return `출근 누락–${hm(s.out)}`;
    const a=s.sliceStartBoundary?'00:00':hm(s.in);
    if(s.status==='WORKING'&&!s.sliceEndBoundary&&s.sliceDay===dayKey(kstToday()))return `${a}–진행 중`;
    if(!s.out)return `${a}–퇴근 누락`;
    const b=s.sliceEndBoundary?'24:00':hm(s.out);
    return `${a}–${b}`;
  }
  function sliceDuration(s){
    if(!s.in||!s.out)return '';
    let sec=s.sec||0;
    if(s.sliceEndBoundary)sec+=1; // compensate 23:59:59 display sentinel
    return dur(sec);
  }

  renderDay=function(day){
    sourceRenderDay(day);
    const ss=sessionsForDay(day);
    const details=document.querySelectorAll('.sessions .session');
    details.forEach((row,i)=>{
      const s=ss[i];if(!s)return;
      const meta=row.querySelector('.meta');if(meta){const d=sliceDuration(s);meta.textContent=sliceTimeLabel(s)+(d?` · ${d}`:'')}
      if(s.sliceDerived)row.classList.add('day-slice-derived');
    });

    const byEmp=new Map();
    for(const s of ss){if(!byEmp.has(Number(s.employee_id)))byEmp.set(Number(s.employee_id),[]);byEmp.get(Number(s.employee_id)).push(s)}
    document.querySelectorAll('.person-row').forEach(row=>{
      const name=row.querySelector('.person')?.textContent||'';
      const emp=S.employees.find(x=>String(x.name||'')===name);
      if(!emp)return;
      const list=byEmp.get(Number(emp.id))||[];
      row.querySelectorAll('.bar-label').forEach((label,i)=>{if(list[i])label.textContent=sliceTimeLabel(list[i]).replace(' 중','')});
    });

  };

  window.actualAttendanceSourceSession=s=>s?({...s,in:s.sourceIn??s.in,out:s.sourceOut??s.out,sec:s.sourceSec??s.sec}):s;
})();


/* integrated from actual_attendance_correction.js */
/* Actual attendance V1.1: correction overlay from effective session. Raw attendance remains immutable. */
(()=>{
  const originalRenderDay=renderDay;
  const dtValue=d=>d&&!isNaN(d)?`${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`:'';
  const wallValue=v=>String(v||'').replace('T',' ').slice(0,16)+':00';
  function closeCorrection(){document.getElementById('actualCorrectionVeil')?.remove()}
  function toastCorrection(msg,err=false){const t=el('toast');t.textContent=msg;t.className='toast show'+(err?' err':'');clearTimeout(toastCorrection.t);toastCorrection.t=setTimeout(()=>t.className='toast',2200)}
  function openCorrection(day,s){
    closeCorrection();
    // A multi-day display slice is derived UI only. Corrections always target the authoritative
    // source session endpoints/event ids so selecting a middle date can never rewrite an event to 00:00/24:00 by accident.
    const source=window.actualAttendanceSourceSession?window.actualAttendanceSourceSession(s):s;
    const emp=S.employees.find(x=>Number(x.id)===Number(source.employee_id));
    const veil=document.createElement('div');veil.id='actualCorrectionVeil';veil.className='correction-veil';
    veil.innerHTML=`<div class="correction-modal" role="dialog" aria-modal="true" aria-label="근태 정정">
      <div class="correction-head"><div><b>${escapeHtml(emp?.name||'직원')} · 근태 정정</b><div>${day}</div></div><button id="correctionClose" aria-label="닫기">×</button></div>
      <div class="correction-note">원본 출퇴근 기록은 변경하지 않고 정정 이력을 추가합니다.${s.sliceDerived?' 날짜별 표시는 자정을 기준으로 나눈 보기이며 아래 입력값은 원본 세션 전체의 출퇴근 시각입니다.':''}</div>
      <label>출근</label><input id="correctionIn" type="datetime-local" value="${dtValue(source.in)}">
      <label>퇴근</label><input id="correctionOut" type="datetime-local" value="${dtValue(source.out)}">
      <label>정정 사유 <span>(필수)</span></label><input id="correctionReason" type="text" maxlength="120" placeholder="예: 마감 후 퇴근 누락">
      <div id="correctionPreview" class="correction-preview"></div>
      <button id="correctionSave" class="correction-save">정정 저장</button>
    </div>`;
    document.body.appendChild(veil);
    const inEl=el('correctionIn'),outEl=el('correctionOut'),save=el('correctionSave'),preview=el('correctionPreview');
    const refresh=()=>{const a=inEl.value?parseWall(wallValue(inEl.value)):null,b=outEl.value?parseWall(wallValue(outEl.value)):null;if(a&&b&&b<=a){preview.textContent='퇴근 시각은 출근 시각보다 늦어야 합니다.';preview.classList.add('bad');save.disabled=true}else{preview.textContent=a&&b?`예상 근무 ${dur((b-a)/1000)}`:'누락된 출근 또는 퇴근을 추가할 수 있습니다.';preview.classList.remove('bad');save.disabled=false}};
    inEl.oninput=refresh;outEl.oninput=refresh;refresh();
    el('correctionClose').onclick=closeCorrection;veil.onclick=e=>{if(e.target===veil)closeCorrection()};
    save.onclick=async()=>{
      const reason=el('correctionReason').value.trim();if(!reason)return toastCorrection('정정 사유를 입력하세요.',true);
      const nextIn=inEl.value?wallValue(inEl.value):null,nextOut=outEl.value?wallValue(outEl.value):null;
      if(!nextIn&&!nextOut)return toastCorrection('출근 또는 퇴근 시각을 입력하세요.',true);
      const a=nextIn?parseWall(nextIn):null,b=nextOut?parseWall(nextOut):null;if(a&&b&&b<=a)return toastCorrection('퇴근 시각을 확인하세요.',true);
      const calls=[];
      if(source.inId&&nextIn&&dtValue(source.in)!==inEl.value)calls.push({p_action:'EDIT_TIME',p_event_id:Number(source.inId),p_employee_id:Number(source.employee_id),p_new_at:nextIn,p_new_type:'IN',p_reason:reason});
      if(!source.inId&&nextIn)calls.push({p_action:'ADD',p_event_id:null,p_employee_id:Number(source.employee_id),p_new_at:nextIn,p_new_type:'IN',p_reason:reason});
      if(source.outId&&nextOut&&dtValue(source.out)!==outEl.value)calls.push({p_action:'EDIT_TIME',p_event_id:Number(source.outId),p_employee_id:Number(source.employee_id),p_new_at:nextOut,p_new_type:'OUT',p_reason:reason});
      if(!source.outId&&nextOut)calls.push({p_action:'ADD',p_event_id:null,p_employee_id:Number(source.employee_id),p_new_at:nextOut,p_new_type:'OUT',p_reason:reason});
      if(!calls.length)return toastCorrection('변경된 시각이 없습니다.',true);
      save.disabled=true;
      try{for(const args of calls)await rpc('admin_correct_event',args);closeCorrection();toastCorrection('근태 정정을 반영했습니다.');await loadMonth();renderDay(day)}catch(e){console.error('[actual-correction]',e);toastCorrection('정정을 저장하지 못했습니다.',true);save.disabled=false}
    };
  }
  renderDay=function(day){
    originalRenderDay(day);
    const ss=sessionsForDay(day);
    document.querySelectorAll('.sessions .session').forEach((row,i)=>{const s=ss[i];if(!s)return;const actions=document.createElement('div');actions.className='session-actions';actions.innerHTML='<button type="button" class="session-fix">정정</button>';actions.querySelector('button').onclick=()=>openCorrection(day,s);row.appendChild(actions)});
  };
})();

/* integrated from actual_attendance_anomaly_v1.js */
/* Actual attendance V1.2: explain anomaly reasons without mutating raw attendance. */
(()=>{
  const LONG_SESSION_SEC=16*3600;
  window.actualAttendanceIssueReason=function(s,day){
    if(!s)return '';
    if(s.status==='ORPHAN_OUT')return '출근 누락';
    if(s.status==='INCOMPLETE')return '퇴근 누락';
    if(s.status==='WORKING'){
      const today=dayKey(kstToday());
      if(day!==today)return '과거 미퇴근';
      if(s.in&&((kstToday()-s.in)/1000)>LONG_SESSION_SEC)return '16시간 초과 · 미퇴근';
      return '';
    }
    if(s.status==='COMPLETE'&&s.sec>LONG_SESSION_SEC)return '16시간 초과';
    return '';
  };

  isIssue=function(s,day){return !!window.actualAttendanceIssueReason(s,day)};

  const previousRenderMonth=renderMonth;
  renderMonth=function(){
    previousRenderMonth();
    document.querySelectorAll('[data-day]').forEach(btn=>{
      const day=btn.dataset.day;
      const reasons=sessionsForDay(day).map(s=>window.actualAttendanceIssueReason(s,day)).filter(Boolean);
      if(reasons.length){
        btn.setAttribute('aria-label',`${day} 확인 필요 ${reasons.length}건: ${[...new Set(reasons)].join(', ')}`);
        btn.title=`확인 필요 ${reasons.length}건 · ${[...new Set(reasons)].join(' · ')}`;
      }
    });
  };

  const previousRenderDay=renderDay;
  renderDay=function(day){
    previousRenderDay(day);
    const ss=sessionsForDay(day);
    document.querySelectorAll('.sessions .session').forEach((row,i)=>{
      const reason=window.actualAttendanceIssueReason(ss[i],day);
      if(!reason)return;
      const badge=row.querySelector('.pill.warn');
      if(badge){badge.textContent=reason;badge.setAttribute('aria-label',`확인 필요: ${reason}`)}
      row.classList.add('needs-review');
    });
  };
})();

/* integrated from actual_attendance_anomaly_correction_v1.js */
/* Actual attendance V1.3: anomaly-first correction affordance + historical identity clarity. */
(()=>{
  let allEmployeesPromise=null;
  const getAllEmployees=()=>allEmployeesPromise||(allEmployeesPromise=rpc('admin_list_employees').catch(()=>[]));
  async function patchIdentity(day){
    const all=await getAllEmployees();
    const map=new Map((all||[]).map(e=>[Number(e.id),e]));
    document.querySelectorAll('.person,.calendar .line b').forEach(node=>{
      const m=(node.textContent||'').trim().match(/^#(\d+)$/);if(!m)return;
      const emp=map.get(Number(m[1]));if(emp?.name)node.textContent=emp.name;
    });
    if(day){
      const ss=sessionsForDay(day);
      document.querySelectorAll('.sessions .session').forEach((row,i)=>{
        const b=row.querySelector('b'),emp=map.get(Number(ss[i]?.employee_id));
        if(b&&emp?.name&&!b.textContent.trim())b.textContent=emp.name;
      });
    }
  }
  const previousRenderDay=renderDay;
  renderDay=function(day){
    previousRenderDay(day);
    const ss=sessionsForDay(day);
    const axis=document.querySelector('.axis-wrap');
    if(axis&&!document.querySelector('.timeline-legend')){
      const legend=document.createElement('div');
      legend.className='timeline-legend';
      legend.style.cssText='display:flex;gap:12px;flex-wrap:wrap;padding:10px 12px 0;font-size:.7rem;color:#66717e';
      legend.innerHTML='<span>🟢 정상 완료</span><span>🔵 근무 중</span><span>🟤 확인 필요</span>';
      axis.before(legend);
    }
    document.querySelectorAll('.sessions .session').forEach((row,i)=>{
      const s=ss[i];
      const reason=window.actualAttendanceIssueReason?.(s,day)||'';
      if(!reason)return;
      const button=row.querySelector('.session-fix');
      if(!button)return;
      button.textContent='바로 정정';
      button.classList.add('urgent');
      button.setAttribute('aria-label',`${reason}: 바로 정정`);
      const hint=document.createElement('div');
      hint.className='session-fix-hint';
      hint.textContent=`${reason} · 확인 후 정정하세요.`;
      row.querySelector('.session-actions')?.prepend(hint);
    });
    patchIdentity(day);
  };
  const previousRenderMonth=renderMonth;
  renderMonth=function(){previousRenderMonth();patchIdentity(null)};
})();


/* integrated from actual_attendance_identity_v2.js */
/* Actual attendance identity V2: preserve names for inactive historical staff and show employee No. consistently. */
(()=>{
  if(window.__baekeokActualIdentityV2)return;
  window.__baekeokActualIdentityV2=true;
  const no=id=>`No. ${String(Number(id)||0).padStart(2,'0')}`;
  let allPromise=null;
  const all=()=>allPromise||(allPromise=rpc('admin_list_employees').then(rows=>{const sid=Number(sessionStorage.getItem('baekeok_store_id'))||1;return (rows||[]).filter(e=>!e.store_id||Number(e.store_id)===sid)}).catch(()=>[]));
  function installStyle(){if(document.getElementById('actualIdentityStyle'))return;const s=document.createElement('style');s.id='actualIdentityStyle';s.textContent=`.employee-no-sub{display:block;margin-top:2px;font-size:.62rem;line-height:1.1;color:var(--muted);font-weight:500;font-variant-numeric:tabular-nums}.employee-no-inline{font-size:.58rem;color:var(--muted);font-weight:500;margin-left:4px;font-variant-numeric:tabular-nums}.timeline-legend{display:flex;gap:12px;flex-wrap:wrap;padding:10px 12px 0;font-size:.7rem;color:var(--sub)}.timeline-legend span{display:inline-flex;align-items:center;gap:5px}.bar-key{width:18px;height:8px;border-radius:999px;display:inline-block}.bar-key.normal{background:var(--ok)}.bar-key.working{background:var(--brand)}.bar-key.issue{background:var(--warn)}`;document.head.appendChild(s)}
  async function employeeMap(){const rows=await all();return new Map((rows||[]).map(e=>[Number(e.id),e]))}
  async function patchMonth(){installStyle();const map=await employeeMap();document.querySelectorAll('.calendar .line').forEach(line=>{const b=line.querySelector('b');if(!b)return;let id=null;const m=(b.textContent||'').trim().match(/^#(\d+)$/);if(m)id=Number(m[1]);if(id==null){const s=(line.textContent||'').trim();const emp=[...map.values()].find(e=>s.startsWith(String(e.name||'')));if(emp)id=Number(emp.id)}const e=map.get(id);if(!e)return;b.textContent=e.name;line.querySelector('.employee-no-inline')?.remove()})}
  async function patchDay(day){installStyle();const map=await employeeMap();const ss=sessionsForDay(day);
    document.querySelectorAll('.person-row').forEach(row=>{const p=row.querySelector('.person');if(!p)return;let id=null;const raw=(p.textContent||'').trim();const m=raw.match(/^#(\d+)$/);if(m)id=Number(m[1]);if(id==null){const e=[...map.values()].find(x=>String(x.name||'')===raw);if(e)id=Number(e.id)}const e=map.get(id);if(!e)return;p.innerHTML=`<span>${e.name}</span><small class="employee-no-sub">${no(e.id)}</small>`});
    document.querySelectorAll('.sessions .session').forEach((row,i)=>{const e=map.get(Number(ss[i]?.employee_id));const b=row.querySelector('b');if(!e||!b)return;b.innerHTML=`<span>${e.name}</span><small class="employee-no-sub">${no(e.id)}</small>`});
    const dayview=document.querySelector('.dayview');if(dayview&&!dayview.querySelector('.timeline-legend')){const l=document.createElement('div');l.className='timeline-legend';l.innerHTML='<span><i class="bar-key normal"></i>정상 완료</span><span><i class="bar-key working"></i>근무 중</span><span><i class="bar-key issue"></i>확인 필요</span>';dayview.querySelector('.axis-wrap')?.before(l)}
  }
  const m=renderMonth;renderMonth=function(){m();patchMonth()};
  const d=renderDay;renderDay=function(day){d(day);patchDay(day)};
})();

/* integrated from actual_attendance_entry_mode_v1.js */
/* Senior IA: canonical daily/monthly schedule entries show actual attendance. */
(()=>{
  if(globalThis.__baekeokActualAttendanceEntryModeV1)return;
  globalThis.__baekeokActualAttendanceEntryModeV1=true;
  const params=new URLSearchParams(location.search);
  const mode=params.get('view');
  if(mode==='day'){
    const today=dayKey(kstToday());
    const baseRenderMonth=renderMonth;
    let enterDay=true;
    renderMonth=function(){
      baseRenderMonth();
      if(!enterDay)return;
      enterDay=false;
      queueMicrotask(()=>renderDay(today));
    };
  }
})();

