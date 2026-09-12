const CONFIG={SUPABASE_URL:"https://waluhdgqhwjjwmflhrle.supabase.co",SUPABASE_ANON_KEY:"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzIiwicmVmIjoid2FsdWhkZ3Fod2pqd21mbGhybGUiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTc4NzYxODg2MCwiZXhwIjoyMTAzMTk0ODYwfQ.-UugGE05V70Ecw__UdIZpWJr2mDYmLfV7mh_lR-U9Mw"};
const Auth={token:null,load(){try{this.token=JSON.parse(localStorage.getItem('baekeok_auth'))?.access_token||null}catch(_){this.token=null}return this.token}};
async function rpc(fn,args={}){const r=await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/${fn}`,{method:'POST',headers:{apikey:CONFIG.SUPABASE_ANON_KEY,Authorization:`Bearer ${Auth.token||CONFIG.SUPABASE_ANON_KEY}`,'Content-Type':'application/json'},body:JSON.stringify(args)});const t=await r.text();if(!r.ok)throw Error(t||`HTTP ${r.status}`);return t?JSON.parse(t):null}
const $=id=>document.getElementById(id),pad=n=>String(n).padStart(2,'0');
function kstNow(){return new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Seoul'}))}
function ymd(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
function monthKey(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}`}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function applyCorrections(events,corrections){
  const latest=new Map(),added=[];
  for(const c of corrections||[]){
    if(c.action==='ADD'){added.push(c);continue}
    if(c.event_id==null)continue;
    const prev=latest.get(c.event_id);
    if(!prev||String(c.created_at)>String(prev.created_at))latest.set(c.event_id,c);
  }
  const out=[];
  for(const e of events||[]){
    const c=latest.get(e.id);if(c?.action==='VOID')continue;
    out.push({...e,event_type:c?.action==='EDIT_TYPE'&&c.new_event_type?c.new_event_type:e.event_type,event_at:c?.action==='EDIT_TIME'&&c.new_event_at?c.new_event_at:e.event_at,corrected:!!c});
  }
  for(const c of added)out.push({id:`add_${c.id}`,employee_id:c.employee_id,event_type:c.new_event_type,event_at:c.new_event_at,corrected:true});
  return out.sort((a,b)=>Number(a.employee_id)-Number(b.employee_id)||String(a.event_at).localeCompare(String(b.event_at)));
}
function durationMinutes(a,b){if(!a||!b)return null;return Math.max(0,Math.round((new Date(b).getTime()-new Date(a).getTime())/60000))}
function pairEvents(events,today){
  const by=new Map();for(const e of events){const id=Number(e.employee_id);if(!by.has(id))by.set(id,[]);by.get(id).push(e)}
  const sessions=[];
  for(const [employeeId,rows] of by){
    rows.sort((a,b)=>String(a.event_at).localeCompare(String(b.event_at)));let open=null;
    for(const e of rows){
      if(e.event_type==='IN'){
        if(open)sessions.push({employeeId,start:open.event_at,end:null,status:'ISSUE',reason:'퇴근누락'});
        open=e;
      }else if(e.event_type==='OUT'){
        if(!open){sessions.push({employeeId,start:e.event_at,end:e.event_at,status:'ISSUE',reason:'출근누락'});continue}
        const min=durationMinutes(open.event_at,e.event_at);
        sessions.push({employeeId,start:open.event_at,end:e.event_at,status:min>16*60?'ISSUE':'COMPLETE',reason:min>16*60?'장시간 근무':null,minutes:min});open=null;
      }
    }
    if(open){const wd=String(open.event_at).slice(0,10);sessions.push({employeeId,start:open.event_at,end:null,status:wd===today?'OPEN':'ISSUE',reason:wd===today?'근무중':'퇴근누락'});}
  }
  return sessions.sort((a,b)=>String(a.start).localeCompare(String(b.start))||a.employeeId-b.employeeId);
}
function boundsForMonth(month){const [y,m]=month.split('-').map(Number),from=new Date(y,m-2,28),to=new Date(y,m+1,2);return {from:`${ymd(from)}T00:00:00`,to:`${ymd(to)}T00:00:00`}}
function dayMinute(iso,baseDay){if(!iso)return null;const day=String(iso).slice(0,10),hh=Number(String(iso).slice(11,13)),mm=Number(String(iso).slice(14,16));const base=new Date(`${baseDay}T00:00:00`),d=new Date(`${day}T00:00:00`);return Math.round((d-base)/86400000)*1440+hh*60+mm}
window.__attendanceStatusV1={applyCorrections,pairEvents,durationMinutes,dayMinute};

