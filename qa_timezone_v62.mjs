// WorkSchedule v62 timezone regression QA
// Run: node qa_timezone_v62.mjs

import assert from 'node:assert/strict';

function parseNoZoneWall(s){
  const m=String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
  if(!m) return null;
  return { y:+m[1], mo:+m[2], d:+m[3], h:+m[4], mi:+m[5], s:m[6]?+m[6]:0 };
}

function pad(n){ return String(n).padStart(2,'0'); }
function fmtUtcParts(ms){
  const d=new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth()+1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

// Mirrors SQL: (raw_event_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Seoul'
function rawUtcWallToKstWall(s){
  const p=parseNoZoneWall(s); if(!p) throw new Error('BAD_RAW_TS');
  return fmtUtcParts(Date.UTC(p.y,p.mo-1,p.d,p.h,p.mi,p.s)+9*3600_000);
}

// Mirrors SQL range conversion: (KST wall AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'UTC'
function kstWallToUtcWall(s){
  const p=parseNoZoneWall(s); if(!p) throw new Error('BAD_KST_TS');
  return fmtUtcParts(Date.UTC(p.y,p.mo-1,p.d,p.h,p.mi,p.s)-9*3600_000);
}

function fromAppIso(s){
  const str=String(s).trim();
  if(/[zZ]$|[+\-]\d{2}:?\d{2}$/.test(str)) return new Date(str);
  const p=parseNoZoneWall(str); if(!p) return new Date(NaN);
  return new Date(p.y,p.mo-1,p.d,p.h,p.mi,p.s,0);
}

function hhmm(d){ return `${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function startOfLocalDay(d){ return new Date(d.getFullYear(),d.getMonth(),d.getDate()); }
function openTodaySeconds(openInAt,now){
  const from=Math.max(openInAt.getTime(),startOfLocalDay(now).getTime());
  return Math.max(0,(now.getTime()-from)/1000);
}
function plannedMinutes(start,end){
  const toMin=t=>{const[h,m]=t.split(':').map(Number); return h*60+m;};
  if(start===end) throw new Error('ZERO_DURATION');
  let n=toMin(end)-toMin(start); if(end<start)n+=1440; return n;
}
function progressPct(actualSeconds,start,end){ return Math.max(0,actualSeconds/(plannedMinutes(start,end)*60)*100); }
function operationalPunchState(openInAt){ return openInAt?'WORKING':'OFF'; }
function completedSeconds(sessions){ return sessions.filter(x=>x.status==='COMPLETE').reduce((a,x)=>a+Math.max(0,x.sec||0),0); }
function applyCorrections(events,corrections){
  const by={}; const added=[];
  for(const c of corrections||[]){
    if(c.action==='ADD'){added.push(c);continue;}
    if(c.event_id!=null){const prev=by[c.event_id]; if(!prev||new Date(c.created_at)>new Date(prev.created_at))by[c.event_id]=c;}
  }
  const out=[];
  for(const e of events||[]){
    const c=by[e.id]; if(c){
      if(c.action==='VOID')continue;
      out.push({...e,event_type:c.action==='EDIT_TYPE'&&c.new_event_type?c.new_event_type:e.event_type,event_at:c.action==='EDIT_TIME'&&c.new_event_at?c.new_event_at:e.event_at,corrected:true});
    }else out.push({...e});
  }
  for(const c of added)out.push({id:`add_${c.id}`,employee_id:c.employee_id,event_type:c.new_event_type,event_at:c.new_event_at,corrected:true});
  return out;
}

const tests=[
  ['+09 timestamp is 11:05 KST instant',()=>assert.equal(new Date('2026-09-08T11:05:00+09:00').toISOString(),'2026-09-08T02:05:00.000Z')],
  ['same instant UTC Z',()=>assert.equal(new Date('2026-09-08T02:05:00Z').getTime(),new Date('2026-09-08T11:05:00+09:00').getTime())],
  ['actual Supabase raw format 02:05 -> KST 11:05',()=>assert.equal(rawUtcWallToKstWall('2026-09-08 02:05:40.714062'),'2026-09-08T11:05:40')],
  ['KST day start query -> previous UTC 15:00',()=>assert.equal(kstWallToUtcWall('2026-09-08T00:00:00'),'2026-09-07T15:00:00')],
  ['timezone-less correction remains KST wall',()=>assert.equal(hhmm(fromAppIso('2026-09-08T11:05:00')),'11:05')],
  ['normalized today IN displays 11:05',()=>assert.equal(hhmm(fromAppIso(rawUtcWallToKstWall('2026-09-08 02:05:00.000000'))),'11:05')],
  ['11:05 IN immediately has ~0 duration',()=>{
    const open=fromAppIso('2026-09-08T11:05:00'); const now=new Date(2026,8,8,11,5,10);
    assert.equal(openTodaySeconds(open,now),10);
  }],
  ['11:00 schedule / 11:05 IN is not 9h',()=>{
    const open=fromAppIso('2026-09-08T11:05:00'); const now=new Date(2026,8,8,11,5,10);
    const sec=openTodaySeconds(open,now); assert(sec<60); assert(progressPct(sec,'11:00','12:00')<2);
  }],
  ['previous-day 22:00 IN clipped at today 00:00',()=>{
    const open=new Date(2026,8,7,22,0,0), now=new Date(2026,8,8,3,0,0); assert.equal(openTodaySeconds(open,now),3*3600);
  }],
  ['overnight 22-06 = 480m',()=>assert.equal(plannedMinutes('22:00','06:00'),480)],
  ['correction effective timestamp stays local',()=>{
    const eff=applyCorrections([{id:1,event_type:'IN',event_at:'2026-09-08T11:05:00'}],[{id:7,event_id:1,action:'EDIT_TIME',new_event_at:'2026-09-08T11:15:00',created_at:'2026-09-08T12:00:00Z'}]);
    assert.equal(hhmm(fromAppIso(eff[0].event_at)),'11:15');
  }],
  ['multiple sessions sum preserved',()=>assert.equal(completedSeconds([{status:'COMPLETE',sec:3600},{status:'COMPLETE',sec:1800},{status:'WORKING',sec:999}]),5400)],
  ['100% progress preserved',()=>assert.equal(progressPct(3600,'11:00','12:00'),100)],
  ['Operational Punch State remains WORKING',()=>assert.equal(operationalPunchState(fromAppIso('2026-09-07T22:00:00')),'WORKING')],
];

let pass=0;
for(const [name,fn] of tests){
  try{fn();pass++;console.log(`PASS ${name}`);}catch(e){console.error(`FAIL ${name}: ${e.message}`);process.exitCode=1;}
}
console.log(`Timezone v62 QA: ${pass}/${tests.length} PASS`);
if(pass!==tests.length)process.exitCode=1;
