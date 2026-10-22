import assert from 'node:assert/strict';
import {readFileSync,rmSync,existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {QA1243_RUNNER_SCOPES} from './qa1243_oauth_scopes.mjs';

const dir='qa1243-safari';
assert.ok(!existsSync(dir),'Test must not overwrite pre-existing local QA page');
try{
 execFileSync(process.execPath,['scripts/qa1243_safari_static_build.mjs'],{
  stdio:'pipe',timeout:10000
 });
 const html=readFileSync(dir+'/index.html','utf8');
 const js=readFileSync(dir+'/oauth.js','utf8');
 const css=readFileSync(dir+'/style.css','utf8');
 assert.match(html,/http-equiv="Content-Security-Policy"/);
 assert.match(html,/default-src 'none'/);
 assert.match(html,/script-src 'self'/);
 assert.match(html,/https:\/\/accounts\.google\.com\/gsi\/client/);
 assert.match(html,/<script src="\.\/oauth\.js" defer><\/script>/);
 assert.match(html,/referrer" content="no-referrer"/);
 assert.match(html,/293023370445-le7n6lrrbub90i96ol64tt65lss8s6p2\.apps\.googleusercontent\.com/);
 assert.match(html,/readonly/);
 assert.doesNotMatch(html,/QA1243_NONCE|QA1243_SCOPE_LIST|unsafe-inline/);
 assert.doesNotMatch(html,/<script nonce=|<style nonce=/);
 assert.match(js,/QA1243_IFRAMED_OAUTH_BLOCKED/);
 assert.match(js,/window\.top!==window\.self/);
 assert.match(js,/webuielf@gmail\.com/);
 assert.match(js,/navigator\.clipboard\.writeText\(token\)/);
 assert.match(js,/https:\/\/www\.googleapis\.com\/oauth2\/v3\/userinfo/);
 for(const scope of QA1243_RUNNER_SCOPES)assert.ok(js.includes(scope),'Missing minimal scope '+scope);
 for(const bad of ['https://www.googleapis.com/auth/drive"','https://www.googleapis.com/auth/spreadsheets"',
  'SUPABASE_SERVICE_ROLE_KEY','api.github.com','localStorage','sessionStorage','GITHUB_TOKEN']){
  assert.ok(!html.includes(bad)&&!js.includes(bad),'No privileged scope/credential '+bad);
 }
 assert.ok(css.includes('font-family')&&css.length>100);
}finally{rmSync(dir,{recursive:true,force:true});}
console.log('PASS QA1243 static Pages build: reviewed source, CSP external assets, exact scope, iframe guard, no privileged writes');