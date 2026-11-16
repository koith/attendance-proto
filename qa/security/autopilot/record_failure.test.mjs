import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateFailure} from '../../../scripts/security/autopilot/record_failure.mjs';
test('security failure status is scoped and requires trusted run credentials',()=>{
 const e={GITHUB_REPOSITORY:'koith/attendance-proto',SEC_AUTO_TASK:'SEC-S04-MANIFEST',
 FAILURE_CAUSE:'DEVELOP_FAILED',GITHUB_RUN_ID:'1234',GITHUB_TOKEN:'synthetic'};
 const r=validateFailure(e);
 assert.equal(r.issue,1492);assert.equal(r.countAttempts,true);
 assert.equal(r.key,'SEC_FAIL_SEC-S04-MANIFEST_DEVELOP_FAILED');
 assert.equal(r.fields.no_operating_writes,'true');
 assert.throws(()=>validateFailure({...e,SEC_AUTO_TASK:'../../secrets'}),/INVALID_SECURITY/);
 assert.throws(()=>validateFailure({...e,FAILURE_CAUSE:'SUPABASE_KEY'}),/INVALID_SECURITY/);
});
