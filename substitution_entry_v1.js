(()=>{if(window.__substitutionEntryV1)return;window.__substitutionEntryV1=true;
const install=()=>{
  if(location.pathname.endsWith('substitution.html')||document.getElementById('substitutionEntryV1'))return;
  const tabs=document.querySelector('.tabs'); if(!tabs)return;
  const a=document.createElement('a');
  a.id='substitutionEntryV1'; a.href='substitution.html'; a.textContent='대타 근무';
  tabs.appendChild(a);
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();