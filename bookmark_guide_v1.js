/* Global bookmark setup help: strictly local UI, never touches attendance/auth/payroll. */
(function(){
  "use strict";
  function init(){
    const trigger=document.getElementById("bookmarkGuideOpen");
    const veil=document.getElementById("bookmarkGuideVeil");
    const dialog=document.getElementById("bookmarkGuideDialog");
    const closeButton=document.getElementById("bookmarkGuideClose");
    const instruction=document.getElementById("bookmarkGuideInstruction");
    const urlElement=document.getElementById("bookmarkGuideUrl");
    const copyButton=document.getElementById("bookmarkGuideCopy");
    const feedback=document.getElementById("bookmarkGuideResult");
    const tabs=Array.from(veil?.querySelectorAll("[data-bookmark-browser]")||[]);
    if(!trigger||!veil||!dialog||!closeButton||!instruction||!urlElement||!copyButton||!feedback||tabs.length!==3)return;

    const guidance={
      chrome:"<strong>Google Chrome</strong>에서 <strong>Ctrl + D</strong>를 누른 다음, 북마크 이름과 저장 위치를 확인하고 <strong>완료</strong>를 선택하세요.",
      edge:"<strong>Microsoft Edge</strong>에서 <strong>Ctrl + D</strong>를 누른 다음, 이름과 저장 위치를 확인하고 <strong>완료</strong>를 선택하세요.",
      ie:"<strong>Internet Explorer</strong>는 <strong>Ctrl + D</strong>로 즐겨찾기에 추가할 수 있지만, 지원이 종료되어 현재 근태관리 앱에서는 <strong>Chrome 또는 Edge 사용을 권장</strong>합니다."
    };
    let opener=null;
    function bookmarkUrl(){
      // Use the server-selected route locator, not cached branch IDs from a prior login.
      // A HQ dashboard bookmark always targets the HQ app root; a branch bookmark
      // always opens that branch's #pos screen regardless of the current tab.
      const current=new URL(window.location.href);
      const base=new URL("./",current.href);
      const mode=current.searchParams.get("mode");
      const rawId=current.searchParams.get("store");
      const id=rawId&&/^\d+$/.test(rawId)?Number(rawId):0;
      if(mode==="store"&&Number.isSafeInteger(id)&&id>0){
        const dest=new URL("index.html",base);
        dest.searchParams.set("mode","store");
        dest.searchParams.set("store",String(id));
        dest.hash="pos";
        return dest.href;
      }
      return base.href;
    }
    function selectBrowser(which){
      const selected=Object.prototype.hasOwnProperty.call(guidance,which)?which:"chrome";
      for(const tab of tabs){
        const active=tab.getAttribute("data-bookmark-browser")===selected;
        tab.setAttribute("aria-selected",active?"true":"false");
        tab.tabIndex=active?0:-1;
      }
      instruction.innerHTML=guidance[selected];
    }
    function open(){
      opener=document.activeElement;
      urlElement.textContent=bookmarkUrl();
      feedback.textContent="";
      selectBrowser(/Edg\//.test(navigator.userAgent)?"edge":/Trident|MSIE/.test(navigator.userAgent)?"ie":"chrome");
      veil.hidden=false;
      trigger.setAttribute("aria-expanded","true");
      closeButton.focus();
    }
    function close(){
      veil.hidden=true;
      trigger.setAttribute("aria-expanded","false");
      (opener?.isConnected?opener:trigger).focus();
    }
    function legacyCopy(value){
      const field=document.createElement("textarea");
      field.value=value;
      field.setAttribute("readonly","");
      field.style.position="fixed";
      field.style.opacity="0";
      document.body.appendChild(field);
      field.select();
      let copied=false;
      try{copied=document.execCommand("copy")}finally{field.remove()}
      return copied;
    }
    async function copy(){
      const value=bookmarkUrl();
      try{
        if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(value);
        else if(!legacyCopy(value))throw Error("CLIPBOARD_UNAVAILABLE");
        feedback.textContent="현재 "+(new URL(value).searchParams.get("mode")==="store"?"지점":"본사")+" 주소를 복사했습니다.";
      }catch(_){
        feedback.textContent="자동 복사가 제한되어 있습니다. 위 주소를 길게 누르거나 선택해 복사해 주세요.";
      }
    }

    trigger.addEventListener("click",open);
    closeButton.addEventListener("click",close);
    copyButton.addEventListener("click",copy);
    veil.addEventListener("click",event=>{if(event.target===veil)close()});
    for(const tab of tabs)tab.addEventListener("click",()=>selectBrowser(tab.dataset.bookmarkBrowser));
    veil.addEventListener("keydown",event=>{
      if(event.key==="Escape"){event.preventDefault();close();return}
      if(event.key==="Tab"){
        const focusable=[closeButton,...tabs,copyButton].filter(el=>!el.disabled);
        const at=focusable.indexOf(document.activeElement);
        if(event.shiftKey&&at===0){event.preventDefault();focusable[focusable.length-1].focus()}
        else if(!event.shiftKey&&at===focusable.length-1){event.preventDefault();focusable[0].focus()}
      }
      if((event.key==="ArrowLeft"||event.key==="ArrowRight")&&tabs.includes(document.activeElement)){
        event.preventDefault();
        const index=tabs.indexOf(document.activeElement);
        const next=(index+(event.key==="ArrowRight"?1:-1)+tabs.length)%tabs.length;
        tabs[next].focus();selectBrowser(tabs[next].dataset.bookmarkBrowser);
      }
    });
    // Testable read-only resolver. No external request and no persistent storage.
    window.BaekeokBookmarkGuide={bookmarkUrl};
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
