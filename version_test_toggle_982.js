/* #984: reversible debug overlay visibility. No destructive DOM removal. */
(function(){
  const button=document.getElementById('appVersion');
  if(!button)return;
  const root=document.querySelector('.wrap');
  const tracked=new Map();
  let hidden=false; // never silently hide tools on initial load
  function find(){
    const nodes=[];
    document.body.querySelectorAll('div,aside,section,button,[role="toolbar"],[role="switch"]').forEach(el=>{
      if(el===button||el.contains(button)||root?.contains(el))return;
      const style=getComputedStyle(el);
      if(style.position!=='fixed'&&style.position!=='sticky')return;
      const r=el.getBoundingClientRect();
      if(r.left>260||r.top>210||r.width<25||r.width>260||r.height<20||r.height>120)return;
      const label=[el.getAttribute('aria-label')||'',el.textContent||''].join(' ');
      if(/\bLIVE\b|debug|test|clock|테스트/i.test(label))nodes.push(el);
    });
    return nodes.filter(el=>!nodes.some(parent=>parent!==el&&parent.contains(el)));
  }
  function capture(){
    if(hidden)return;
    for(const el of find()){
      if(!tracked.has(el))tracked.set(el,{display:el.style.getPropertyValue('display'),priority:el.style.getPropertyPriority('display')});
    }
  }
  function paint(){
    if(!hidden)capture();
    for(const [el,previous] of tracked){
      if(!el.isConnected){tracked.delete(el);continue;}
      if(hidden)el.style.setProperty('display','none','important');
      else if(previous.display)el.style.setProperty('display',previous.display,previous.priority);
      else el.style.removeProperty('display');
    }
    button.setAttribute('aria-pressed',String(hidden));
    button.setAttribute('aria-label',hidden?'버전 '+button.textContent+' · 테스트 UI 표시':'버전 '+button.textContent+' · 테스트 UI 숨기기');
    button.title=hidden?'테스트 UI 표시':'테스트 UI 숨기기';
  }
  button.addEventListener('click',()=>{hidden=!hidden;paint()});
  const observer=new MutationObserver(()=>{if(!hidden)capture()});
  observer.observe(document.body,{childList:true,subtree:true});
  paint();
})();
