// QA1243 iPhone Safari OAuth — public STATIC HTML, no privileged backend.
// This function NEVER receives, stores, or forwards Google OAuth tokens or
// GitHub credentials. GitHub Secrets are written ONLY on github.com official UI.
// Independent from operating Google Sheets/Apps Script and attendance DB.
const SECRET_NAME='QA1243_GOOGLE_OAUTH_ACCESS_TOKEN';
const scopeList=[
 'https://www.googleapis.com/auth/userinfo.email',
 'https://www.googleapis.com/auth/script.projects',
 'https://www.googleapis.com/auth/script.deployments',
 'https://www.googleapis.com/auth/drive.metadata.readonly',
 'https://www.googleapis.com/auth/spreadsheets.readonly'
];
const page=`<!doctype html><html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="referrer" content="no-referrer"><title>QA1243 iPhone OAuth</title>
<style nonce="QA1243_NONCE">
:root{font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;color:#142334;background:#f5f7fa}
*{box-sizing:border-box}body{padding:25px 14px 65px;margin:0}.panel{max-width:540px;margin:auto;background:white;border:1px solid #dbe4ef;border-radius:15px;padding:24px 20px}
h1{font-size:22px;margin:0 0 8px}p{font-size:14px;line-height:1.6}label{font-size:13px;font-weight:650;display:block;margin-top:18px;margin-bottom:8px}
input{padding:12px;border:1px solid #aebfd0;border-radius:8px;width:100%;font-size:16px}
button,.link{display:block;width:100%;padding:14px 10px;margin-top:14px;border-radius:9px;text-align:center;font-size:15px;font-weight:650}
button{background:#185cc1;border:0;color:white}button:disabled{opacity:.48}.link{border:1px solid #c6d5e5;color:#155ab0;text-decoration:none}
small{font-size:12px;color:#607081;line-height:1.6;display:block;margin-top:15px}
#status{border-radius:8px;background:#eef2f7;padding:13px;overflow-wrap:anywhere;font-size:13px}
</style>
<script nonce="QA1243_NONCE" src="https://accounts.google.com/gsi/client" async defer></script>
</head><body><main class="panel">
<h1>QA1243 · iPhone 인증</h1>
<p><strong>webuielf@gmail.com</strong> QA 계정 전용 · 10분 세션 · 토큰 복사 한 번</p>
<p>이 페이지는 Google 로그인만 수행하며, 인증정보를 서버·URL·로그로 전송하지 않습니다. GitHub Secret은 반드시 GitHub 공식 화면에서 저장합니다.</p>
<label for="client">QA1243-Isolated 프로젝트의 Google Web OAuth Client ID</label>
<input id="client" type="text" readonly aria-readonly="true" value="293023370445-le7n6lrrbub90i96ol64tt65lss8s6p2.apps.googleusercontent.com" autocomplete="off" autocapitalize="off" spellcheck="false">
<button id="login" type="button">1. QA Google 로그인·동의</button>
<button id="copy" type="button" disabled>2. 인증 토큰 복사 (한 번)</button>
<a class="link" id="github" href="https://github.com/koith/attendance-proto/settings/secrets/actions/new" target="_blank" rel="noopener noreferrer">3. GitHub 공식 Secret 등록 화면</a>
<p id="status" role="status" aria-live="polite">기존 QA OAuth 클라이언트가 자동 입력되었습니다. Google 계정 로그인·동의만 진행하세요.</p>
<small>GitHub 화면에서 Secret 이름: <strong>QA1243_GOOGLE_OAUTH_ACCESS_TOKEN</strong>. 값에는 방금 복사한 토큰만 붙여넣습니다. 이 토큰은 짧은 유효기간을 가집니다. 기존 Windows Refresh Token 도우미는 그대로 유지합니다.</small>
</main>
<script nonce="QA1243_NONCE">
(()=>{
'use strict';
const scopes=QA1243_SCOPE_LIST;
const expected='webuielf@gmail.com';
const deadline=Date.now()+10*60*1000;
const name='QA1243_GOOGLE_OAUTH_ACCESS_TOKEN';
const googleButton=document.getElementById('login');
const copyButton=document.getElementById('copy');
const clientInput=document.getElementById('client');
const status=document.getElementById('status');
let token=null,confirmed=false,used=false;
function note(s){status.textContent=s;}
function expired(){
 if(Date.now()<=deadline)return false;
 token=null;confirmed=false;copyButton.disabled=true;googleButton.disabled=true;
 note('10분 인증 세션이 종료되었습니다. Safari에서 새로고침하세요.');
 return true;
}
googleButton.addEventListener('click',()=>{
 if(expired()||used)return;
 const cid=clientInput.value.trim();
 if(!/^[0-9]+-[A-Za-z0-9_-]+\\.apps\\.googleusercontent\\.com$/.test(cid)){
  note('QA 프로젝트의 Web OAuth Client ID 형식을 확인하세요.');return;
 }
 if(!window.google?.accounts?.oauth2?.initTokenClient){
  note('Google 로그인 모듈이 아직 준비되지 않았습니다. 다시 누르세요.');return;
 }
 googleButton.disabled=true;
 const oauth=google.accounts.oauth2.initTokenClient({
  client_id:cid,scope:scopes.join(' '),login_hint:expected,
  callback:async response=>{
   try{
    if(expired())return;
    if(!response?.access_token||response.error){
     throw Error('GOOGLE_CONSENT_INCOMPLETE');
    }
    const actual=new Set(String(response.scope||'').split(/\\s+/).filter(Boolean));
    if(actual.size!==scopes.length||scopes.some(x=>!actual.has(x))||
       !google.accounts.oauth2.hasGrantedAllScopes(response,...scopes))
       throw Error('GOOGLE_SCOPE_MISMATCH');
    if(Number(response.expires_in)<1800)throw Error('GOOGLE_TOKEN_TOO_SHORT');
    // Google userinfo uses an Authorization header; no token in URL or query.
    const result=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{
      headers:{Authorization:'Bearer '+response.access_token},
      cache:'no-store',redirect:'error'
    });
    if(!result.ok)throw Error('GOOGLE_USERINFO_UNAVAILABLE');
    const profile=await result.json();
    if(String(profile.email||'').toLowerCase()!==expected||
       profile.email_verified!==true)
       throw Error('GOOGLE_ACCOUNT_NOT_QA_OWNER');
    token=response.access_token;confirmed=true;copyButton.disabled=false;
    note('QA 계정과 정확한 5개 권한 확인 완료. 2번 버튼으로 토큰을 복사하세요.');
   }catch(error){
    token=null;confirmed=false;copyButton.disabled=true;
    note('인증 실패: '+String(error?.message||'GOOGLE_ERROR'));
    googleButton.disabled=false;
   }
  },
  error_callback:()=>{
   googleButton.disabled=false;note('Google 팝업이 취소되거나 차단되었습니다.');
  }
 });
 oauth.requestAccessToken({prompt:'consent'});
});
copyButton.addEventListener('click',async()=>{
 if(expired()||!confirmed||used||!token)return;
 try{
  await navigator.clipboard.writeText(token);
  used=true;token=null;confirmed=false;
  copyButton.disabled=true;googleButton.disabled=true;
  note('복사 완료. 3번 GitHub 공식 화면에서 이름 '+name+'을 입력하고 값 붙여넣기 후 저장하세요. 토큰은 더 이상 이 페이지에 보관되지 않습니다.');
 }catch{
  note('Safari 클립보드 쓰기가 거부되었습니다. 브라우저 권한을 확인한 후 다시 누르세요.');
 }
});
})();
</script></body></html>`;
function pageResponse(req:Request){
 // Query parameters are ignored: this public GET endpoint serves only fixed HTML.
 // No URL parameter is reflected, parsed into the page, or used as a token.
 const bytes=crypto.getRandomValues(new Uint8Array(16));
 const nonce=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 const html=page.replaceAll('QA1243_NONCE',nonce).replace('QA1243_SCOPE_LIST',JSON.stringify(scopeList));
 return new Response(html,{status:200,headers:{...headers(nonce),'Content-Type':'text/html; charset=utf-8'}});
}
function headers(nonce:string){
 return {
  'Cache-Control':'no-store, no-cache, private, max-age=0',
  'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY','Cross-Origin-Opener-Policy':'same-origin-allow-popups',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':[
   "default-src 'none'","frame-ancestors 'none'","base-uri 'none'","form-action 'none'",
   "script-src 'nonce-"+nonce+"' https://accounts.google.com/gsi/client https://accounts.google.com/gsi/",
   "style-src 'nonce-"+nonce+"' https://accounts.google.com/gsi/",
   "connect-src https://www.googleapis.com https://accounts.google.com",
   "frame-src https://accounts.google.com"
  ].join('; ')
 };
}
Deno.serve((req:Request)=>{
 if(req.method!=='GET')return new Response('QA1243_READ_ONLY_PAGE',{status:405,headers:headers('disabled')});
 return pageResponse(req);
});
