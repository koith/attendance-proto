import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('const APP_VERSION="v0.69.2";'),'APP_VERSION must be v0.69.2');
assert(html.includes('height:88px; min-height:88px'),'employee cards must use fixed equal height');
assert(html.includes('<div class="since" aria-hidden="true">&nbsp;</div>'),'off-duty cards must reserve second-line space');
console.log('POS equal card height v0.69.2: PASS');
