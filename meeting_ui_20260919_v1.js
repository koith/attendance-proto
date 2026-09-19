(()=>{if(window.__meetingUi20260919)return;window.__meetingUi20260919=true;
function enhance(){
 const m=document.getElementById('payMonth');
 if(m&&!document.getElementById('payMonthNav')){
  const n=document.createElement('div');n.id='payMonthNav';n.style.cssText='display:grid;grid-template-columns:44px minmax(0,1fr) 44px;gap:10px;align-items:center;width:100%';
  const a=document.createElement('button'),b=document.createElement('button');a.className=b.className='btn btn-secondary';a.style.cssText=b.style.cssText='width:44px;height:44px;padding:0;display:flex;align-items:center;justify-content:center';a.textContent='◀';b.textContent='▶';m.style.cssText+=';width:100%;min-width:0;text-align:center';
  m.parentNode.insertBefore(n,m);n.append(a,m,b);
  const move=d=>{const q=m.value.split('-').map(Number),x=new Date(q[0],q[1]-1+d,1);m.value=x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0');m.dispatchEvent(new Event('change',{bubbles:true}))};
  a.onclick=()=>move(-1);b.onclick=()=>move(1);
 }
 const box=document.getElementById('payList'),k=box&&box.querySelector('.kpi-row');
 if(box&&k&&box.firstElementChild!==k){const l=k.querySelector('.kpi-label');if(l&&l.textContent.includes('세전'))box.prepend(k)}
}
enhance();
setInterval(enhance,2000);
setInterval(()=>{try{fetch(CONFIG.SUPABASE_URL+'/rest/v1/rpc/substitution_enforce_due',{method:'POST',headers:{apikey:CONFIG.SUPABASE_ANON_KEY,Authorization:'Bearer '+CONFIG.SUPABASE_ANON_KEY,'Content-Type':'application/json'},body:'{}'})}catch(_){}},60000);
})();