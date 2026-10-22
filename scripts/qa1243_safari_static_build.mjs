// Build an isolated static iPhone Safari page for the existing GitHub Pages site.
// Transform the reviewed QA-only HTML, JS and CSS into external CSP-restricted
// files. Never touch operating app source, Google Sheets, or DB.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import {QA1243_RUNNER_SCOPES} from './qa1243_oauth_scopes.mjs';

const source=readFileSync('supabase/functions/qa1243-mobile-auth/index.ts','utf8');
const begin=source.indexOf('const page='+String.fromCharCode(96));
const end=source.indexOf('\nfunction pageResponse(',begin);
assert.ok(begin>=0&&end>begin,'QA1243 HTML source contract changed');
const sandbox={};
vm.runInNewContext(source.slice(begin,end)+'\nthis.qaPage=page;',sandbox,{timeout:1000});
let html=String(sandbox.qaPage);
const style=html.match(/<style nonce="QA1243_NONCE">([\s\S]+?)<\/style>/);
const inline=html.match(/<script nonce="QA1243_NONCE">([\s\S]+?)<\/script><\/body>/);
assert.ok(style?.[1]&&inline?.[1],'QA1243 embedded JS/style anchors changed');
const sdk='<script nonce="QA1243_NONCE" src="https://accounts.google.com/gsi/client" async defer></script>';
assert.ok(html.includes(sdk),'Expected reviewed Google Identity Services SDK');
assert.ok(html.includes('QA1243_SCOPE_LIST'));
assert.ok(!html.includes('localStorage')&&!html.includes('sessionStorage'));
assert.ok(!html.includes('api.github.com')&&!html.includes('Deno.env'));
let script="// Refuse Google OAuth in frames (static Pages cannot set frame-ancestors header).\n"+
 "if(window.top!==window.self)throw new Error('QA1243_IFRAMED_OAUTH_BLOCKED');\n"+
 inline[1].replaceAll('QA1243_SCOPE_LIST',JSON.stringify(QA1243_RUNNER_SCOPES));
script=script.replace("throw Error('GOOGLE_SCOPE_MISMATCH');", "throw Error('GOOGLE_SCOPE_MISMATCH missing='+scopes.filter(x=>!actual.has(x)).map(x=>x.split('/').pop()).join(',')+' extra='+[...actual].filter(x=>!scopes.includes(x)).map(x=>x.split('/').pop()).join(','));");
assert.ok(script.includes("expected='webuielf@gmail.com'"));
assert.ok(script.includes("navigator.clipboard.writeText(token)"));
assert.ok(!script.includes('QA1243_SCOPE_LIST'));
const css=style[1];
// Public QA Web client identifier, not an authentication credential.
const qaWebClientId='293023370445-le7n6lrrbub90i96ol64tt65lss8s6p2.apps.googleusercontent.com';
const clientPlaceholder='placeholder="숫자-...apps.googleusercontent.com"';
assert.ok(html.includes(clientPlaceholder),'QA input anchor changed');
html=html.replace(clientPlaceholder,clientPlaceholder+' value="'+qaWebClientId+'" readonly');
html=html.replace(style[0],'<link rel="stylesheet" href="./style.css">');
html=html.replace(sdk,'<script src="https://accounts.google.com/gsi/client" async defer></script>');
html=html.replace(inline[0],'<script src="./oauth.js" defer></script></body>');
const csp="default-src 'none'; script-src 'self' https://accounts.google.com/gsi/client https://accounts.google.com/gsi/; style-src 'self'; connect-src https://www.googleapis.com https://accounts.google.com; frame-src https://accounts.google.com; img-src https://accounts.google.com data:; base-uri 'none'; object-src 'none'; form-action 'none'";
html=html.replace('<meta charset="utf-8">','<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'+csp+'">');
assert.ok(html.includes('<meta name="referrer" content="no-referrer">'));
assert.ok(html.includes('<script src="./oauth.js" defer></script>'));
assert.ok(!html.includes('QA1243_NONCE')&&!html.includes('QA1243_SCOPE_LIST'));
assert.doesNotMatch(html,/<script>([\s\S]*?)<\/script>/i);
assert.doesNotMatch(html,/<style>([\s\S]*?)<\/style>/i);
assert.ok(csp.includes("default-src 'none'")&&!csp.includes("'unsafe-inline'"));
const output='qa1243-safari';
assert.ok(!existsSync(output),'QA1243_STATIC_OUTPUT_ALREADY_EXISTS');
mkdirSync(output,{recursive:false});
writeFileSync(output+'/index.html',html,'utf8');
writeFileSync(output+'/oauth.js',script,'utf8');
writeFileSync(output+'/style.css',css,'utf8');
console.log('QA1243_SAFARI_STATIC_BUILT '+JSON.stringify({
 path:output,files:3,scopes:QA1243_RUNNER_SCOPES.length,
 expectedOwner:'webuielf@gmail.com',noOperatingSourceEdit:true,noCredentials:true
}));