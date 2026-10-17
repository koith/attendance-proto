/* #987: exact version-button toggle for the test UI created by test_mode_ui_v1.js.
 * Hide only the test UI, never change BaekeokTest.enabled() or production data.
 * A root class with !important CSS also covers controls inserted after this script.
 */
(()=>{
  const button=document.getElementById('appVersion');
  if(!button)return;
  const KEY='baekeok_test_controls_visible_v1';
  const HIDDEN_CLASS='test-controls-hidden-v1';
  const style=document.createElement('style');
  style.id='testControlsVisibility987';
  style.textContent=`html.${HIDDEN_CLASS} #testModeControls,
html.${HIDDEN_CLASS} #testModeBanner,
html.${HIDDEN_CLASS} #testTimeModal{display:none!important}`;
  document.head.appendChild(style);
  let visible=true;
  try{visible=localStorage.getItem(KEY)!=='false'}catch(_){}
  function sync(){
    document.documentElement.classList.toggle(HIDDEN_CLASS,!visible);
    button.setAttribute('aria-pressed',String(visible));
    button.setAttribute('aria-label',visible?'테스트 UI 숨기기':'테스트 UI 표시');
    button.title=visible?'테스트 UI 숨기기':'테스트 UI 표시';
  }
  button.addEventListener('click',()=>{
    visible=!visible;
    try{localStorage.setItem(KEY,String(visible))}catch(_){}
    if(!visible)document.getElementById('testTimeModal')?.remove();
    sync();
  });
  sync();
})();
