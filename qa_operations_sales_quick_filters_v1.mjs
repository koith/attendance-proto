import assert from 'node:assert/strict';
import fs from 'node:fs';

const s=fs.readFileSync('operations_v1.js','utf8');
const css=fs.readFileSync('operations_v1.css','utf8');
const begin=s.indexOf(' function setQuickTypeState(selected){');
const end=s.indexOf(' const modeSelect=',begin);
assert.ok(begin>=0&&end>begin,'actual inquiry button state helper must exist');
const types=['','SALE','PURCHASE','REFUND'];
const buttons=types.map(value=>({
 dataset:{inquiryQuickType:value},
 classList:{current:false,toggle(name,active){assert.equal(name,'active');this.current=active}},
 attributes:{},
 setAttribute(name,val){this.attributes[name]=val}
}));
const body={querySelectorAll(selector){assert.equal(selector,'[data-inquiry-quick-type]');return buttons}};
const setQuick=Function('body',s.slice(begin,end)+'\nreturn setQuickTypeState;')(body);
for(const selected of types){
 setQuick(selected);
 assert.deepEqual(buttons.map(b=>b.classList.current),types.map(x=>x===selected));
 assert.deepEqual(buttons.map(b=>b.attributes['aria-pressed']),types.map(x=>String(x===selected)));
}
assert.throws(()=>setQuick('MANUAL_UPLOAD'),/INVALID_QUICK_TRANSACTION_TYPE/);
assert.match(s,/<div class="ops-inquiry-shortcuts" role="group"/);
for(const t of ['SALE','PURCHASE','REFUND'])assert.ok(s.includes('data-inquiry-quick-type="'+t+'"'));
assert.match(s,/typeSelect\.value=button\.dataset\.inquiryQuickType;\s*typeSelect\.onchange\(\)/,
 'shortcuts must use same backend/permission-safe lookup as current selector');
assert.match(s,/typeSelect\.onchange=\(\)=>\{q\.type=typeSelect\.value\|\|null;q\.page=1;setQuickTypeState\(typeSelect\.value\);refresh\(false\)\}/,
 'quick selector must keep existing pagination and filter behavior');
assert.match(css,/\.ops-inquiry-shortcuts button\.active/);
assert.match(css,/min-height:44px/);
assert.match(css,/\.ops-page-header \.ops-page-heading/,'title stays in its own full-width line');
console.log('PASS MTG-16 4-state sales shortcut interaction, keyboard/touch and existing scoped inquiry');
