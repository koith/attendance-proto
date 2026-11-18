import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
const s=readFileSync('.github/workflows/monthly-owner-gas-provision.yml','utf8');
const safety=s.slice(s.indexOf('\n  safety:\n'),s.indexOf('\n  provision-isolated-source:\n'));
const provision=s.slice(s.indexOf('\n  provision-isolated-source:\n'));
test('unrelated labeled issues do not start monthly-owner QA or provisioning',()=>{
 assert.match(safety,/github\.event_name != 'issues'/);
 assert.match(safety,/github\.event\.issue\.number == 1435/);
 assert.match(safety,/github\.event\.label\.name == 'monthly-owner-gas-source-provision'/);
 assert.match(safety,/github\.ref == 'refs\/heads\/main'/);
 assert.match(provision,/needs:\s*safety/);
 assert.match(provision,/github\.event\.issue\.number == 1435/);
 assert.match(provision,/github\.event\.label\.name == 'monthly-owner-gas-source-provision'/);
});
test('PR and main push QA contract remains unchanged',()=>{
 assert.match(s,/  pull_request:\n\s+paths:/);
 assert.match(s,/  push:\n\s+branches: \[main\]/);
 assert.match(safety,/node --check scripts\/provision_monthly_owner_gas\.mjs/);
 assert.match(safety,/qa\/qa_monthly_owner_delivery_1435\.test\.mjs/);
});
