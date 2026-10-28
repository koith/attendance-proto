/* Same-bookmark release recovery. Public static metadata only; no Auth or DB. */
(()=>{
 'use strict';
 const version=v=>/^v\d+\.\d+$/.test(String(v))?v.slice(1).split('.').map(Number):null;
 window.BaekeokReleaseProbe=async function(current){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),2500);
  try{
   const endpoint=new URL('./app-release.json',location.href);
   endpoint.searchParams.set('check',String(Date.now()));
   const response=await fetch(endpoint.href,{cache:'no-store',redirect:'error',signal:controller.signal});
   if(!response.ok)return false;
   const release=await response.json(),next=version(release.version),now=version(current);
   if(!next||!now||!/^[a-f0-9]{40}$/.test(String(release.commit))||
    !/^[a-f0-9]{64}$/.test(String(release.index_sha256)))return false;
   if(next[0]<now[0]||(next[0]===now[0]&&next[1]<=now[1]))return false;
   const target=new URL(location.href),tag=release.commit.slice(0,16);
   if(target.searchParams.get('__app_release')===tag)return false;
   // Prevent a partial CDN rollout or inaccessible storage causing reload loops.
   const key='baekeok_release_attempt_'+tag;
   try{if(sessionStorage.getItem(key))return false;sessionStorage.setItem(key,'1');}
   catch(_){return false;}
   target.searchParams.set('__app_release',tag);
   location.replace(target.href);return true;
  }catch(_){return false;}
  finally{clearTimeout(timer);}
 };
})();
