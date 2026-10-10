/* Auth invitation completion, using the same public Supabase configuration
   already distributed with the main webapp. Private service keys never enter this page. */
(async function(){
"use strict";
const hash=new URLSearchParams(location.hash.replace(/^#/,""));
const token=hash.get("access_token"),refresh=hash.get("refresh_token");
const error=hash.get("error_description")||hash.get("error");
history.replaceState(null,"",location.pathname);
const status=document.getElementById("status"),form=document.getElementById("activateForm");
if(error||!token){
 form.hidden=true;
 status.textContent=error||"초대 인증 정보가 없습니다. 본사 초대 이메일의 최신 링크를 다시 열어주세요.";
 return;
}
let config;
try{
 const response=await fetch("./index.html",{cache:"no-cache"});
 if(!response.ok)throw Error("APP_CONFIG_UNAVAILABLE");
 const source=await response.text();
 const url=source.match(/SUPABASE_URL:\s*"(https:\/\/[^"]+)"/)?.[1];
 const key=source.match(/SUPABASE_ANON_KEY:\s*"([^"]+)"/)?.[1];
 if(!url||!key)throw Error("APP_CONFIG_UNAVAILABLE");
 config={url,key};
}catch(e){
 form.hidden=true;
 status.textContent="계정 활성화 설정을 불러오지 못했습니다.";
 return;
}
form.onsubmit=async event=>{
 event.preventDefault();
 const password=document.getElementById("password").value;
 const confirmPassword=document.getElementById("repeat").value;
 if(password.length<12||password!==confirmPassword){
  status.textContent="비밀번호는 12자 이상이어야 하며 확인 입력과 일치해야 합니다.";
  return;
 }
 const button=document.getElementById("confirm");button.disabled=true;
 status.textContent="비밀번호와 지점 권한을 확인하고 있습니다.";
 try{
  const change=await fetch(config.url+"/auth/v1/user",{
   method:"PUT",headers:{apikey:config.key,Authorization:"Bearer "+token,
     "Content-Type":"application/json"},body:JSON.stringify({password})
  });
  const updated=await change.json().catch(()=>({}));
  if(!change.ok)throw Error(updated.msg||updated.message||"PASSWORD_SETUP_FAILED");
  const r=await fetch(config.url+"/rest/v1/rpc/admin_context",{
   method:"POST",headers:{apikey:config.key,Authorization:"Bearer "+token,
      "Content-Type":"application/json"},body:"{}"
  });
  const ctx=await r.json();
  const storeId=Number(ctx?.store_id);
  if(!r.ok||ctx?.role!=="STORE_MANAGER"||!Number.isSafeInteger(storeId)||storeId<1)
    throw Error("점주 권한을 확인할 수 없습니다. 본사에 문의하세요.");
  localStorage.setItem("baekeok_auth",JSON.stringify({
    access_token:token,refresh_token:refresh||"",expires_in:Number(hash.get("expires_in"))||3600
  }));
  document.getElementById("password").value="";
  document.getElementById("repeat").value="";
  location.replace("index.html?mode=store&store="+encodeURIComponent(storeId)+"#pos");
 }catch(e){
  status.textContent="활성화 실패: "+String(e?.message||e);
  button.disabled=false;
 }
};
})();
