import assert from 'node:assert/strict';
import {assessQaScriptCloudLink} from './qa1243_gas_cloud_link.mjs';
const client='123456789012-abcdxyz.apps.googleusercontent.com';
for(const v of [null,undefined,'','not-a-project','123456789000',123456789011])
 assert.equal(assessQaScriptCloudLink(client,v).eligible,false,'no unstated approval: '+v);
const yes=assessQaScriptCloudLink(client,'123456789012');
assert.equal(yes.eligible,true);
assert.match(yes.reason,/REQUIRES_ACTUAL_EXECUTION/);
assert.equal(assessQaScriptCloudLink('not-client','123456789012').eligible,false);
assert.equal(assessQaScriptCloudLink('','123456789012').eligible,false);
assert.ok(!JSON.stringify(yes).includes(client),'never output client id');
console.log('PASS #1243 GAS standard Cloud project prerequisite fail-closed 8 cases');
