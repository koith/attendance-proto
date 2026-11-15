import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {verifyMonthlyGasIdentity,selectTrustedMonthlyGasCredential} from '../scripts/monthly_owner_google_identity.mjs';
import {QA1243_RUNNER_SCOPES} from '../scripts/qa1243_oauth_scopes.mjs';
const workflow=fs.readFileSync('.github/workflows/monthly-owner-gas-provision.yml','utf8');
const provision=fs.readFileSync('scripts/provision_monthly_owner_gas.mjs','utf8');
const source=fs.readFileSync('gas/monthly-owner-report/Code.gs','utf8');
const manifest=JSON.parse(fs.readFileSync('gas/monthly-owner-report/appsscript.json','utf8'));
test('each OAuth credential family uses its own complete GitHub Secret set only',()=>{
 for(const part of ['CLIENT_ID','CLIENT_SECRET','REFRESH_TOKEN']){
  const qa='QA1243_GOOGLE_OAUTH_'+part;
  const legacy='LEGACY_GOOGLE_OAUTH_'+part;
  const lines=workflow.split('\n');
  const q=lines.find(x=>x.trim().startsWith(qa+':'));
  const l=lines.find(x=>x.trim().startsWith(legacy+':'));
  assert.ok(q&&l,'both explicit families must be available for verified fallback');
  assert.ok(q.includes('secrets.'+qa));
  assert.ok(l.includes('secrets.GOOGLE_OAUTH_'+part));
  assert.ok(!q.includes('|| secrets.GOOGLE_OAUTH'),'no mixed credential families');
  assert.ok(!l.includes('QA1243_GOOGLE_OAUTH_'),'legacy credentials must not borrow QA values');
 }
});

