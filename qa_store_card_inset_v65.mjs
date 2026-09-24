import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
const store=fs.readFileSync('store_controls_v1.js','utf8');

assert(html.includes('const APP_VERSION="v65";'),'APP_VERSION must be v65');
assert(html.includes('id="appVersion">v65</div>'),'visible version must be v65');
assert(html.includes('store_controls_v1.js?v=20260924b'),'store controls cache must refresh');

const card=store.match(/\.store-settings-card\{([^}]*)\}/)?.[1]||'';
assert(card.includes('box-sizing:border-box'),'store card must use border-box');
assert(card.includes('width:auto'),'store card must remain in normal flow');
assert(card.includes('max-width:calc(100% - 24px)'),'store card must stay inset from parent edges');
assert(card.includes('margin:12px 12px 14px'),'store card must have symmetric horizontal inset');
assert(!card.includes('position:absolute'),'store card must not use overlay positioning');
assert(!card.includes('transform:'),'store card must not be visually shifted out of flow');

try{new Function(store)}catch(e){throw new Error('store_controls_v1.js syntax error: '+e.message)}
console.log('store card inset v65 QA: PASS');
