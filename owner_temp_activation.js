/* First-login temp owner flow. No service secrets or credentials are embedded.
 * The unprivileged Auth user has NO admin_users membership until its own
 * password is updated and the server verifies the change, then assigns owner. */
(async function(){
"use strict";
const status=document.getElementById("status");
const form=document.getElementById("firstLoginForm");
const button=document.getElementById("confirm");
const description=document.getElementById("storeDescription");
const saved=(()=>{try{return JSON.parse(localStorage.getItem("baekeok_auth")||"null")}catch{return null}})();
if(!saved?.access_token){
 status.textContent="로그인 정보가 없습니다. 먼저 지점 관리자 로그인 화면에서 이메일과 임시 비밀번호로 로그인하세요.";
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
  Authorization:"Bearer "+String(token||saved.access_token)};
 const r=await fetch(cfg.url+path,{method,headers,...(body===undefined?{}:{body:JSON.stringify(body)})});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(String(data.message||data.msg||data.error_description||data.code||r.status));
 return data;
};
try{
 identity=await call("/auth/v1/user","GET",undefined);
 claim=await call("/rest/v1/rpc/store_owner_temp_preflight","POST",{});
 if(claim?.ok!==true||claim?.password_change_required!==true||
   !Number.isSafeInteger(Number(claim.store_id))||Number(claim.store_id)<=0||
   String(identity?.email||"").toLowerCase()!==String(claim.email||"").toLowerCase())
    throw Error("TEMP_OWNER_IDENTITY_MISMATCH");
 description.textContent=claim.email+" · 지점 번호 "+claim.store_id+" · 임시 비밀번호 만료 "+new Date(claim.expires_at).toLocaleString("ko-KR");
 status.textContent="본인 비밀번호를 설정하면 지점 대표 관리자 권한이 활성화됩니다.";
 form.hidden=false;
}catch(e){
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
  await call("/auth/v1/user","PUT",{password});
  const accepted=await call("/rest/v1/rpc/store_owner_temp_complete","POST",{});
  if(accepted?.ok!==true||accepted?.owner_assigned!==true||Number(accepted.store_id)!==Number(claim.store_id))
    throw Error("OWNER_ACTIVATION_UNVERIFIED");
  const session=await call("/auth/v1/token?grant_type=password","POST",{email:identity.email,password});
  if(!session?.access_token||!session?.refresh_token||session.user?.id!==identity.id)
    throw Error("NEW_PASSWORD_LOGIN_NOT_VERIFIED");
  const context=await call("/rest/v1/rpc/admin_context","POST",{},session.access_token);
  if(context?.role!=="STORE_MANAGER"||Number(context.store_id)!==Number(claim.store_id))
    throw Error("STORE_OWNER_ROLE_NOT_VERIFIED");
  localStorage.setItem("baekeok_auth",JSON.stringify(session));
  status.textContent="개통 완료. 지점 관리 화면으로 이동합니다.";
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
