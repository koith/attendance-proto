import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('const APP_VERSION="v0.69.8";'));
assert(html.includes('#empGrid{grid-template-columns:repeat(2,minmax(0,1fr));'),'POS employee list must be two columns');
assert(html.includes('#empGrid>.empty{grid-column:1/-1}'),'empty state must span both columns');
assert(html.includes('#empGrid .emp .nm{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'),'names must not overflow narrow cards');
assert(html.includes('#empGrid .emp .since{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'),'status line must not overflow narrow cards');
console.log('POS two-column v0.69.8: PASS');
