/* #998: Client-side response to server-enforced single-session revocation.
 * The DB pre-request hook is the security boundary; this watcher is UX only.
 */
(()=>{
  const MESSAGE='같은 관리자 계정으로 다른 단말기에서 로그인하여 이 단말기의 로그인이 해제되었습니다.';
  let checking=false,stopped=false;
  async function check(){
    if(stopped||checking||!Auth.isLoggedIn()||document.visibilityState==='hidden')return;
    checking=true;
    try{
      const r=await fetch(CONFIG.SUPABASE_URL+'/rest/v1/rpc/is_admin',{
        method:'POST',headers:{apikey:CONFIG.SUPABASE_ANON_KEY,
          Authorization:'Bearer '+Auth.token,'Content-Type':'application/json'},
        body:'{}',cache:'no-store'});
      if(!r.ok){
        const body=await r.text();
        if(body.includes('SESSION_SUPERSEDED')){
          stopped=true;Auth.clear();
          try{sessionStorage.removeItem('baekeok_auth')}catch(_){}
          alert(MESSAGE);
          location.reload();
        }
      }
    }catch(_){/* Offline is not a reason to log out. */}
    finally{checking=false}
  }
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void check()});
  window.addEventListener('focus',()=>void check());
  window.addEventListener('storage',e=>{if(e.key==='baekeok_auth')void check()});
  setInterval(()=>void check(),12000);
  setTimeout(()=>void check(),1500);
})();
