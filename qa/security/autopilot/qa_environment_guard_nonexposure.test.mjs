import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {auditEnvDescriptor} from '../../../scripts/security/autopilot/qa_environment_guard.mjs';

// AISEC-04: prove the guard never reads or surfaces a secret VALUE.
// The guard must judge by key NAME only; result and error messages must carry no value.

const SECRET = 'SENTINEL_SECRET_VALUE_should_never_appear';

function assertNoSecretAnywhere(obj) {
  const serialized = JSON.stringify(obj);
  assert.ok(!serialized.includes(SECRET), 'secret value leaked into result: ' + serialized);
}

test('result object never contains a provided secret value', () => {
  const rows = [{name: 'BUILD_FLAG', value: SECRET}];
  const out = auditEnvDescriptor(rows);
  assertNoSecretAnywhere(out);
  assert.deepEqual(out, {count: 1}); // only a count, no values echoed
});

test('error message for a denied name never contains the value', () => {
  const rows = [{name: 'GITHUB_TOKEN', value: SECRET}];
  try {
    auditEnvDescriptor(rows);
    assert.fail('expected ENV_NAME_DENIED');
  } catch (err) {
    assert.match(err.message, /ENV_NAME_DENIED/);
    assert.ok(!err.message.includes(SECRET), 'error message leaked the value');
  }
});

test('guard does not invoke a getter on `name` (no side-effect value access)', () => {
  let getterCalled = false;
  const row = {
    get name() { getterCalled = true; return 'API_KEY'; },
    value: SECRET
  };
  // Reading name via getter would both execute attacker code and could expose values.
  // The guard uses getOwnPropertyDescriptor(...).value, so an accessor has no `.value`
  // and is rejected as a malformed descriptor WITHOUT calling the getter.
  assert.throws(() => auditEnvDescriptor([row]), /DESCRIPTOR_INVALID/);
  assert.equal(getterCalled, false, 'guard must not invoke the name getter');
});

test('guard does not invoke a getter on `value` either', () => {
  let valueGetterCalled = false;
  const row = {
    name: 'PLAIN_FLAG',
    get value() { valueGetterCalled = true; return SECRET; }
  };
  const out = auditEnvDescriptor([row]);
  assert.equal(valueGetterCalled, false, 'guard must never touch value');
  assertNoSecretAnywhere(out);
});

test('many rows incl. denied + secrets: aggregate output has no values', () => {
  const rows = [
    {name: 'LOG_LEVEL', value: 'debug'},
    {name: 'FEATURE_X', value: SECRET}
  ];
  const out = auditEnvDescriptor(rows);
  assertNoSecretAnywhere(out);
});