test('only specific reviewed main commit can trigger disabled code-only provisioning',()=>{
 assert.match(workflow,/github\.ref == 'refs\/heads\/main'/);
 assert.match(workflow,/github\.event_name == 'push'/);
 assert.match(workflow,/\[MONTHLY-OWNER-GAS-PROVISION\]/);
 assert.match(workflow,/No owner mail, no trigger, no script secrets or payroll reads/);
 assert.doesNotMatch(workflow,/\bMailApp\.sendEmail\b|\binstallMonthlyOwnerTrigger\(/);
 assert.match(provision,/OWNER_AND_SCOPES_VERIFIED/);
 assert.match(provision,/selectTrustedMonthlyGasCredential\(/);
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
 const opts={expectedOwner:'webuielf@gmail.com',clientId,driveAbout:{user:{me:true,emailAddress:'webuielf@gmail.com',permissionId:'12345678901'}}};
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


test('original owner wins, and two separate matching verified grants allow disabled source-only alternate owner',async()=>{
 const id='synthetic-12345.apps.googleusercontent.com';
 const email='webuielf@gmail.com',other='different-verified-owner@example.test';
 const info={email,email_verified:'true',aud:id,
   sub:'123456789012345678901',expires_in:'3000',scope:QA1243_RUNNER_SCOPES.join(' ')};
 const families=[
  {name:'qa',clientId:id,clientSecret:'qa-secret',refreshToken:'qa-refresh'},
  {name:'legacy',clientId:id,clientSecret:'legacy-secret',refreshToken:'legacy-refresh'}
 ];
 const probe=(mapping)=>async f=>{
  const identity={...info,...mapping[f.name]};
  return {accessToken:'token-'+f.name,info:identity,
    driveAbout:{user:{me:true,emailAddress:identity.email,permissionId:'12345678901'}}};
 };
 const original=await selectTrustedMonthlyGasCredential({
  families,expectedOwner:email,probe:probe({qa:{email:other},legacy:{email}})
 });
 assert.deepEqual(original,{accessToken:'token-legacy',family:'legacy',
  ownerEmail:email,ownerPolicy:'original'});
 const consensus=await selectTrustedMonthlyGasCredential({
  families,expectedOwner:email,probe:probe({qa:{email:other},legacy:{email:other}})
 });
 assert.deepEqual(consensus,{accessToken:'token-qa',family:'qa',
  ownerEmail:other,ownerPolicy:'two_grant_consensus'});
 await assert.rejects(selectTrustedMonthlyGasCredential({
  families,expectedOwner:email,probe:probe({
   qa:{email:'unrelated-a@example.test'},legacy:{email:'unrelated-b@example.test'}
  })
 }),/OAUTH_UNEXPECTED_OWNER_NEEDS_CONSENSUS/);
 await assert.rejects(selectTrustedMonthlyGasCredential({
  families:[families[0],{...families[1],refreshToken:families[0].refreshToken}],
  expectedOwner:email,probe:probe({qa:{email:other},legacy:{email:other}})
 }),/OAUTH_UNEXPECTED_OWNER_NEEDS_CONSENSUS/);
 await assert.rejects(selectTrustedMonthlyGasCredential({
  families,expectedOwner:email,probe:probe({qa:{email:other},legacy:{email:other,sub:'different-sub-12345'}})
 }),/OAUTH_UNEXPECTED_OWNER_NEEDS_CONSENSUS/);
 await assert.rejects(selectTrustedMonthlyGasCredential({
  families,expectedOwner:email,probe:probe({
   qa:{email:other,email_verified:'false'},legacy:{email:other}
  })
 }),/NO_TRUSTED_OAUTH_FAMILY_UNVERIFIED/);
 await assert.rejects(selectTrustedMonthlyGasCredential({
  families:[{...families[0],clientSecret:''}],expectedOwner:email,
  probe:async()=>{throw Error('MUST_NOT_PROBE_INCOMPLETE');}
 }),/OAUTH_NOT_CONFIGURED/);

 assert.match(provision,/drive\/v3\/about\?fields=user\(emailAddress,me,permissionId\)/);
 assert.throws(()=>verifyMonthlyGasIdentity(
  {email:email,email_verified:'true',aud:id,sub:info.sub,scope:info.scope},
  {expectedOwner:email,clientId:id,driveAbout:{user:{me:true,emailAddress:'wrong@example.test',permissionId:'12345678901'}}}
 ),/OAUTH_DRIVE_IDENTITY_MISMATCH/);
 assert.throws(()=>verifyMonthlyGasIdentity(info,{
  expectedOwner:email,clientId:id,driveAbout:{user:{me:false,emailAddress:email,permissionId:'12345678901'}}
 }),/OAUTH_DRIVE_IDENTITY_MISMATCH/);
 // The access token does not need to advertise email_verified if Google Drive
 // independently identifies its verified current user with the same bearer.
 const noFlag={...info};delete noFlag.email_verified;
 assert.deepEqual(verifyMonthlyGasIdentity(noFlag,{
  expectedOwner:email,clientId:id,driveAbout:{user:{me:true,emailAddress:email,permissionId:'12345678901'}}
 }),{ownerVerified:true,scopesVerified:true,clientVerified:true});

 const onlyLegacy=await selectTrustedMonthlyGasCredential({
  families:[{...families[0],clientSecret:''},families[1]],expectedOwner:email,
  probe:probe({legacy:{email}})
 });
 assert.equal(onlyLegacy.family,'legacy');
 assert.equal(onlyLegacy.ownerPolicy,'original');
 assert.match(provision,/const effectiveOwner=verified\.ownerEmail/);
 assert.match(provision,/owner_policy:verified\.ownerPolicy/);
 assert.doesNotMatch(provision,/owner:effectiveOwner|owner:verified\.ownerEmail/);
});


test('two independent Google OAuth grants may attest same owner when verified flag and Drive about unavailable',async()=>{
 const id='synthetic-12345.apps.googleusercontent.com',email='verified-token-owner@example.test';
 const common={email,aud:id,sub:'123456789012345678901',expires_in:'3500',scope:QA1243_RUNNER_SCOPES.join(' ')};
 const fam=[
  {name:'qa',clientId:id,clientSecret:'a',refreshToken:'A-distinct-refresh'},
  {name:'legacy',clientId:id,clientSecret:'b',refreshToken:'B-distinct-refresh'}
 ];
 const opts={families:fam,expectedOwner:'webuielf@gmail.com'};
 const probe=async f=>({accessToken:'isolated-'+f.name,info:common,driveAbout:null});
 const result=await selectTrustedMonthlyGasCredential({...opts,probe});
 assert.deepEqual(result,{accessToken:'isolated-qa',family:'qa',
  ownerEmail:email,ownerPolicy:'two_grant_consensus'});
 await assert.rejects(selectTrustedMonthlyGasCredential({
  ...opts,families:[fam[0]],probe
 }),/OAUTH_UNEXPECTED_OWNER_NEEDS_CONSENSUS/);
 await assert.rejects(selectTrustedMonthlyGasCredential({
  ...opts,families:[fam[0],{...fam[1],refreshToken:fam[0].refreshToken}],probe
 }),/OAUTH_UNEXPECTED_OWNER_NEEDS_CONSENSUS/);
 await assert.rejects(selectTrustedMonthlyGasCredential({
  ...opts,probe:async f=>({accessToken:'x',info:{...common,
   sub:f.name==='qa'?'123456789012345678901':'987654321012345678901'},driveAbout:null})
 }),/OAUTH_UNEXPECTED_OWNER_NEEDS_CONSENSUS/);
 await assert.rejects(selectTrustedMonthlyGasCredential({
  ...opts,probe:async f=>({accessToken:'x',info:{...common,email_verified:'false'},driveAbout:null})
 }),/NO_TRUSTED_OAUTH_FAMILY_UNVERIFIED/);
 assert.throws(()=>verifyMonthlyGasIdentity(common,{
  expectedOwner:email,clientId:id
 }),/OAUTH_SINGLE_GRANT_NOT_VERIFIED/);
 assert.match(provision,/MONTHLY_OWNER_GAS_API_HTTP_\(401\|403\|404\)/);
 assert.match(provision,/driveAbout=null/);
});