const S={month:monthKey(kstNow()),employees:[],sessions:[],selectedDay:null};
function employeeName(id){return S.employees.find(e=>Number(e.id)===Number(id))?.name||`직원 ${id}`}
async function loadMonth(){
  $('loading').hidden=false;$('loading').textContent='불러오는 중…';$('monthCard').hidden=true;$('dayCard').hidden=true;
  const b=boundsForMonth(S.month);
  try{
    const [emps,data]=await Promise.all([rpc('admin_list_employees'),rpc('admin_events_with_corrections',{p_from:b.from,p_to:b.to})]);
    S.employees=(emps||[]).filter(e=>e.is_active!==false&&e.active!==false);
    const effective=applyCorrections(data?.events||[],data?.corrections||[]);
    S.sessions=pairEvents(effective,ymd(kstNow()));
    $('loading').hidden=true;$('monthCard').hidden=false;renderMonth();
  }catch(e){console.error('[attendance-status]',e);$('loading').textContent='실근무 현황을 불러오지 못했습니다. 관리자 로그인 상태와 네트워크를 확인해주세요.'}
}
function renderMonth(){
  $('monthTitle').textContent=S.month.replace('-','년 ')+'월';
  const [y,m]=S.month.split('-').map(Number),first=new Date(y,m-1,1),last=new Date(y,m,0),today=ymd(kstNow());
  let html=['일','월','화','수','목','금','토'].map(x=>`<div class="dow">${x}</div>`).join('');
  for(let i=0;i<first.getDay();i++)html+='<div class="day empty"></div>';
  for(let d=1;d<=last.getDate();d++){
    const date=`${y}-${pad(m)}-${pad(d)}`,rows=S.sessions.filter(s=>String(s.start).slice(0,10)===date);
    const visible=rows.slice(0,3).map(s=>{const cls=s.status==='OPEN'?' open':s.status==='ISSUE'?' issue':'';const end=s.end?String(s.end).slice(11,16):(s.status==='OPEN'?'근무중':'미퇴근');return `<span class="shift${cls}">${esc(employeeName(s.employeeId))} ${String(s.start).slice(11,16)}–${end}</span>`}).join('');
    html+=`<button class="day${date===today?' today':''}" data-day="${date}"><span class="num">${d}</span>${visible}${rows.length>3?`<span class="more">+${rows.length-3}건</span>`:''}</button>`;
  }
  $('calendar').innerHTML=html;
  $('calendar').querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>showDay(b.dataset.day));
}
function showDay(date){S.selectedDay=date;$('monthCard').hidden=true;$('dayCard').hidden=false;$('dayTitle').textContent=date.replaceAll('-','.');renderDay(date)}
function renderDay(date){
  const rows=S.sessions.filter(s=>String(s.start).slice(0,10)===date);
  const startMin=7*60,endMin=25*60,span=endMin-startMin;
  let html='<div class="ticks">';for(let h=7;h<=25;h+=3){html+=`<span class="tick" style="left:${((h*60-startMin)/span)*100}%">${pad(h)}</span>`}html+='</div>';
  if(!rows.length){$('timeline').innerHTML=html+'<div class="empty-state">이 날짜의 실근무 기록이 없습니다.</div>';return}
  const now=kstNow(),today=ymd(now);
  for(const s of rows){
    let a=dayMinute(s.start,date),b=s.end?dayMinute(s.end,date):null;
    if(b==null){b=date===today?now.getHours()*60+now.getMinutes():endMin}
    const left=Math.max(0,Math.min(100,((a-startMin)/span)*100)),right=Math.max(0,Math.min(100,((b-startMin)/span)*100));
    const width=Math.max(.6,right-left),cls=s.status==='OPEN'?' open':s.status==='ISSUE'?' issue':'';
    const label=s.end?`${String(s.start).slice(11,16)}–${String(s.end).slice(11,16)}`:`${String(s.start).slice(11,16)}–${s.status==='OPEN'?'근무중':'미퇴근'}`;
    html+=`<div class="row"><div><div class="emp">${esc(employeeName(s.employeeId))}</div><div class="time">${label}${s.reason?` · ${esc(s.reason)}`:''}</div></div><div class="track"><span class="bar${cls}" style="left:${left}%;width:${width}%" title="${esc(label)}"></span></div></div>`;
  }
  $('timeline').innerHTML=html;
}
function shiftMonth(n){const [y,m]=S.month.split('-').map(Number),d=new Date(y,m-1+n,1);S.month=monthKey(d);S.selectedDay=null;loadMonth()}
async function init(){
  Auth.load();if(!Auth.token){location.href='index.html#admin';return}
  $('back').onclick=()=>location.href='index.html#admin';$('prev').onclick=()=>shiftMonth(-1);$('next').onclick=()=>shiftMonth(1);$('backMonth').onclick=()=>{$('dayCard').hidden=true;$('monthCard').hidden=false};
  await loadMonth();
}
init();
