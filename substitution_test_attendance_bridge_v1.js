/* TEST-only bridge: derive substitute actual minutes/status from isolated TEST attendance events. */
(()=>{
  const MODE='baekeok_test_mode_v1', SUB='baekeok_test_substitution_v1';
  const load=(k,f)=>{try{return JSON.parse(localStorage.getItem(k)||'null')||f}catch(_){return f}};
  const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  const ms=v=>{const d=new Date(String(v||'').replace(' ','T'));return Number.isFinite(+d)?+d:null};
  function sessions(events,employee){
    const a=(events||[]).filter(e=>Number(e.employee_id)===Number(employee)).sort((x,y)=>(ms(x.event_at)||0)-(ms(y.event_at)||0));
    const out=[];let open=null;
    for(const e of a){if(e.event_type==='IN')open=e;else if(e.event_type==='OUT'&&open){out.push([ms(open.event_at),ms(e.event_at)]);open=null}}
    if(open)out.push([ms(open.event_at),null]);return out;
  }
  function refresh(){
    const state=load(MODE,{enabled:false,events:[]});if(!state.enabled)return;
    const rows=load(SUB,[]),now=state.now?+new Date(state.now):Date.now();let dirty=false;
    for(const r of rows){if(!['ACCEPTED','IN_PROGRESS','PARTIAL','COMPLETED','FAILED'].includes(r.status))continue;
      const start=ms(r.work_start),end=ms(r.work_end);if(start==null||end==null)continue;
      let mins=0,hasOpen=false;
      for(const [a,b0] of sessions(state.events,r.substitute_employee_id)){const b=b0==null?now:b0,lo=Math.max(a,start),hi=Math.min(b,end);if(hi>lo)mins+=(hi-lo)/60000;if(b0==null&&b>start&&a<end)hasOpen=true}
      const actual=Math.max(0,Math.floor(mins));let status=r.status;
      if(actual>0&&hasOpen&&now<end)status='IN_PROGRESS';
      else if(now>=end)status=actual>0?'COMPLETED':'FAILED';
      else if(actual>0)status='PARTIAL';
      if(r.actual_minutes!==actual||r.status!==status){r.actual_minutes=actual;r.status=status;if(['COMPLETED','FAILED'].includes(status)&&!r.resolved_at)r.resolved_at=new Date(now).toISOString();dirty=true}
    }
    if(dirty)save(SUB,rows);
  }
  window.BaekeokTestSubstitutionRefresh=refresh;refresh();
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refresh()});
})();