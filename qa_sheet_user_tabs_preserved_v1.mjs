import fs from 'node:fs';
import assert from 'node:assert/strict';
const src=fs.readFileSync('apps_script.gs','utf8');
assert.ok(src.includes('Only remove tabs created by the old automated three-section layout.'));
assert.ok(src.includes('ss.deleteSheet(sh)'));
assert.ok(src.includes('keep[name]'));
assert.ok(src.includes('if(!keep[name] && /^(?:근태|세션|급여)-20'));
assert.ok(!src.includes('if(!keep[sh.getName()]) ss.deleteSheet(sh);'));
console.log('PASS annual Sheet cleanup is limited to legacy names');
