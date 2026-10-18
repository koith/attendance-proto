import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const src=fs.readFileSync('apps_script.gs','utf8');
assert.ok(src.includes('Only remove tabs created by the old automated three-section layout.'));
assert.ok(src.includes('ss.deleteSheet(sh)'));
assert.ok(src.includes('keep[name]'));
assert.ok(src.includes('if(!keep[name] && /^(?:근태|세션|급여)-20'));
assert.ok(!src.includes('if(!keep[sh.getName()]) ss.deleteSheet(sh);'));
const ctx=vm.createContext({});
vm.runInContext(src,ctx);
let tabs=['1월','근태-2026-10','세션-2026-10','급여-2026-10','QA-05_TMP','검토용'];
let deleted=[];
const get=n=>tabs.includes(n)?{getName:()=>n}:null;
const book={
 getSheetByName:get,
 insertSheet:n=>{tabs.push(n);return get(n)},
 getSheets:()=>tabs.map(get),
 deleteSheet:sh=>{deleted.push(sh.getName());tabs=tabs.filter(n=>n!==sh.getName())},
 setActiveSheet:()=>{},moveActiveSheet:()=>{}
};
ctx._ensureMonthTabs(book);
assert.deepEqual(deleted,['근태-2026-10','세션-2026-10','급여-2026-10']);
assert.ok(tabs.includes('QA-05_TMP')&&tabs.includes('검토용'));
assert.equal(tabs.filter(n=>/^[1-9][0-9]*월$/.test(n)).length,12);
ctx._ensureMonthTabs(book);
assert.equal(deleted.length,3,'repeat sync must not remove user tabs');
console.log('PASS annual Sheet cleanup is limited to legacy names');
