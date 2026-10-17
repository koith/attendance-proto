/* #987: Explicit toggle for test_mode_ui_v1.js #testModeControls. */
(function(){
  const button=document.getElementById('appVersion');
  if(!button)return;
  let hidden=false;
  const TARGET_ID='testModeControls';
  function sync(){
    const controls=document.getElementById(TARGET_ID);
    if(controls)controls.style.setProperty('display',hidden?'none':'flex','important');
    button.setAttribute('aria-pressed',String(hidden));
    button.setAttribute('aria-label',hidden?'테스트 도구 표시':'테스트 도구 숨기기');
    button.title=hidden?'테스트 도구 표시':'테스트 도구 숨기기';
  }
  button.addEventListener('click',()=>{hidden=!hidden;sync()});
  const observer=new MutationObserver(records=>{
    if(records.some(r=>Array.from(r.addedNodes).some(n=>n.nodeType===1&&(n.id===TARGET_ID||n.querySelector?.('#'+TARGET_ID)))))sync();
  });
  observer.observe(document.body,{childList:true,subtree:true});
  sync();
})();
