import assert from 'node:assert/strict';
import fs from 'node:fs';
const base='https://koith.github.io/attendance-proto';
const expected=fs.readFileSync('index.html','utf8').match(/const APP_VERSION="(v[0-9.]+)"/)?.[1];
assert.ok(expected,'Local deploy version absent');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let html='',version=null,status=null;
for(let attempt=1;attempt<=12;attempt++){
  const uri=base+'/index.html?qa_version='+encodeURIComponent(expected)+'&attempt='+attempt;
  const response=await fetch(uri,{headers:{'Cache-Control':'no-cache'},signal:AbortSignal.timeout(12000)});
  status=response.status;
  html=await response.text();
  version=html.match(/const APP_VERSION="(v[0-9.]+)"/)?.[1];
  if(response.ok&&version===expected)break;
  if(attempt<12)await pause(5000);
}
assert.equal(status,200,'GitHub Pages HTTP status');
assert.equal(version,expected,'GitHub Pages does not serve checked-in app version');
assert.match(html,/id="appVersion"/,'Published app badge missing');
for(const [path,proof] of [
  ['/actual_attendance.js','admin_store_events_with_corrections'],
  ['/operations_reference_ui_v208.js','mountAdminSubnav'],
  ['/qa_browser_app_smoke.mjs','APP_SMOKE_HOST']
]){
  const response=await fetch(base+path+'?qa_version='+encodeURIComponent(expected),{signal:AbortSignal.timeout(12000)});
  assert.equal(response.status,200,'Missing published runtime asset '+path);
  const body=await response.text();
  assert.ok(body.includes(proof),'Published asset does not contain new implementation '+path);
}
const edge=await fetch('https://waluhdgqhwjjwmflhrle.supabase.co/functions/v1/server-sync-sheet',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({mode:'payroll',ym:'2026-10',store_id:1}),
  signal:AbortSignal.timeout(15000)
});
assert.ok([401,403].includes(edge.status),'Unauthenticated production payroll must be denied; got '+edge.status);
console.log('PASS live Pages '+expected+': HTTP 200, matching JS assets, protected production payroll HTTP '+edge.status);
