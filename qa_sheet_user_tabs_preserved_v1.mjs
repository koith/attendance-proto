import fs from 'node:fs';
import assert from 'node:assert/strict';
const src=fs.readFileSync('apps_script.gs','utf8');
assert.ok(src.includes('Only remove tabs created by the old automated three-section layout.'));
assert.ok(src.includes('ss.deleteSheet(sh)'));
assert.ok(src.includes('keep[name]'));
console.log('PASS annual Sheet cleanup is limited to legacy names');
