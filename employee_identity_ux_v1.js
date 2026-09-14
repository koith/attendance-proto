/* Employee identity UX V1: show stable No.<employee id> under employee names across the main app.
   Also removes obsolete planned-schedule shortcuts/details from the senior-facing admin IA. */
(()=>{
  if(window.__baekeokEmployeeIdentityUxV1)return;
  window.__baekeokEmployeeIdentityUxV1=true;
  const no=id=>`No. ${String(Number(id)||0).padStart(2,'0')}`;
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function installStyle(){if(document.getElementById('employeeIdentityStyle'))return;const s=document.createElement('style');s.id='employeeIdentityStyle';s.textContent=`.employee-name-stack{display:flex;flex-direction:column;min-width:0}.employee-no-sub{display:block;margin-top:2px;font-size:.66rem;line-height:1.1;color:var(--text-muted,var(--muted,#8994a1));font-weight:500;font-variant-numeric:tabular-nums;letter-spacing:.01em}.employee-no-inline{font-size:.62rem;color:var(--text-muted,var(--muted,#8994a1));font-weight:500;margin-left:5px;font-variant-numeric:tabular-nums}`;document.head.appendChild(s)}
  function stack(el,name,id){if(!el||id==null)return;el.classList.add('employee-name-stack');el.innerHTML=`<span>${esc(name)}</span><small class="employee-no-sub">${no(id)}</small>`}
  async function allEmployees(){try{return typeof BE!=='undefined'&&BE.allEmployees?await BE.allEmployees():[]}catch(_){return[]}}
  async function stateEmployees(){try{return typeof BE!=='undefined'&&BE.listEmployeesState?await BE.listEmployeesState():[]}catch(_){return[]}}

  const baseRenderPos=window.renderPos;
  if(typeof baseRenderPos==='function')window.renderPos=async function(...args){const r=await baseRenderPos.apply(this,args);installStyle();const emps=await stateEmployees();const byName=new Map(emps.map(e=>[String(e.name),e]));document.querySelectorAll('#empGrid .emp .nm').forEach(n=>{const e=byName.get((n.textContent||'').trim());if(e)stack(n,e.name,e.id)});return r};

  const baseOpenPad=window.openPad;
  if(typeof baseOpenPad==='function')window.openPad=function(emp,state){const r=baseOpenPad.call(this,emp,state);installStyle();const title=document.getElementById('padTitle');let sub=document.getElementById('padEmployeeNo');if(!sub&&title){sub=document.createElement('div');sub.id='padEmployeeNo';sub.className='employee-no-sub';sub.style.textAlign='center';title.after(sub)}if(sub)sub.textContent=no(emp.id);return r};

  const baseShowSuccess=window.showSuccess;
  if(typeof baseShowSuccess==='function')window.showSuccess=function(type,name,now,res){const r=baseShowSuccess.call(this,type,name,now,res);stateEmployees().then(emps=>{const e=emps.find(x=>String(x.name)===String(name));const n=document.getElementById('successName');if(e&&n)stack(n,e.name,e.id)});return r};

  const baseRenderAdmin=window.renderAdmin;
  if(typeof baseRenderAdmin==='function')window.renderAdmin=async function(...args){const r=await baseRenderAdmin.apply(this,args);installStyle();
    document.getElementById('adSched')?.remove();document.getElementById('adSchedMonth')?.remove();
    document.querySelectorAll('#adList .sch-line,#adList .sch-prog,#adList .sch-prog-sub').forEach(x=>x.remove());
    const emps=await allEmployees();const byId=new Map(emps.map(e=>[Number(e.id),e]));
    document.querySelectorAll('#adList .att-card').forEach(card=>{const id=Number(card.querySelector('[data-fix]')?.dataset.fix);const e=byId.get(id);if(e)stack(card.querySelector('.att-name'),e.name,e.id)});
    document.querySelectorAll('#adEmps .row').forEach(row=>{const id=Number(row.querySelector('[data-contract]')?.dataset.contract||row.querySelector('[data-deact]')?.dataset.deact);const e=byId.get(id);if(e)stack(row.querySelector('.nm'),e.name,e.id)});
    return r};

  const baseOpenAdminFix=window.openAdminFix;
  if(typeof baseOpenAdminFix==='function')window.openAdminFix=function(emp,rows){const r=baseOpenAdminFix.call(this,emp,rows);installStyle();const h=document.querySelector('#addVeil .modal h3');if(h){h.innerHTML=`${esc(emp.name)} · 근태 수정<small class="employee-no-sub">${no(emp.id)}</small>`}return r};

  const baseMrShowAuth=window.mrShowAuth;
  if(typeof baseMrShowAuth==='function')window.mrShowAuth=function(emps,preselId){const r=baseMrShowAuth.call(this,emps,preselId);document.querySelectorAll('#mrEmp option').forEach(o=>{const e=emps.find(x=>Number(x.id)===Number(o.value));if(e)o.textContent=`${e.name} · ${no(e.id)}`});return r};

  const baseRenderPending=window.renderPendingRequests;
  if(typeof baseRenderPending==='function')window.renderPendingRequests=async function(...args){const r=await baseRenderPending.apply(this,args);installStyle();try{const [reqs,emps]=await Promise.all([BE.pendingRequests(),allEmployees()]);const byId=new Map(emps.map(e=>[Number(e.id),e]));document.querySelectorAll('#adReqSection .row').forEach((row,i)=>{const req=reqs[i],e=byId.get(Number(req?.employee_id));const nm=row.querySelector('.nm');if(e&&nm){const suffix=(nm.textContent||'').replace(e.name,'').trim();nm.innerHTML=`<span>${esc(e.name)}${suffix?' '+esc(suffix):''}</span><small class="employee-no-sub">${no(e.id)}</small>`}})}catch(_){}return r};

  installStyle();
})();