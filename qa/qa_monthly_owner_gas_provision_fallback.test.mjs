import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifyMonthlyGasIdentity} from '../scripts/monthly_owner_google_identity.mjs';
import {QA1243_RUNNER_SCOPES} from '../scripts/qa1243_oauth_scopes.mjs';
const workflow=fs.readFileSync('.github/workflows/monthly-owner-gas-provision.yml','utf8');
const provision=fs.readFileSync('scripts/provision_monthly_owner_gas.mjs','utf8');
const source=fs.readFileSync('gas/monthly-owner-report/Code.gs','utf8');
const manifest=JSON.parse(fs.readFileSync('gas/monthly-owner-report/appsscript.json','utf8'));
test('one complete secret family: no accidental Google refresh-token cross-use',()=>{
 for(const part of ['CLIENT_ID','CLIENT_SECRET','REFRESH_TOKEN']){
  const name='QA1243_GOOGLE_OAUTH_'+part;
  const fallback='GOOGLE_OAUTH_'+part;
  const clause=workflow.split('\n').find(s=>s.trim().startsWith(name+':'));
  assert.ok(clause,name+' explicitly supplied');
  for(const required of ['QA1243_GOOGLE_OAUTH_CLIENT_ID','QA1243_GOOGLE_OAUTH_CLIENT_SECRET','QA1243_GOOGLE_OAUTH_REFRESH_TOKEN'])
    assert.ok(clause.includes('secrets.'+required),required+' must bind the selected secret family');
  assert.ok(clause.includes('secrets.'+fallback),'safe general OAuth fallback for '+part);
  assert.ok(clause.includes(' && '),'family completion guard');
 }
});
test('only specific reviewed main commit can trigger disabled code-only provisioning',()=>{
 assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
 assert.match(workflow,/github\.event_name == 'push'/);
 assert.match(workflow,/\[MONTHLY-OWNER-GAS-PROVISION\]/);
 assert.match(workflow,/No owner mail, no trigger, no script secrets or payroll reads/);
 assert.doesNotMatch(workflow,/\bMailApp\.sendEmail\b|\binstallMonthlyOwnerTrigger\(/);
 assert.match(provision,/OWNER_AND_SCOPES_VERIFIED/);
 assert.match(provision,/verifyMonthlyGasIdentity\(tokenInfo/);
 assert.match(provision,/https:\/\/oauth2\.googleapis\.com\/tokeninfo\?access_token=/);
 assert.doesNotMatch(provision,/https:\/\/www\.googleapis\.com\/oauth2\/v3\/userinfo/);
 assert.match(provision,/PROJECT_OWNER_MISMATCH/);
 assert.match(provision,/FOREIGN_EXISTING_SOURCE_REFUSED/);
 assert.match(provision,/REMOTE_READBACK_FAILED/);
 assert.match(provision,/mail_sent:false,triggers_created:false,script_properties_written:false/);
 assert.match(source,/MONTHLY_OWNER_EXPORT_ENABLED/);
 assert.match(source,/MONTHLY_OWNER_ENABLED/);
 assert.ok(manifest.oauthScopes.includes('https://www.googleapis.com/auth/script.send_mail'));
});

test('label dispatch is precisely bound to existing issue 1435 in same repo, never external PR',()=>{
 assert.match(workflow,/issues:\s*\n\s*types: \[labeled\]/);
 assert.match(workflow,/github\.event\.action == 'labeled'/);
 assert.match(workflow,/github\.event\.label\.name == 'monthly-owner-gas-source-provision'/);
 assert.match(workflow,/github\.event\.issue\.number == 1435/);
 assert.match(workflow,/github\.repository == 'koith\/attendance-proto'/);
 assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
 assert.match(workflow,/provision-isolated-source:\s*\n\s*needs: safety/);
 assert.doesNotMatch(workflow,/monthlyOwnerDigestTick\(\)|MONTHLY_OWNER_ENABLED: true/);
});


test('official tokeninfo binds Google client, expected owner and exact least-privilege scopes',()=>{
 const clientId='synthetic-12345.apps.googleusercontent.com';
 const opts={expectedOwner:'webuielf@gmail.com',clientId};
 const claims={email:'webuielf@gmail.com',email_verified:'true',aud:clientId,
  sub:'123456789012345678901',expires_in:'3000',scope:QA1243_RUNNER_SCOPES.join(' ')};
 assert.deepEqual(verifyMonthlyGasIdentity(claims,opts),
  {ownerVerified:true,scopesVerified:true,clientVerified:true});
 for(const patch of [
  {email:'other@gmail.com'},{email_verified:'false'},
  {aud:'untrusted.apps.googleusercontent.com'},
  {sub:''},{expires_in:12},{scope:'https://www.googleapis.com/auth/drive'},
  {scope:claims.scope+' https://www.googleapis.com/auth/drive'},
  {scope:QA1243_RUNNER_SCOPES.slice(0,-1).join(' ')}
 ]){
  assert.throws(()=>verifyMonthlyGasIdentity({...claims,...patch},opts),/MONTHLY_OWNER_GAS_/);
 }
 assert.throws(()=>verifyMonthlyGasIdentity({},opts),/MONTHLY_OWNER_GAS_/);
 assert.throws(()=>verifyMonthlyGasIdentity(claims,{...opts,clientId:''}),/MONTHLY_OWNER_GAS_/);
});
