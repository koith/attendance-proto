(()=>{
  if(window.__baekeokTestCoreV1)return; window.__baekeokTestCoreV1=true;
  if(typeof BE==='undefined'||typeof kstNow!=='function')return;
  const KEY='baekeok_test_mode_v1';
  const load=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'null')||{enabled:false,now:null,events:[],corrections:[],seq:1}}catch(_){return{enabled:false,now:null,events:[],corrections:[],seq:1}}};
  const save=s=>localStorage.setItem(KEY,JSON.stringify(s)); let S=load();
  window.BaekeokTest={key:KEY,get:()=>S,set:x=>{S=x;save(S)},enabled:()=>!!S.enabled};
  const realNow=kstNow; const real={};
  ['punch','eventsWithCorrections','rangeEvents','listEmployeesState','myEvents','correctEvent'].forEach(k=>{if(typeof BE[k]==='function')real[k]=BE[k].bind(BE)});
  const now=()=>S.enabled&&S.now?new Date(S.now):realNow(); kstNow=()=>now();
  const local=d=>{const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`};
  const range=(v,a,b)=>String(v)>=String(a)&&String(v)<String(b);
  const latest=id=>S.events.filter(e=>Number(e.employee_id)===Number(id)).sort((a,b)=>String(a.event_at).localeCompare(String(b.event_at))||Number(a.id)-Number(b.id)).at(-1)||null;
  BE.punch=async(id,pin)=>{
    if(!S.enabled)return real.punch(id,pin);
    if(String(pin)!=='0000')return {ok:false,error:'BAD_PIN'};
    const emps=(await BE.allEmployees()).filter(e=>e.is_active!==false&&e.active!==false),emp=emps.find(e=>Number(e.id)===Number(id)); if(!emp)return {ok:false,error:'NO_EMPLOYEE'};
    const last=latest(id),type=last?.event_type==='IN'?'OUT':'IN',at=local(now());
    S.events.push({id:S.seq++,employee_id:Number(id),event_type:type,event_at:at,device_id:'TEST_MODE'});save(S);return {ok:true,type,name:emp.name,test:true};
  };
  BE.eventsWithCorrections=async(a,b)=>S.enabled?{events:S.events.filter(e=>range(e.event_at,a,b)),corrections:S.corrections||[]}:real.eventsWithCorrections(a,b);
  BE.rangeEvents=async(a,b)=>S.enabled?S.events.filter(e=>range(e.event_at,a,b)):real.rangeEvents(a,b);
  BE.listEmployeesState=async()=>{if(!S.enabled)return real.listEmployeesState();const emps=(await BE.allEmployees()).filter(e=>e.is_active!==false&&e.active!==false);return emps.map(e=>{const x=latest(e.id);return {...e,working:x?.event_type==='IN',working_since:x?.event_type==='IN'?x.event_at:null,last_event_type:x?.event_type||null}})};
  BE.myEvents=async(id,pin,a,b)=>{if(!S.enabled)return real.myEvents(id,pin,a,b);if(String(pin)!=='0000')return {ok:false,error:'BAD_PIN'};return {ok:true,events:S.events.filter(e=>Number(e.employee_id)===Number(id)&&range(e.event_at,a,b)),requests:[]}};
  BE.correctEvent=async(action,eventId,empId,newAt,newType,reason)=>{if(!S.enabled)return real.correctEvent(action,eventId,empId,newAt,newType,reason);const c={id:S.seq++,event_id:eventId==null?null:Number(eventId),employee_id:Number(empId),action,new_event_at:newAt||null,new_event_type:newType||null,reason:reason||'TEST',created_by:'test-mode',created_at:new Date().toISOString()};S.corrections=S.corrections||[];S.corrections.push(c);save(S);return c.id};
})();