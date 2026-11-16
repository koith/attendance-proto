import {test} from 'node:test';
import assert from 'node:assert/strict';
import {alertInput} from '../../scripts/security/backup_alert.mjs';
test('backup alert only carries nonsecret failed-run metadata',()=>{
 const e={GITHUB_REPOSITORY:'koith/attendance-proto',BACKUP_RESULT:'failure',
  GITHUB_RUN_ID:'12345',GITHUB_TOKEN:'synthetic'};
 const x=alertInput(e);
 assert.equal(x.key,'SEC_D5_BACKUP_ALERT');
 assert.equal(x.issue,1492);
 assert.equal(x.countAttempts,true);
 assert.equal(x.fields.status,'BACKUP_NOT_COMPLETED');
 assert.throws(()=>alertInput({...e,BACKUP_RESULT:'success'}),/INVALID_BACKUP/);
 assert.throws(()=>alertInput({...e,GITHUB_RUN_ID:'../../token'}),/INVALID_BACKUP/);
});
