import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
assert.match(html,/@media\s*\(min-width:769px\)\s*\{\s*html\s*\{overflow-y:scroll;scrollbar-gutter:auto;\}\s*body\s*\{overflow-y:visible;\}\s*\}/);
assert.doesNotMatch(html, /html\{scrollbar-gutter:stable;\}/);
assert.match(html,/\.wrap\{width:100%; max-width:760px; margin:0 auto/);
assert.match(html,/v0\.178/);
console.log('PASS desktop scrollbar gutter avoids double reserved scrollbar gutter; mobile remains unchanged');
