(()=>{
  if(window.__baekeokNoZoomGuard)return;
  window.__baekeokNoZoomGuard=true;
  const stop=e=>{if(e.cancelable)e.preventDefault()};
  ['gesturestart','gesturechange','gestureend'].forEach(type=>document.addEventListener(type,stop,{passive:false,capture:true}));
  document.addEventListener('touchmove',e=>{if(e.touches&&e.touches.length>1)stop(e)},{passive:false,capture:true});
  document.addEventListener('dblclick',e=>{const t=e.target instanceof Element?e.target:null;if(!t?.closest('input,textarea,[contenteditable="true"]'))stop(e)},{passive:false,capture:true});
  let lastAt=0,lastX=0,lastY=0,lastTarget=null;
  document.addEventListener('touchend',e=>{
    if(!e.changedTouches||e.changedTouches.length!==1||(e.touches&&e.touches.length))return;
    const touch=e.changedTouches[0],now=Date.now(),target=e.target instanceof Element?e.target:null;
    const interactive=target?.closest('button,a,input,select,textarea,label,[contenteditable="true"],[role="button"]');if(interactive){lastAt=0;lastTarget=null;return;}\n    const near=Math.abs(touch.clientX-lastX)<=30&&Math.abs(touch.clientY-lastY)<=30;
    const same=!!(target&&lastTarget&&(target===lastTarget||target.contains(lastTarget)||lastTarget.contains(target)));
    if(same&&near&&now-lastAt>0&&now-lastAt<360)stop(e);
    lastAt=now;lastX=touch.clientX;lastY=touch.clientY;lastTarget=target;
  },{passive:false,capture:true});
})();