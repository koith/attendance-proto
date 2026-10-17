/* #982: Best-effort toggle for third-party injected floating test controls.
   Does not touch normal application controls or the connection banner. */
(function(){
  const button=document.getElementById('appVersion');
  if(!button)return;
  let hidden=true;
  const touched=new Map();
  const appRoot=document.querySelector('.wrap');
  function candidates(){
    const result=[];
    for(const el of document.body.querySelectorAll('button,div,aside,section,[role="switch"],[role="toolbar"]')){
      if(el===button||el.contains(button)||appRoot?.contains(el))continue;
      if(el.closest('#versionTestControls'))continue;
      const style=getComputedStyle(el);
      if(style.position!=='fixed'&&style.position!=='sticky')continue;
      const r=el.getBoundingClientRect();
      if(r.width<25||r.width>260||r.height<20||r.height>110||r.top>210||r.left>250)continue;
      const label=((el.getAttribute('aria-label')||'')+' '+(el.innerText||'')).trim();
      if(!/\bLIVE\b|test|debug|clock|테스트/i.test(label))continue;
      result.push(el);
    }
    return result.filter(el=>!result.some(other=>other!==el&&el.contains(other)));
  }
  function apply(){
    for(const el of candidates()){
      if(!touched.has(el))touched.set(el,{display:el.style.display,priority:el.style.getPropertyPriority('display')});
      if(hidden)el.style.setProperty('display','none','important');
    }
    for(const [el,old] of touched){
      if(!el.isConnected){touched.delete(el);continue;}
      if(!hidden)el.style.setProperty('display',old.display,old.priority);
      else el.style.setProperty('display','none','important');
    }
    button.setAttribute('aria-pressed',String(!hidden));
    button.setAttribute('title',hidden?'테스트 UI 표시':'테스트 UI 숨기기');
  }
  button.addEventListener('click',function(){hidden=!hidden;apply()});
  const observer=new MutationObserver(function(){if(hidden)apply()});
  observer.observe(document.body,{childList:true,subtree:false});
  apply();
})();
