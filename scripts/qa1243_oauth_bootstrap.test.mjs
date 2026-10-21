import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {
 QA1243_REPO,QA1243_GCP_PROJECT,QA1243_QA_EMAIL,
 validateDesktopClient,oauthAuthorizationUrl,
 githubSecretsStdin,findQaDesktopCredentials
} from './qa1243_oauth_bootstrap.mjs';
import {QA1243_RUNNER_SCOPES,assertQa1243RunnerScopes} from './qa1243_oauth_scopes.mjs';

assert.equal(QA1243_REPO,'koith/attendance-proto');
assert.equal(QA1243_GCP_PROJECT,'qa1243-isolated');
assert.equal(QA1243_QA_EMAIL,'webuielf@gmail.com');
assert.equal(QA1243_RUNNER_SCOPES.length,5);
for(const forbidden of [
 'https://www.googleapis.com/auth/drive',
 'https://www.googleapis.com/auth/drive.file',
 'https://www.googleapis.com/auth/spreadsheets',
 'https://www.googleapis.com/auth/script.external_request'
])assert.ok(!QA1243_RUNNER_SCOPES.includes(forbidden),'runner must not gain '+forbidden);
assertQa1243RunnerScopes(QA1243_RUNNER_SCOPES);
assertQa1243RunnerScopes(QA1243_RUNNER_SCOPES.join(' '));
assert.throws(()=>assertQa1243RunnerScopes(QA1243_RUNNER_SCOPES.slice(1)),
 /QA1243_OAUTH_SCOPE_MISSING_OR_OVERPRIVILEGED/);
assert.throws(()=>assertQa1243RunnerScopes([...QA1243_RUNNER_SCOPES,
 'https://www.googleapis.com/auth/spreadsheets']),
 /QA1243_OAUTH_SCOPE_MISSING_OR_OVERPRIVILEGED/);
assert.throws(()=>assertQa1243RunnerScopes([...QA1243_RUNNER_SCOPES,'openid']),
 /QA1243_OAUTH_SCOPE_MISSING_OR_OVERPRIVILEGED/);

const candidate={
 installed:{project_id:'qa1243-isolated',client_id:'123456789-testClient.apps.googleusercontent.com',
 client_secret:'GOCSPX-FAKE_ONLY_CLIENT_SECRET_0123456789',
 redirect_uris:['http://localhost']}
};
const client=validateDesktopClient(candidate);
assert.ok(client.client_id.includes('.apps.googleusercontent.com'));
assert.ok(!Object.hasOwn(client,'project_id'));
assert.throws(()=>validateDesktopClient({web:candidate.installed}),
 /QA1243_DESKTOP_CLIENT_OR_PROJECT_MISMATCH/);
assert.throws(()=>validateDesktopClient({installed:{...candidate.installed,project_id:'operating-project'}}),
 /QA1243_DESKTOP_CLIENT_OR_PROJECT_MISMATCH/);
assert.throws(()=>validateDesktopClient({installed:{...candidate.installed,client_secret:'bad\ninjected'}}),
 /QA1243_INVALID_DESKTOP_CLIENT_FILE/);

const state='STATE_'+('X'.repeat(45));
const verifier='VERIFIER_'+('y'.repeat(55));
const uri='http://127.0.0.1:52843/oauth2callback';
const url=new URL(oauthAuthorizationUrl(client,uri,state,verifier));
assert.equal(url.origin,'https://accounts.google.com');
assert.equal(url.searchParams.get('redirect_uri'),uri);
assert.equal(url.searchParams.get('response_type'),'code');
assert.equal(url.searchParams.get('prompt'),'consent select_account');
assert.equal(url.searchParams.get('access_type'),'offline');
assert.equal(url.searchParams.get('login_hint'),'webuielf@gmail.com');
assert.equal(url.searchParams.get('code_challenge_method'),'S256');
assert.equal(url.searchParams.get('code_challenge'),
 createHash('sha256').update(verifier,'ascii').digest('base64url'));
assert.equal(url.searchParams.get('scope'),QA1243_RUNNER_SCOPES.join(' '));
assert.equal(url.searchParams.get('include_granted_scopes'),'false');
assert.ok(!url.toString().includes(client.client_secret),'No credential value in browser URL');
assert.throws(()=>oauthAuthorizationUrl(client,'https://evil.example/callback',state,verifier),
 /QA1243_LOOPBACK_ONLY/);
