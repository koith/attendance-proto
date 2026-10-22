// QA1243 public Safari OAuth page - REAL remote HTTP smoke.
// No Supabase API key, Google token, GitHub secret, operating DB/Sheet access.
// Run on trusted main push independently of the Google E2E credential gate.
import assert from 'node:assert/strict';

const address='https://waluhdgqhwjjwmflhrle.supabase.co/functions/v1/qa1243-mobile-auth';
const options={redirect:'error',signal:AbortSignal.timeout(20000)};
const check=async(method,url=address)=>{
 const response=await fetch(url,{...options,method,headers:{
  'Accept':'text/html, text/plain;q=0.8',
  // Never send cookies, Authorization, project service keys, or account tokens.
 }});
 const body=await response.text();
 return {response,body};
};

const first=await check('GET');
assert.equal(first.response.status,200,'Public QA-only GET should be accessible without credentials');
// Supabase shared-domain gateway deliberately rewrites HTML to text/plain.
// This endpoint is only a diagnostic shell, NOT the working Safari OAuth page.
assert.match(first.response.headers.get('content-type')||'',/^text\/plain/i);
assert.match(first.response.headers.get('cache-control')||'',/no-store/);
assert.equal(first.response.headers.get('x-frame-options'),'DENY');
assert.equal(first.response.headers.get('referrer-policy'),'no-referrer');
const csp=first.response.headers.get('content-security-policy')||'';
// Supabase shared domains override user-supplied HTML response CSP with
// sandbox; this intentionally confirms the endpoint CANNOT host OAuth UI.
// Browser-friendly HTML is only at the independently verified GitHub Pages
// /qa1243-safari/ static path; do not weaken Supabase platform security.
assert.match(csp,/default-src 'none'; sandbox/);
assert.ok(!first.body.includes('QA1243_NONCE'),'Template nonce must be substituted');
assert.ok(!first.body.includes('QA1243_SCOPE_LIST'),'OAuth scope placeholder must be substituted');
assert.match(first.body,/google\.accounts\.oauth2\.initTokenClient/);
assert.match(first.body,/webuielf@gmail\.com/);
assert.match(first.body,/QA1243_GOOGLE_OAUTH_ACCESS_TOKEN/);
assert.match(first.body,/https:\/\/github\.com\/koith\/attendance-proto\/settings\/secrets\/actions\/new/);
assert.doesNotMatch(first.body,/github_pat_|SUPABASE_SERVICE_ROLE_KEY|localStorage|sessionStorage|api\.github\.com/);
// Reject accidental real Google OAuth access/refresh/client-secret values in the
// public diagnostic HTML, even if the variable names have been obfuscated.
assert.doesNotMatch(first.body,/(?:ya29\\.[A-Za-z0-9_-]{20,}|1\\/\\/[A-Za-z0-9_-]{24,}|GOCSPX-[A-Za-z0-9_-]{12,})/,
 'Public diagnostic must never embed credential-shaped Google token values');
const nonce=(first.body.match(/<script nonce="([a-z0-9]{32})">/)||[])[1];
assert.ok(nonce,'Shipped inline script must have random nonce');
assert.ok(!csp.includes("'nonce-"+nonce+"'"),'Supabase sandbox CSP must block inline OAuth even with nonce');
const again=await check('GET');
const next=(again.body.match(/<script nonce="([a-z0-9]{32})">/)||[])[1];
assert.equal(again.response.status,200);
assert.ok(next && next!==nonce,'Nonce must rotate per page load');

const post=await check('POST');
assert.equal(post.response.status,405,'Public QA function must not accept POST');
assert.equal(post.body,'QA1243_READ_ONLY_PAGE');
const query=await check('GET',address+'?qa1243_http_smoke=read_only');
assert.equal(query.response.status,400,'URL query must be rejected before rendering');
assert.equal(query.body,'QA1243_QUERY_NOT_ALLOWED');

console.log('QA1243_SUPABASE_HTML_RENDER_BLOCK_CONFIRMED '+JSON.stringify({
 function:'qa1243-mobile-auth',get:200,contentType:'text/plain',cspSandbox:true,post:405,query:400,notSafariPage:true,
 independentNonces:true,credentialless:true,
 oauthOwner:'webuielf@gmail.com',noOperatingWrite:true
}));