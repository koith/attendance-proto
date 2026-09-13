(()=>{
  if(globalThis.__baekeokSupabaseSessionResilienceV1)return;
  globalThis.__baekeokSupabaseSessionResilienceV1=true;
  const nativeFetch=window.fetch.bind(window);
  let refreshPromise=null;
  const SESSION_KEY='baekeok_auth';
  const isSupabase=url=>/https:\/\/[^/]+\.supabase\.co\//.test(String(url||''));
  const session=()=>{try{return JSON.parse(localStorage.getItem(SESSION_KEY)||'null')}catch(_){return null}};
  const save=s=>{if(s&&s.access_token){const prev=session()||{};localStorage.setItem(SESSION_KEY,JSON.stringify({...prev,...s}))}};
  const headerValue=(input,init,name)=>{
    const h=new Headers(init?.headers||(typeof input!=='string'?input?.headers:{}));return h.get(name);
  };
  async function request(input,init){
    try{return await nativeFetch(input,init)}catch(e){
      if(!(e instanceof TypeError))throw e;
      await new Promise(r=>setTimeout(r,180));
      return nativeFetch(input,init);
    }
  }
  async function refreshFrom(url,input,init){
    if(refreshPromise)return refreshPromise;
    const s=session();if(!s?.refresh_token)return null;
    const apiKey=headerValue(input,init,'apikey');if(!apiKey)return null;
    const origin=new URL(String(url)).origin;
    refreshPromise=(async()=>{
      try{
        const r=await request(`${origin}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey:apiKey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:s.refresh_token})});
        if(!r.ok)return null;
        const next=await r.json();save(next);return next.access_token||null;
      }catch(_){return null}finally{refreshPromise=null}
    })();
    return refreshPromise;
  }
  function withToken(input,init,token){
    if(typeof input==='string'){
      const next={...(init||{})},h=new Headers(init?.headers||{});h.set('Authorization',`Bearer ${token}`);next.headers=h;return [input,next];
    }
    const h=new Headers(input.headers);h.set('Authorization',`Bearer ${token}`);return [new Request(input,{headers:h}),init];
  }
  window.fetch=async function(input,init){
    const url=typeof input==='string'?input:input?.url;
    if(!isSupabase(url))return nativeFetch(input,init);
    let response=await request(input,init);
    if(response.status!==401||!/\/rest\/v1\//.test(String(url)))return response;
    const token=await refreshFrom(url,input,init);
    if(!token)return response;
    const [retryInput,retryInit]=withToken(input,init,token);
    return request(retryInput,retryInit);
  };
})();
