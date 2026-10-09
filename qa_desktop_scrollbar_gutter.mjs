import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
assert.match(html,/@media\s*\(min-width:769px\)\s*\{\s*html\s*\{scrollbar-gutter:stable;\}\s*\}/);
assert.match(html,/\.wrap\{width:100%; max-width:760px; margin:0 auto/);
assert.match(html,/v0\.174/);
console.log('PASS desktop scrollbar gutter preserves centered layout; mobile remains unchanged');
