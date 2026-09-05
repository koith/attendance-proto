// B-1 regression: fromIso/pairEvents/applyCorrections 발췌 테스트
// (index.html의 함수를 그대로 복제해 검증)
function fromIso(s){
  if(s instanceof Date) return s;
  if(s==null) return new Date(NaN);
  const str=String(s).trim();
  if(/[zZ]$|[+\-]\d{2}:?\d{2}$/.test(str)) return new Date(str);
  const m=str.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/);
  if(!m) return new Date(NaN);
  const [_,Y,Mo,D,H,Mi,S]=m;
  return new Date(+Y, +Mo-1, +D, +H, +Mi, S?+S:0, 0);
}
function idOrder(id){
  if(typeof id==="number") return id;
  const m=String(id).match(/^add_(\d+)$/);
  if(m) return 1e15 + (+m[1]);
  const n=Number(id); return isNaN(n)?0:n;
}
function pairEvents(rows){
  const s=[...rows].sort((a,b)=>{
    const ta=fromIso(a.event_at).getTime(), tb=fromIso(b.event_at).getTime();
    const na=isNaN(ta), nb=isNaN(tb);
    if(na||nb){ if(na&&nb) return 0; return na?1:-1; }
    if(ta!==tb) return ta-tb;
    return idOrder(a.id) - idOrder(b.id);
  });
  const out=[]; let openIn=null, openInId=null, openInRaw=null;
  for(const r of s){
    const when=fromIso(r.event_at);
    if(r.event_type==="IN"){
      if(openIn!==null) out.push({in:openIn,out:null,sec:null,status:"INCOMPLETE",inId:openInId});
      openIn=when; openInId=r.id; openInRaw=r.event_at;
    }else if(r.event_type==="OUT"){
      if(openIn!==null){
        const sec=(isNaN(openIn)||isNaN(when))?null:(when-openIn)/1000;
        out.push({in:openIn,out:when,sec,status:sec==null?"INVALID_TIME":"COMPLETE",inId:openInId,outId:r.id}); openIn=null; openInId=null;
      } else out.push({in:null,out:when,sec:null,status:"ORPHAN_OUT",outId:r.id});
    }
  }
  if(openIn!==null) out.push({in:openIn,out:null,sec:null,status:"WORKING",inId:openInId});
  return out;
}
const H=3600, M=60;
let pass=0, fail=0;
function chk(name, got, exp){ const ok=got===exp; console.log(`${ok?'PASS':'✗FAIL'} ${name}: got=${got} exp=${exp}`); ok?pass++:fail++; }
function totalSec(rows){ return pairEvents(rows).filter(p=>p.status==='COMPLETE').reduce((a,p)=>a+p.sec,0); }

// A same-day
chk("A same-day 9h", totalSec([{id:1,event_type:"IN",event_at:"2026-09-01 09:00:00"},{id:2,event_type:"OUT",event_at:"2026-09-01 18:00:00"}]), 9*H);
// B identical timestamp → 0, id순 IN→OUT
chk("B identical 0m", totalSec([{id:1,event_type:"IN",event_at:"2026-09-01 13:07:00"},{id:2,event_type:"OUT",event_at:"2026-09-01 13:07:00"}]), 0);
// C overnight
chk("C overnight 8h", totalSec([{id:1,event_type:"IN",event_at:"2026-09-01 22:00:00"},{id:2,event_type:"OUT",event_at:"2026-09-02 06:00:00"}]), 8*H);
// D short overnight
chk("D short overnight 20m", totalSec([{id:1,event_type:"IN",event_at:"2026-09-01 23:50:00"},{id:2,event_type:"OUT",event_at:"2026-09-02 00:10:00"}]), 20*M);
// E cross-month
chk("E cross-month 8h", totalSec([{id:1,event_type:"IN",event_at:"2026-08-31 23:00:00"},{id:2,event_type:"OUT",event_at:"2026-09-01 07:00:00"}]), 8*H);
// F multiple
chk("F multiple 8h", totalSec([{id:1,event_type:"IN",event_at:"2026-09-01 09:00:00"},{id:2,event_type:"OUT",event_at:"2026-09-01 12:00:00"},{id:3,event_type:"IN",event_at:"2026-09-01 13:00:00"},{id:4,event_type:"OUT",event_at:"2026-09-01 18:00:00"}]), 8*H);
// G incomplete
chk("G incomplete 합산제외", totalSec([{id:1,event_type:"IN",event_at:"2026-09-01 09:00:00"}]), 0);
// H correction (EDIT_TIME 적용 후 event_at이 바뀐 상태로 pairEvents에 들어옴)
chk("H correction 8h", totalSec([{id:1,event_type:"IN",event_at:"2026-09-01 09:00:00"},{id:2,event_type:"OUT",event_at:"2026-09-01 17:00:00"}]), 8*H);
// I mixed format: raw 공백 IN + correction T OUT, 같은 세션 정상
chk("I mixed format 8h", totalSec([{id:1,event_type:"IN",event_at:"2026-09-01 09:00:00.123456"},{id:2,event_type:"OUT",event_at:"2026-09-01T17:00:00"}]), 8*H);
// J same-time deterministic: 입력 순서 뒤집혀도 id로 IN→OUT
chk("J same-time id tie-break 0m", totalSec([{id:2,event_type:"OUT",event_at:"2026-09-01 13:07:00"},{id:1,event_type:"IN",event_at:"2026-09-01 13:07:00"}]), 0);
// K timezone-explicit: Z 형식 (방어적)
const kz=pairEvents([{id:1,event_type:"IN",event_at:"2026-09-01T00:00:00Z"},{id:2,event_type:"OUT",event_at:"2026-09-01T08:00:00Z"}]);
chk("K Z-format 8h", kz.filter(p=>p.status==='COMPLETE').reduce((a,p)=>a+p.sec,0), 8*H);
// L invalid input → NaN이 급여로 안 감 (INVALID_TIME, COMPLETE에서 제외)
const li=pairEvents([{id:1,event_type:"IN",event_at:"garbage"},{id:2,event_type:"OUT",event_at:"2026-09-01 18:00:00"}]);
chk("L invalid → 합산제외", li.filter(p=>p.status==='COMPLETE').reduce((a,p)=>a+p.sec,0), 0);
// 과거 이상치 보존: correction으로 날짜가 익일이면 24h 그대로 (억지 교정 안 함)
chk("보존: 익일 correction 24h유지", totalSec([{id:1,event_type:"IN",event_at:"2026-08-30 13:07:00"},{id:2,event_type:"OUT",event_at:"2026-08-31T13:07:00"}]), 24*H);

console.log(`\n${fail===0?'★ ALL PASS':'✗ FAILED'}  (${pass} pass, ${fail} fail)`);
process.exit(fail?1:0);
