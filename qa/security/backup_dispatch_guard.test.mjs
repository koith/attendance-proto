// PR-only synthetic guard regression. No credentials, no production calls.
// Parse the same folded condition that GitHub Actions evaluates.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const yaml=readFileSync(new URL('../../.github/workflows/sec-backup-capture.yml',import.meta.url),'utf8');
const lines=yaml.split(/\r?\n/);
const i=lines.findIndex(x=>/^    if: >-\s*$/.test(x));
assert.notEqual(i,-1,'must have explicit multiline authorization guard');
let j=i+1;
const parts=[];
for(;j<lines.length&&/^      \S|^        \S|^          \S/.test(lines[j]);j++)parts.push(lines[j].trim());
const expression=parts.join(' ');
assert.match(expression,/github\.event\.comment\.user\.login\s*==\s*'koith'/);
assert.match(expression,/github\.event\.issue\.number\s*==\s*1492/);
assert.match(expression,/github\.ref\s*==\s*'refs\/heads\/main'/);
assert.match(expression,/github\.event\.issue\.pull_request\s*==\s*null/);
assert.match(expression,/github\.event\.comment\.body\s*==\s*'\[SEC-LIVE-BACKUP-ONCE:20261107\]'/);
assert.ok(/^[A-Za-z0-9_\s.'()=:&|\-\/\[\]]+$/.test(expression),'expression must remain simple comparisons and boolean logic');
const authorized=Function('github','inputs',`"use strict";return Boolean(${expression});`);
const issue=(overrides={})=>({
 ref:'refs/heads/main',
 event_name:'issue_comment',
 event:{
  issue:{number:1492,pull_request:null},
  comment:{user:{login:'koith'},body:'[SEC-LIVE-BACKUP-ONCE:20261107]'}
 },
 ...overrides
});
const can=(g,inputs={capture_scope:''})=>authorized(g,inputs);

test('one-time comment on canonical Issue by repository owner is the ONLY comment that can run',()=>{
 assert.equal(can(issue()),true);
 assert.equal(can(issue({ref:'refs/heads/review'})),false);
 assert.equal(can(issue({event:{issue:{number:1493,pull_request:null},comment:{user:{login:'koith'},body:'[SEC-LIVE-BACKUP-ONCE:20261107]'}}})),false);
 assert.equal(can(issue({event:{issue:{number:1492,pull_request:{}},comment:{user:{login:'koith'},body:'[SEC-LIVE-BACKUP-ONCE:20261107]'}}})),false);
 assert.equal(can(issue({event:{issue:{number:1492,pull_request:null},comment:{user:{login:'attacker'},body:'[SEC-LIVE-BACKUP-ONCE:20261107]'}}})),false);
 assert.equal(can(issue({event:{issue:{number:1492,pull_request:null},comment:{user:{login:'koith'},body:'different'}}})),false);
});
test('workflow_dispatch requires manually selected exact scope and main',()=>{
 assert.equal(can({...issue(),event_name:'workflow_dispatch'},{capture_scope:'AUTH_DB_STORAGE_ENCRYPTED_ONLY'}),true);
 assert.equal(can({...issue(),event_name:'workflow_dispatch'},{capture_scope:'OTHER'}),false);
 assert.equal(can({...issue(),event_name:'push'},{capture_scope:'AUTH_DB_STORAGE_ENCRYPTED_ONLY'}),false);
 assert.equal(can({...issue(),ref:'refs/heads/review',event_name:'workflow_dispatch'},{capture_scope:'AUTH_DB_STORAGE_ENCRYPTED_ONLY'}),false);
});
test('protected environment, fail-closed preflight, and encrypted-artifact-only upload are retained',()=>{
 assert.match(yaml,/environment: production-backup/);
 assert.match(yaml,/SEC_BACKUP_ENV_READY/);
 assert.match(yaml,/BACKUP_BLOCKED_PROTECTED_ENV_NOT_READY/);
 assert.match(yaml,/BACKUP_BLOCKED_DB_CONNECTION/);
 assert.match(yaml,/BACKUP_BLOCKED_STORAGE_CREDENTIAL/);
 assert.match(yaml,/BACKUP_BLOCKED_AUTH_CONFIG_CREDENTIAL/);
 assert.match(yaml,/sec-live-backup-single-run/);
 assert.match(yaml,/cancel-in-progress: false/);
 assert.match(yaml,/node scripts\/security\/capture\.mjs/);
 assert.match(yaml,/sealed-attendance-recovery/);
 assert.match(yaml,/attendance-live\.sealed/);
 assert.match(yaml,/retention-days: 30/);
 assert.doesNotMatch(yaml,/pull_request_target:/);
 assert.doesNotMatch(yaml,/^  push:/m);
});
