import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('const APP_VERSION="v0.69.14";'));
assert(html.includes('background:#e7f1eb;border-bottom:1px solid #d3e4da'),'header must be visibly darker than page background');
assert(!html.includes('background:#f3f8f5;border-bottom:1px solid #e3eee7'),'old low-contrast header tone must be removed');
console.log('employee card header contrast v0.69.14: PASS');
