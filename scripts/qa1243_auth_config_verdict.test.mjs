import assert from 'node:assert/strict';
import {assessHostedInviteConfig} from './qa1243_auth_config_verdict.mjs';
const verified={configReadable:true,remoteTemplateMatch:true,remoteInviteSubjectMatch:true,
 emailProviderEnabled:true,smtpHostConfigured:true,smtpSenderConfigured:true};
const pass=assessHostedInviteConfig(verified);
assert.equal(pass.ready,true);assert.equal(pass.passed,6);
assert.equal(pass.externalMailboxDeliveryVerified,false,'Config is not inbox receipt');
for(const key of Object.keys(verified)){
 const bad=assessHostedInviteConfig({...verified,[key]:false});
 assert.equal(bad.ready,false,'Missing '+key+' must fail');assert.equal(bad.passed,5);
 const unknown=assessHostedInviteConfig({...verified,[key]:null});
 assert.equal(unknown.ready,false,'Null '+key+' must fail');assert.equal(unknown.failed.length,1);
}
assert.equal(assessHostedInviteConfig({}).ready,false,'Public-only cannot PASS');
assert.equal(assessHostedInviteConfig(null).ready,false);
console.log('PASS QA1243 Hosted Auth strict positive evidence + fail-closed cases');
