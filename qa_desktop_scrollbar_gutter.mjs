import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
assert.match(html,/@media\s*\(min-width:769px\)\s*\{\s*html\s*\{overflow-y:scroll;scrollbar-gutter:stable both-edges;\}\s*body\s*\{overflow-y:visible;\}\s*\}/);
assert.doesNotMatch(html, /html\{scrollbar-gutter:stable;\}/);
assert.match(html,/\.wrap\{width:100%; max-width:760px; margin:0 auto/);
assert.match(html,/const APP_VERSION="v0\.\d+"/);
console.log('PASS desktop scrollbar gutter reserves symmetric left/right scrollbar gutters; mobile remains unchanged');
