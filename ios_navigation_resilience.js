(()=>{
  if(window.__baekeokIosResilience)return;
  window.__baekeokIosResilience=true;
  const rawFetch=window.fetch.bind(window);
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:(input&&input.url)||'';
    const isSupabase=/\.supabase\.co\//.test(url);
    if(!isSupabase)return rawFetch(input,init);
    let lastErr;
    for(let attempt=0;attempt<3;attempt++){
      try{return await rawFetch(input,init)}catch(e){
        lastErr=e;
        if(attempt===2)break;
        await sleep(attempt===0?180:420);
      }
    }
    throw lastErr;
  };
  addEventListener('pageshow',e=>{
    if(e.persisted)location.reload();
  });

  /* Admin IA: actual attendance has one canonical entry point in Quick Menu.
     Remove the legacy daily/monthly planned-schedule shortcuts when renderAdmin
     creates them. WorkSchedule data/editors remain intact; only duplicate entry
     points are removed to prevent users returning to an unexpected admin depth. */
  const cleanAdminScheduleShortcuts=()=>{
    document.getElementById('adSchedMonth')?.remove();
    document.getElementById('adSched')?.remove();
  };
  cleanAdminScheduleShortcuts();
  new MutationObserver(cleanAdminScheduleShortcuts).observe(document.documentElement,{childList:true,subtree:true});
})();
