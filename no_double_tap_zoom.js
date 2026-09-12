(()=>{
  if(window.__baekeokNoDoubleTapZoom)return;
  window.__baekeokNoDoubleTapZoom=true;
  let lastAt=0,lastX=0,lastY=0,lastTarget=null;
  document.addEventListener('touchend',e=>{
    if(!e.changedTouches||e.changedTouches.length!==1)return;
    if(e.touches&&e.touches.length)return;
    const touch=e.changedTouches[0],now=Date.now();
    const target=e.target instanceof Element?e.target:null;
    const nativeTarget=target?.closest('input,select,textarea,label,[contenteditable="true"]');
    const near=Math.abs(touch.clientX-lastX)<=28&&Math.abs(touch.clientY-lastY)<=28;
    const same=!!(target&&lastTarget&&(target===lastTarget||target.contains(lastTarget)||lastTarget.contains(target)));
    if(!nativeTarget&&same&&near&&now-lastAt>0&&now-lastAt<320)e.preventDefault();
    lastAt=now;lastX=touch.clientX;lastY=touch.clientY;lastTarget=target;
  },{passive:false,capture:true});
})();
