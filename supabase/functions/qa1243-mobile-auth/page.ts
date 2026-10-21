// Isolated Safari page. No Client Secret or GitHub token is embedded.
export function htmlPage(nonce: string): string {
 return HTML.replaceAll('QA1243_SCRIPT_NONCE',nonce);
}
const HTML = `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="referrer" content="no-referrer"><title>QA1243 Mobile OAuth</title>
<style nonce="QA1243_SCRIPT_NONCE">
:root{font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif;background:#f4f6f8;color:#151c24}*{box-sizing:border-box}
body{margin:0;padding:28px 16px 60px}.panel{max-width:540px;margin:0 auto;background:white;padding:25px 20px;border-radius:16px;border:1px solid #d9e1e8}
h1{font-size:23px;margin:0 0 12px}p{line-height:1.6;font-size:14px}.caption{color:#536371}
label{display:block;margin:16px 0 6px;font-size:14px;font-weight:600}
input{font:inherit;display:block;width:100%;padding:12px;border:1px solid #a7b4c0;border-radius:8px;font-size:16px}
button{width:100%;padding:15px 10px;border:0;border-radius:9px;background:#145ec9;color:white;margin-top:20px;font-weight:700;font-size:16px}
button:disabled{opacity:.5}.status{padding:12px;margin-top:18px;background:#f2f4f8;border-radius:7px;font-size:13px;overflow-wrap:anywhere}
.note{font-size:12px;line-height:1.6;margin-top:18px;color:#495565}
</style><script nonce="QA1243_SCRIPT_NONCE" src="https://accounts.google.com/gsi/client" async defer></script>
</head><body><main class="panel"><h1>QA1243 모바일 인증</h1>
<p class="caption">QA 계정 <strong>webuielf@gmail.com</strong> 전용 · 단 한 번 사용 · 10분 제한</p>
<p>Google 로그인과 GitHub 권한 확인 후 QA용 단기 토큰만 GitHub Secrets에 등록합니다. 운영 시트는 사용하지 않습니다.</p>
<label for="client">QA1243-Isolated Google Web OAuth Client ID</label>
<input id="client" type="text" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="숫자-…apps.googleusercontent.com">
<label for="gh">koith/attendance-proto 전용 GitHub fine-grained PAT (1일 만료)</label>
<input id="gh" type="password" autocapitalize="off" autocomplete="off" spellcheck="false" placeholder="이 페이지에만 입력">
<p class="note">GitHub PAT은 <strong>이 저장소 하나</strong>, Secrets 쓰기·Actions 쓰기·Metadata 읽기 권한만 허용합니다.</p>
<button id="start" type="button">QA Google 로그인·동의 후 등록</button>
<p role="status" aria-live="polite" class="status" id="status">준비 완료. 토큰과 비밀번호는 저장되지 않습니다.</p>
<p class="note">이 페이지는 Refresh Token을 발급하지 않습니다. 일회성 Access Token으로 QA 재검증을 즉시 요청합니다. 금요일 개통 판정은 별도입니다.</p>
</main><script nonce="QA1243_SCRIPT_NONCE">
(()=>{
'use strict';
const allowed=[
 'https://www.googleapis.com/auth/userinfo.email',
 'https://www.googleapis.com/auth/script.projects',
 'https://www.googleapis.com/auth/script.deployments',
 'https://www.googleapis.com/auth/drive.metadata.readonly',
 'https://www.googleapis.com/auth/spreadsheets.readonly'
];
const expected='webuielf@gmail.com';
const button=document.getElementById('start');
const status=document.getElementById('status');
const cid=document.getElementById('client');
const github=document.getElementById('gh');
let submitted=false;
function result(message){status.textContent=message;}
button.addEventListener('click',()=>{
 if(submitted)return;
 const clientId=cid.value.trim();
 if(!/^[0-9]+-[A-Za-z0-9_-]+\\.apps\\.googleusercontent\\.com$/.test(clientId)){
  result('QA 프로젝트의 Web OAuth Client ID를 확인하세요.');return;
 }
 if(!/^github_pat_[A-Za-z0-9_]+$/.test(github.value.trim())){
  result('해당 저장소용 GitHub fine-grained PAT가 필요합니다.');return;
 }
 if(!window.google?.accounts?.oauth2?.initTokenClient){
  result('Google OAuth 스크립트가 로드되지 않았습니다. Safari에서 다시 여세요.');return;
 }
 button.disabled=true;
 result('Google 승인 화면에서 '+expected+' 계정만 선택하세요.');
 const oauth=google.accounts.oauth2.initTokenClient({
  client_id:clientId,scope:allowed.join(' '),login_hint:expected,
  callback:async response=>{
   if(!response?.access_token || response.error){
    button.disabled=false;result('Google 동의가 완료되지 않았습니다.');return;
   }
   if(!google.accounts.oauth2.hasGrantedAllScopes(response,...allowed)){
    button.disabled=false;result('필수 5개 권한 동의가 누락되었습니다.');return;
   }
   if(submitted)return;
   submitted=true;
   const ghToken=github.value.trim();github.value='';cid.value='';
   try{
    result('Google 계정과 GitHub 저장소 권한을 검증하는 중입니다.');
    const res=await fetch(location.pathname,{
     method:'POST',credentials:'same-origin',cache:'no-store',
     headers:{'Content-Type':'application/json','X-QA1243-Mobile':'1'},
     body:JSON.stringify({googleAccessToken:response.access_token,
       googleClientId:clientId,githubToken:ghToken})
    });
    const reply=await res.json();
    if(!res.ok || reply.ok!==true){
     result('등록되지 않았습니다: '+String(reply.code||'QA1243_MOBILE_REGISTRATION_FAILED'));
     return;
    }
    result('GitHub Actions Secret 등록 완료 · QA 재실행 요청됨: '+String(reply.runUrl||''));
   }catch{
    result('네트워크 또는 서버 검증 실패. 토큰은 보관하지 않았습니다. 새로고침 후 재시도하세요.');
   }
  },error_callback:()=>{
   button.disabled=false;result('Google 팝업이 닫히거나 차단되었습니다. Safari에서 다시 누르세요.');
  }
 });
 oauth.requestAccessToken({prompt:'consent'});
});
})();
</script></body></html>`;
