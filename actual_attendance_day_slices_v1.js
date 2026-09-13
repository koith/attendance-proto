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

    if(ss.some(s=>s.sliceDerived)){
      const note=document.createElement('div');note.className='day-slice-note';
      note.textContent='자정을 넘긴 근무는 날짜별로 나누어 표시합니다. 정정 시 원본 출퇴근 시각을 수정합니다.';
      document.querySelector('.sessions')?.prepend(note);
    }
  };

  window.actualAttendanceSourceSession=s=>s?({...s,in:s.sourceIn??s.in,out:s.sourceOut??s.out,sec:s.sourceSec??s.sec}):s;
})();