assert.throws(()=>oauthAuthorizationUrl(client,uri,'bad',verifier),
 /QA1243_INVALID_PKCE_OR_STATE/);
assert.throws(()=>oauthAuthorizationUrl(client,uri,state,'bad'),
 /QA1243_INVALID_PKCE_OR_STATE/);

const fakeRefresh='1//FAKE_QA_REFRESH_TOKEN_NOT_FROM_GOOGLE_ONLY';
const stdin=githubSecretsStdin(client,fakeRefresh);
assert.equal(stdin.split('\n').length,4);
assert.deepEqual(stdin.trim().split('\n').map(line=>line.split('=')[0]),[
 'QA1243_GOOGLE_OAUTH_CLIENT_ID',
 'QA1243_GOOGLE_OAUTH_CLIENT_SECRET',
 'QA1243_GOOGLE_OAUTH_REFRESH_TOKEN'
]);
assert.ok(stdin.includes(fakeRefresh));
assert.throws(()=>githubSecretsStdin(client,'FAKE\nINJECTION'),
 /QA1243_INVALID_SECRET_VALUE/);
assert.throws(()=>githubSecretsStdin({...client,client_secret:'\n'},fakeRefresh),
 /QA1243_INVALID_SECRET_VALUE/);

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'qa1243-oauth-test-'));
try{
 assert.throws(()=>findQaDesktopCredentials(null,[temp]),
  /QA1243_DESKTOP_CLIENT_FILE_NOT_FOUND/);
 fs.writeFileSync(path.join(temp,'client_secret_QA.json'),JSON.stringify(candidate));
 fs.writeFileSync(path.join(temp,'client_secret_OPERATING.json'),
  JSON.stringify({installed:{...candidate.installed,project_id:'operating'}}));
 assert.deepEqual(findQaDesktopCredentials(null,[temp]),client);
 fs.writeFileSync(path.join(temp,'client_secret_EXTRA.json'),JSON.stringify({
  installed:{...candidate.installed,client_id:'987654321-second.apps.googleusercontent.com'}
 }));
 assert.throws(()=>findQaDesktopCredentials(null,[temp]),
  /QA1243_MULTIPLE_DESKTOP_CLIENT_FILES/);
 assert.deepEqual(findQaDesktopCredentials(path.join(temp,'client_secret_QA.json')),client);
}finally{fs.rmSync(temp,{recursive:true,force:true});}

const helper=fs.readFileSync('scripts/qa1243_oauth_bootstrap.mjs','utf8');
const runner=fs.readFileSync('scripts/qa1243_live_edge_gas_sheets.mjs','utf8');
const runtime=fs.readFileSync('scripts/qa1243_build_isolated_gas.mjs','utf8');
const shell=fs.readFileSync('QA1243_OAuth_Start.cmd','utf8');
assert.match(runner,/assertQa1243RunnerScopes\(actualScopes\)/,
 'same strict approved scope contract in CI runner');
assert.match(helper,/assertQa1243RunnerScopes\(auth.scope\)/);
assert.match(helper,/await assertIdentity\(refreshed.access_token\)/);
assert.match(helper,/QA1243_QA_EMAIL/);
assert.match(helper,/--web','--scopes','repo'/);
assert.match(helper,/secret','set','-f','-','--repo'/);
assert.match(helper,/stdio:interactive\?'inherit':\['pipe','pipe','ignore'\]/);
assert.match(helper,/--event','push'/);
assert.match(helper,/gh',\['run','rerun'/);
assert.doesNotMatch(helper,/\b(?:writeFileSync|appendFileSync|mkdtempSync)\s*\(/,
 'bootstrap must NEVER write credentials/tokens to local files');
assert.doesNotMatch(helper,/--body|console\.log\(\s*auth|console\.log\(\s*refreshed/);
assert.doesNotMatch(helper,/process\.env\.(?:GOOGLE_OAUTH|SHEET_SHARED_SECRET)/);
assert.match(runtime,/https:\/\/www\.googleapis\.com\/auth\/spreadsheets'/,
 'QA writer alone needs Sheets write permission');
assert.doesNotMatch(runtime,/https:\/\/www\.googleapis\.com\/auth\/drive'/);
assert.match(shell,/QA1243_OAuth_Start\.cmd|scripts\\qa1243_oauth_bootstrap\.mjs/);
console.log('PASS QA1243 Desktop OAuth strict scopes, PKCE loopback, QA identity, GitHub stdin secrets, trusted push-only rerun, no operating Google writes');
