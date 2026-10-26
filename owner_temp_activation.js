/* First-login temp owner flow. No service secrets or credentials are embedded.
 * The unprivileged Auth user has NO admin_users membership until its own
 * password is updated and the server verifies the change, then assigns owner. */
(async function(){
"use strict";
const status=document.getElementById("status");
const form=document.getElementById("firstLoginForm");
const button=document.getElementById("confirm");
const description=document.getElementById("storeDescription");
const callback=new URLSearchParams(location.hash.slice(1));
const recoverySession=callback.get("type")==="recovery"&&callback.get("access_token")&&callback.get("refresh_token")
 ? {access_token:callback.get("access_token"),refresh_token:callback.get("refresh_token")} : null;
const pendingKey="baekeok_owner_activation_pending_v1";
const pendingLifetime=60*60*1000;
const forgetPending=()=>{try{sessionStorage.removeItem(pendingKey);}catch{}};
const pending=(()=>{
 try{
  const entry=JSON.parse(sessionStorage.getItem(pendingKey)||"null");
  if(entry?.version===1&&typeof entry.session?.access_token==="string"&&
    Number.isFinite(entry.deadline)&&entry.deadline>Date.now()&&
    entry.deadline<=Date.now()+pendingLifetime)return entry;
 }catch{}
 forgetPending();return null;
})();
let saved=recoverySession||pending?.session||(()=>{try{return JSON.parse(localStorage.getItem("baekeok_auth")||"null")}catch{return null}})();
let ownerBoundary=recoverySession?null:pending?.owner||null;
let pendingDeadline=recoverySession?Date.now()+pendingLifetime:pending?.deadline||Date.now()+pendingLifetime;
function rememberPending(){
 if(!saved?.access_token)return;
 try{sessionStorage.setItem(pendingKey,JSON.stringify({version:1,deadline:pendingDeadline,
  session:{access_token:saved.access_token,refresh_token:saved.refresh_token},owner:ownerBoundary}));}catch{}
}
// Keep the redeemed session in this tab before removing the one-use URL.
// Never replace an existing HQ/main-app session before verified owner login.
if(recoverySession)rememberPending();
if(recoverySession)history.replaceState(null,"",location.pathname);
if(!saved?.access_token){
 status.textContent="로그인 정보가 없습니다. 점주 개통 메일 또는 비밀번호 재설정 메일의 최신 링크를 열어주세요.";
 return;
}
let cfg=null, identity=null, claim=null;
try{
 const response=await fetch("./index.html",{cache:"no-store"});
 if(!response.ok)throw Error("APP_CONFIG_UNAVAILABLE");
 const source=await response.text();
 const url=source.match(/SUPABASE_URL:\s*"(https:\/\/[^"]+)"/)?.[1];
 const key=source.match(/SUPABASE_ANON_KEY:\s*"([^"]+)"/)?.[1];
 if(!url||!key)throw Error("APP_CONFIG_UNAVAILABLE");
 cfg={url,key};
}catch{
 status.textContent="계정 설정을 불러올 수 없습니다. 본사에 문의하세요.";
 return;
}
const call=async(path,method,body,token)=>{
 const headers={apikey:cfg.key,"Content-Type":"application/json",
  ...(token===false?{}:{Authorization:"Bearer "+String(token||saved.access_token)})};
 const r=await fetch(cfg.url+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await r.json().catch(()=>({}));
 if(!r.ok){const error=Error(String(data.message||data.msg||data.error_description||data.code||r.status));error.status=r.status;throw error;}
 return data;
};
async function verifyOwner(){
 identity=await call("/auth/v1/user","GET",undefined);
 if(ownerBoundary?.user_id&&identity?.id!==ownerBoundary.user_id)
   throw Error("TEMP_OWNER_IDENTITY_MISMATCH");
 claim=await call("/rest/v1/rpc/store_owner_temp_preflight","POST",{});
 if(claim?.ok!==true||claim?.password_change_required!==true||
   !Number.isSafeInteger(Number(claim.store_id))||Number(claim.store_id)<=0||
   String(identity?.email||"").toLowerCase()!==String(claim.email||"").toLowerCase()||
   (ownerBoundary?.store_id&&Number(ownerBoundary.store_id)!==Number(claim.store_id)))
    throw Error("TEMP_OWNER_IDENTITY_MISMATCH");
 ownerBoundary={user_id:identity.id,store_id:Number(claim.store_id)};
 pendingDeadline=Math.min(pendingDeadline,Date.parse(claim.expires_at));
 if(!Number.isFinite(pendingDeadline)||pendingDeadline<=Date.now())throw Error("TEMP_OWNER_CREDENTIAL_EXPIRED");
 rememberPending();
}
async function refreshOwnerSession(){
 if(!saved?.refresh_token)throw Error("OWNER_SESSION_EXPIRED");
 const fresh=await call("/auth/v1/token?grant_type=refresh_token","POST",{refresh_token:saved.refresh_token},false);
 const expected=ownerBoundary?.user_id||identity?.id;
 if(!fresh?.access_token||!fresh?.refresh_token||!fresh.user?.id||
   (expected&&fresh.user.id!==expected))throw Error("TEMP_OWNER_IDENTITY_MISMATCH");
 saved={access_token:fresh.access_token,refresh_token:fresh.refresh_token};
 rememberPending();
}
try{
 try{await verifyOwner();}
 catch(error){
  if(error.status!==401)throw error;
  try{await refreshOwnerSession();}catch(refreshError){forgetPending();throw refreshError;}
  await verifyOwner();
 }
 description.textContent=claim.email+" · 지점 번호 "+claim.store_id+" · 임시 비밀번호 만료 "+new Date(claim.expires_at).toLocaleString("ko-KR");
 status.textContent="본인 비밀번호를 설정하면 지점 대표 관리자 권한이 활성화됩니다.";
 form.hidden=false;
}catch(e){
 if(e?.status===401||/TEMP_OWNER_|NO_TEMP_OWNER_INVITATION|AUTH_IDENTITY|OWNER_SESSION_EXPIRED/.test(String(e?.message||e)))forgetPending();
 status.textContent="최초 로그인 활성화 불가: "+String(e?.message||e)+". 만료되었거나 초대가 없으면 본사에 재발급을 요청하세요.";
}
form.addEventListener("submit",async event=>{
 event.preventDefault();button.disabled=true;
 const password=document.getElementById("password").value;
 const repeat=document.getElementById("repeat").value;
 try{
  if(!identity||!claim)throw Error("FIRST_LOGIN_NOT_VERIFIED");
  if(password.length<12||password!==repeat)throw Error("비밀번호는 12자 이상으로 두 번 동일하게 입력하세요.");
  status.textContent="새 비밀번호와 관리자 권한을 확인하고 있습니다.";
  // GoTrue refuses reusing the current temporary password.
  // A timeout or lost response can occur after GoTrue already saved the new
  // password. Retrying with the same chosen password yields 422/same_password.
  // This is safe to continue ONLY because store_owner_temp_complete independently
  // verifies the current GoTrue password and that the temporary hash changed.
  const update=await fetch(cfg.url+"/auth/v1/user",{
   method:"PUT",headers:{apikey:cfg.key,"Content-Type":"application/json",
    Authorization:"Bearer "+saved.access_token},body:JSON.stringify({password})
  });
  const updateResult=await update.json().catch(()=>({}));
  const savedAlready=update.status===422&&
   (updateResult.code==="same_password"||updateResult.error_code==="same_password");
  if(!update.ok&&!savedAlready)
   throw Error(String(updateResult.message||updateResult.msg||
    updateResult.error_description||updateResult.code||update.status));
  const accepted=await call("/rest/v1/rpc/store_owner_temp_complete","POST",{p_new_password:password});
  if(accepted?.ok!==true||accepted?.owner_assigned!==true||Number(accepted.store_id)!==Number(claim.store_id))
    throw Error("OWNER_ACTIVATION_UNVERIFIED");
  const session=await call("/auth/v1/token?grant_type=password","POST",{email:identity.email,password});
  if(!session?.access_token||!session?.refresh_token||session.user?.id!==identity.id)
    throw Error("NEW_PASSWORD_LOGIN_NOT_VERIFIED");
  const context=await call("/rest/v1/rpc/admin_context","POST",{},session.access_token);
  if(context?.role!=="STORE_MANAGER"||Number(context.store_id)!==Number(claim.store_id))
    throw Error("STORE_OWNER_ROLE_NOT_VERIFIED");
  localStorage.setItem("baekeok_auth",JSON.stringify(session));
  forgetPending();
  status.textContent="대표 관리자 등록 완료. 지점 개통은 본사 승인이 필요합니다.";
  location.replace("./index.html?mode=store&store="+encodeURIComponent(claim.store_id)+"#pos");
 }catch(e){
  status.textContent="처리 실패: "+String(e?.message||e)+". 비밀번호 설정은 완료됐을 수 있으니 본사에 문의하세요.";
  button.disabled=false;
 }finally{
  document.getElementById("password").value="";
  document.getElementById("repeat").value="";
 }
});
})();
