/* QA1243 transactional first-login email; no browser/service secrets.
 * Requires RESEND_API_KEY and OWNER_INVITE_FROM_EMAIL configured on Edge.
 * A provider acceptance ID is not proof of recipient inbox delivery. */
const LINK_BASE="https://koith.github.io/attendance-proto/index.html";
const escapeHtml=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const escapeAttr=escapeHtml;
export function ownerOnboardingMail({storeName,storeId,email,temporaryPassword,expiresAt}){
 if(!Number.isSafeInteger(Number(storeId))||Number(storeId)<1)throw Error("INVALID_STORE");
 if(typeof temporaryPassword!=="string"||temporaryPassword.length<12)throw Error("MISSING_TEMP_CREDENTIAL");
 const link=LINK_BASE+"?mode=store&store="+encodeURIComponent(String(storeId))+"#admin";
 const title="백억커피 점주 계정 개통 안내";
 const name=escapeHtml(storeName),address=escapeHtml(email),password=escapeHtml(temporaryPassword);
 const expiry=escapeHtml(new Intl.DateTimeFormat("ko-KR",{
  timeZone:"Asia/Seoul",dateStyle:"medium",timeStyle:"short"
 }).format(new Date(expiresAt)));
 const text=[
 "백억커피 점주 계정 개통 안내","","안녕하세요. "+storeName+" 지점 관리자로 초대되었습니다.",
 "관리자 로그인 이메일: "+email,"임시 비밀번호: "+temporaryPassword,
 "최초 로그인 주소: "+link,
 "임시 비밀번호 유효기간: "+expiry+" (한국 시간)",
 "1. 위 주소를 열어 이메일 및 임시 비밀번호로 로그인합니다.",
 "2. 표시되는 최초 로그인 화면에서 본인이 사용할 새 비밀번호(12자 이상)를 설정합니다.",
 "3. 변경이 확인된 후 지점 대표 관리자 권한이 활성화됩니다.",
 "",
 "이 메일을 요청하지 않았다면 임시 비밀번호를 사용하지 말고 본사에 문의하세요.",
 "임시 비밀번호를 외부에 전달하지 마세요. 링크 주소에는 비밀번호가 포함되지 않습니다.",
 "백억커피 운영 시스템"
 ].join("\n");
 const html='<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'+
 '<body style="margin:0;padding:32px 12px;background:#f4f6f5;font-family:Arial,Apple SD Gothic Neo,Malgun Gothic,sans-serif;color:#182922;">'+
 '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;background:#f4f6f5"><tr><td align="center">'+
 '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:560px;border:1px solid #dfe6e0;border-radius:16px;background:#fff;overflow:hidden">'+
 '<tr><td style="background:#154a30;padding:25px 30px"><div style="color:#cde7d7;font-size:12px;font-weight:700;letter-spacing:2px">BAEKEOK COFFEE</div>'+
 '<div style="color:#fff;font-size:25px;line-height:1.35;font-weight:800;margin-top:6px">백억커피</div></td></tr>'+
 '<tr><td style="padding:32px 30px">'+
 '<div style="font-size:12px;color:#27724a;font-weight:700;letter-spacing:1px">STORE MANAGER ONBOARDING</div>'+
 '<h1 style="font-size:23px;line-height:1.45;color:#142c1d;margin:12px 0 15px">'+escapeHtml(title)+'</h1>'+
 '<p style="font-size:15px;line-height:1.8;color:#536157;margin:0 0 22px">'+name+'의 대표 관리자 계정이 준비되었습니다.<br>아래 임시 비밀번호로 처음 로그인한 후 본인 비밀번호를 설정해 주세요.</p>'+
 '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;background:#f3f7f4;border:1px solid #d9e6dd;border-radius:10px;padding:18px">'+
 '<tr><td style="padding:10px;font-size:12px;color:#65766a;width:120px">로그인 이메일</td><td style="padding:10px;font-size:14px;color:#13281c;font-weight:700;overflow-wrap:anywhere">'+address+'</td></tr>'+
 '<tr><td style="padding:10px;font-size:12px;color:#65766a">임시 비밀번호</td><td style="padding:10px;font-size:17px;font-weight:800;font-family:Consolas,monospace;letter-spacing:.6px;color:#154a30;overflow-wrap:anywhere">'+password+'</td></tr>'+
 '<tr><td style="padding:10px;font-size:12px;color:#65766a">사용 기한</td><td style="padding:10px;font-size:14px;color:#13281c">'+expiry+'까지</td></tr>'+
 '</table>'+
 '<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr><td align="center" style="padding:26px 0 16px">'+
 '<a href="'+escapeAttr(link)+'" style="background:#177044;padding:15px 20px;display:inline-block;color:#fff;font-size:16px;font-weight:700;border-radius:9px;text-decoration:none">최초 로그인 및 비밀번호 설정</a>'+
 '</td></tr></table>'+
 '<p style="text-align:center;margin:0 0 24px;font-size:12px;color:#687c6c">버튼이 열리지 않으면 아래 주소를 복사하세요.<br><a href="'+escapeAttr(link)+'" style="color:#177044;overflow-wrap:anywhere">'+escapeHtml(link)+'</a></p>'+
 '<div style="border-top:1px solid #e8eee9;padding-top:21px">'+
 '<p style="font-size:14px;font-weight:800;color:#264533;margin:0 0 8px">처음 로그인하는 방법</p>'+
 '<p style="font-size:14px;line-height:1.8;color:#526558;margin:0">① 이메일과 임시 비밀번호 입력<br>② 새 비밀번호(12자 이상) 설정<br>③ 대표 관리자 기능 자동 활성화</p>'+
 '</div></td></tr>'+
 '<tr><td style="background:#f7faf8;border-top:1px solid #e1eae4;padding:19px 30px;font-size:12px;line-height:1.65;color:#6a7a70">'+
 '본인이 요청한 개통이 아니라면 로그인하지 말고 본사에 문의해 주세요.<br>보안을 위해 임시 비밀번호를 다른 사람에게 전달하지 마세요.'+
 '</td></tr></table></td></tr></table></body></html>';
 return {subject:"[백억커피] "+storeName+" 점주 계정 개통 안내",html,text,loginUrl:link};
}
export async function sendOwnerOnboardingEmail({storeName,storeId,email,temporaryPassword,expiresAt,issuanceId},options={}){
 const env=options.env||Deno.env;
 const apiKey=env.get("RESEND_API_KEY")||"";
 const from=env.get("OWNER_INVITE_FROM_EMAIL")||"";
 if(!apiKey||!from||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)){
  throw Error("OWNER_INVITE_EMAIL_NOT_CONFIGURED");
 }
 const built=ownerOnboardingMail({storeName,storeId,email,temporaryPassword,expiresAt});
 const transport=options.fetch||fetch;
 let res;
 try{
  res=await transport("https://api.resend.com/emails",{
   method:"POST",
   headers:{"Authorization":"Bearer "+apiKey,"Content-Type":"application/json",
    "Idempotency-Key":"owner-onboard-"+String(issuanceId)},
   body:JSON.stringify({from:"백억커피 <"+from+">",to:[email],subject:built.subject,
    html:built.html,text:built.text})
  });
 }catch{throw Error("OWNER_INVITE_MAIL_UNCERTAIN")}
 const data=await res.json().catch(()=>({}));
 if(!res.ok){
  if(res.status>=500||res.status===429||res.status===408)throw Error("OWNER_INVITE_MAIL_UNCERTAIN");
  throw Error("OWNER_INVITE_MAIL_REJECTED");
 }
 if(!data?.id||typeof data.id!=="string")throw Error("OWNER_INVITE_MAIL_UNCERTAIN");
 return {messageId:data.id,delivery:"EMAIL_ACCEPTED"};
}
