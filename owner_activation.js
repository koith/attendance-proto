/* Auth invitation completion, using the same public Supabase configuration
   already distributed with the main webapp. Private service keys never enter this page. */
(async function(){
"use strict";
const hash=new URLSearchParams(location.hash.replace(/^#/,""));
const token=hash.get("access_token"),refresh=hash.get("refresh_token");
const error=hash.get("error_description")||hash.get("error");
// Official one-click recovery: email links to this static app before any
// one-time Auth call. Mail prefetchers can GET the static URL without redeeming
// the OTP; the browser POSTs the hash only after running the activation page.
// This is the normal email-button flow, never a pasted URL/third-party relay.
if(hash.get("type")==="recovery"&&hash.get("token_hash")){
 const oneTimeHash=hash.get("token_hash");
 const status=document.getElementById("status");
 const form=document.getElementById("activateForm");
 if(form)form.hidden=true;
 history.replaceState(null,"",location.pathname);
 status.textContent="이메일 인증을 확인하고 있습니다.";
 try{
  if(!/^(?:[a-fA-F0-9]{56}|[a-fA-F0-9]{64})$/.test(oneTimeHash))
   throw Error("INVALID_RECOVERY_LINK");
  const cfgHtml=await fetch("./index.html",{cache:"no-store"}).then(r=>{
   if(!r.ok)throw Error("APP_CONFIG_UNAVAILABLE");return r.text();
  });
  const authUrl=cfgHtml.match(/SUPABASE_URL:\s*"(https:\/\/[^"]+)"/)?.[1];
  const anon=cfgHtml.match(/SUPABASE_ANON_KEY:\s*"([^"]+)"/)?.[1];
  if(authUrl!=="https://waluhdgqhwjjwmflhrle.supabase.co"||!anon)
   throw Error("APP_AUTH_CONFIG_MISMATCH");
  const result=await fetch(authUrl+"/auth/v1/verify",{
   method:"POST",headers:{apikey:anon,"Content-Type":"application/json"},
   body:JSON.stringify({type:"recovery",token_hash:oneTimeHash})
  });
  const session=await result.json().catch(()=>({}));
  if(!result.ok||!session?.access_token||!session?.refresh_token||!session?.user?.id)
   throw Error("RECOVERY_LINK_INVALID_OR_EXPIRED");
  const entry={version:1,deadline:Date.now()+60*60*1000,
   session:{access_token:session.access_token,refresh_token:session.refresh_token},owner:null};
  sessionStorage.setItem("baekeok_owner_activation_pending_v1",JSON.stringify(entry));
  location.replace("./owner_temp_activation.html");
 }catch(error){
  // Never reissue email automatically and do not expose the OTP to logs/URL.
  status.textContent="이메일 인증에 실패했습니다. 받은편지함의 가장 최근 메일을 확인하세요. ("+
    String(error?.message||"UNKNOWN")+")";
 }
 return;
}
// Supabase Auth verified the mailbox via a recovery link. Route this session
// to the scoped first-login screen; it alone checks a live owner claim.
if(hash.get("type")==="recovery"&&token&&refresh){
 location.replace("./owner_temp_activation.html"+location.hash);
 return;
}
history.replaceState(null,"",location.pathname);
const status=document.getElementById("status"),form=document.getElementById("activateForm");
const resendForm=document.getElementById("recoveryResendForm");

if(error||!token){
 form.hidden=true;
 resendForm.hidden=false;
 const suggested=new URLSearchParams(location.search).get("email");
 if(suggested&&suggested.length<=254)document.getElementById("recoveryEmail").value=suggested;
 status.textContent=error?"기존 인증 링크가 만료됐거나 사용할 수 없습니다. 필요하면 새 메일을 한 번만 요청하고, 가장 최근에 받은 메일의 버튼을 눌러주세요.":"유효한 인증 링크가 없습니다. 새 메일을 요청한 뒤 가장 최근 메일의 버튼을 눌러주세요.";
 resendForm.addEventListener("submit",async e=>{
  e.preventDefault();
  const address=document.getElementById("recoveryEmail").value.trim().toLowerCase();
  const button=document.getElementById("resendRecovery");
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)||address.length>254){
   status.textContent="이메일 주소를 확인하세요.";return;
  }
  button.disabled=true;status.textContent="새 인증 메일을 요청하고 있습니다.";
  try{
   const source=await fetch("./index.html",{cache:"no-cache"}).then(r=>{
    if(!r.ok)throw Error("APP_CONFIG_UNAVAILABLE");return r.text();
   });
   const url=source.match(/SUPABASE_URL:\s*"(https:\/\/[^"]+)"/)?.[1];
   const key=source.match(/SUPABASE_ANON_KEY:\s*"([^"]+)"/)?.[1];
   if(!url||!key)throw Error("APP_CONFIG_UNAVAILABLE");
   const redirect="https://koith.github.io/attendance-proto/owner_activation.html";
   const response=await fetch(url+"/auth/v1/recover?redirect_to="+encodeURIComponent(redirect),{
    method:"POST",
    headers:{apikey:key,"Content-Type":"application/json"},
    body:JSON.stringify({email:address})
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(result.code||result.error_code||result.error||response.status);
   status.textContent="새 인증 메일을 요청했습니다. 받은편지함 또는 스팸함에서 가장 최근에 도착한 메일의 링크를 열어주세요.";
   resendForm.hidden=true;
  }catch(ex){
   status.textContent="메일 요청 실패: "+String(ex.message||ex)+". 잠시 뒤 다시 시도해 주세요.";
   button.disabled=false;
  }
 });
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
  // A canceled/expired or cross-store invite may still have a valid Supabase
  // access token. Refuse any password PUT until scoped server authorization
  // verifies the invite's current owner/delegated status.
  // Native emailed invites are deliberately unprivileged until personal
  // password setup. This scoped preflight runs before the legacy owner and
  // delegated-manager preflight, which only recognizes pre-existing roles.
  const nativeResponse=await fetch(config.url+"/rest/v1/rpc/native_owner_invitation_preflight",{
    method:"POST",headers:{apikey:config.key,Authorization:"Bearer "+token,
      "Content-Type":"application/json"},body:"{}"
  });
  const nativeData=await nativeResponse.json().catch(()=>({}));
  const nativeOwner=nativeResponse.ok&&nativeData?.ok===true&&
    nativeData?.password_change_required===true&&nativeData?.intended_role==="OWNER";
  const preflightResponse=nativeOwner?nativeResponse:
    await fetch(config.url+"/rest/v1/rpc/store_invitation_activation_preflight",{
      method:"POST",headers:{apikey:config.key,Authorization:"Bearer "+token,
        "Content-Type":"application/json"},body:"{}"
    });
  const preflight=nativeOwner?nativeData:await preflightResponse.json().catch(()=>({}));
  if(!preflightResponse.ok||preflight?.ok!==true||
     !Number.isSafeInteger(Number(preflight.store_id))||Number(preflight.store_id)<1||
     !["OWNER","ASSISTANT"].includes(preflight.intended_role))
    throw Error("초대가 취소·만료되었거나 인증이 완료되지 않았습니다. 비밀번호를 변경하지 않았습니다. 본사 또는 대표 관리자에게 새 초대를 요청하세요. ("+
      String(preflight?.message||preflight?.error||"INVITATION_NOT_ACTIVE")+")");
  const change=await fetch(config.url+"/auth/v1/user",{
   method:"PUT",headers:{apikey:config.key,Authorization:"Bearer "+token,
     "Content-Type":"application/json"},body:JSON.stringify({password})
  });
  const updated=await change.json().catch(()=>({}));
  // GoTrue returns 422/same_password when the password was saved but the
  // response or following appointment request was lost. The authenticated
  // preflight above still runs on every attempt; the server appointment and
  // store-context checks below remain mandatory for this idempotent retry.
  if(!change.ok&&!(change.status===422&&updated.code==="same_password"))
    throw Error(updated.msg||updated.message||"PASSWORD_SETUP_FAILED");
  // HQ representative invites are bound to the signed-in user and confirmed email.
  // The server atomically promotes the recipient only when HQ registered the intent.
  // Delegated store-manager invitations have no owner intent and remain delegated.
  const activationRpc=nativeOwner?"native_owner_invitation_complete":"store_primary_owner_accept_invitation";
  const acceptedResponse=await fetch(config.url+"/rest/v1/rpc/"+activationRpc,{
   method:"POST",headers:{apikey:config.key,Authorization:"Bearer "+token,
      "Content-Type":"application/json"},
   body:nativeOwner?JSON.stringify({p_new_password:password}):"{}"
  });
  const accepted=await acceptedResponse.json().catch(()=>({}));
  if(!acceptedResponse.ok||accepted?.ok!==true||(nativeOwner&&accepted?.owner_assigned!==true))
    throw Error("비밀번호 설정은 완료됐지만 대표 관리자 자동 지정 확인에 실패했습니다: "+
      (accepted?.message||accepted?.error||"ACTIVATION_NOT_CONFIRMED")+
      ". 이 페이지에서 다시 시도하거나 본사에 문의하세요.");
  const r=await fetch(config.url+"/rest/v1/rpc/admin_context",{
   method:"POST",headers:{apikey:config.key,Authorization:"Bearer "+token,
      "Content-Type":"application/json"},body:"{}"
  });
  const ctx=await r.json();
  const storeId=Number(ctx?.store_id);
  if(!r.ok||ctx?.role!=="STORE_MANAGER"||!Number.isSafeInteger(storeId)||storeId<1||
     Number(accepted.store_id)!==storeId||Number(preflight.store_id)!==storeId)
    throw Error("점주 권한을 확인할 수 없습니다. 본사에 문의하세요.");
  localStorage.setItem("baekeok_auth",JSON.stringify({
    access_token:token,refresh_token:refresh||"",expires_in:Number(hash.get("expires_in"))||3600
  }));
  document.getElementById("password").value="";
  document.getElementById("repeat").value="";
  location.replace("index.html?mode=store&store="+encodeURIComponent(storeId)+"#admin");
 }catch(e){
  status.textContent="활성화 실패: "+String(e?.message||e);
  button.disabled=false;
 }
};
})();
