(()=>{
  if(window.__baekeokNoZoomGuard)return;
  window.__baekeokNoZoomGuard=true;

  /* iOS Safari can still honor pinch/gesture zoom even with user-scalable=no.
     Block only multi-touch / gesture zoom while preserving normal one-finger scroll,
     taps, native form controls and the existing second-tap suppression. */
  const stopGesture=e=>{ if(e.cancelable)e.preventDefault(); };
  ['gesturestart','gesturechange','gestureend'].forEach(type=>
    document.addEventListener(type,stopGesture,{passive:false,capture:true})
  );
  document.addEventListener('touchmove',e=>{
    if(e.touches&&e.touches.length>1&&e.cancelable)e.preventDefault();
  },{passive:false,capture:true});

  let lastAt=0,lastX=0,lastY=0,lastTarget=null;
  document.addEventListener('touchend',e=>{
    if(!e.changedTouches||e.changedTouches.length!==1)return;
    if(e.touches&&e.touches.length)return;
    const touch=e.changedTouches[0],now=Date.now();
    const target=e.target instanceof Element?e.target:null;
    const nativeTarget=target?.closest('input,select,textarea,label,[contenteditable="true"]');
    const near=Math.abs(touch.clientX-lastX)<=28&&Math.abs(touch.clientY-lastY)<=28;
    const same=!!(target&&lastTarget&&(target===lastTarget||target.contains(lastTarget)||lastTarget.contains(target)));
    if(!nativeTarget&&same&&near&&now-lastAt>0&&now-lastAt<320&&e.cancelable)e.preventDefault();
    lastAt=now;lastX=touch.clientX;lastY=touch.clientY;lastTarget=target;
  },{passive:false,capture:true});
})();
