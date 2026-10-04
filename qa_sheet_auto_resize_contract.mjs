import fs from 'node:fs';
import assert from 'node:assert/strict';
const gas=fs.readFileSync('apps_script.gs','utf8');
const edge=fs.readFileSync('edge_sync_sheet.ts','utf8');
assert.match(gas,/getDisplayValues\(\)/,'width sizing must use displayed cell strings');
assert.match(gas,/getFontSizes\(\)/,'width sizing must account for actual font size');
assert.match(gas,/getFontWeights\(\)/,'width sizing must account for bold text');
assert.match(gas,/for\(var cc=0;cc<width;cc\+\+\)/,'every used column must be measured');
assert.match(gas,/for\(var rr=0;rr<display\.length;rr\+\+\).*Math\.max/,'every displayed row participates in widest-text measurement');
assert.match(gas,/setColumnWidth\(cc\+1,required\)/,'measured width must be applied per column');
assert.doesNotMatch(gas,/Math\.min\(|Math\.max\(\s*\d+\s*,\s*required|widthBuckets|typeWidth/,'no fixed min/max or type bucket width policy');
assert.match(gas,/width_source:'measured_display_text'/,'Apps Script must report measured displayed-text sizing');
assert.match(edge,/SHEET_COLUMN_RESIZE_NOT_CONFIRMED/,'Edge sync must fail closed without resize proof');
assert.match(edge,/width_source:\s*"measured_display_text"/,'Edge request must declare the same measured-display width source as Apps Script');
assert.match(edge,/resize\.width_source !== "measured_display_text"/,'Edge response validation must accept only the deployed measured-display proof token');
assert.doesNotMatch(edge,/resize\.width_source !== "actual_cell_contents"/,'Edge must not reject the canonical measured-display response using the retired token');
console.log('sheet measured-width contract: PASS');

// Regression: a short header must never win over a longer body value in the same column.
function units(text){let u=0;for(const ch of String(text??'')){const code=ch.charCodeAt(0);if(code===32)u+=0.34;else if(code>=0x2e80)u+=1;else if(/[A-Z0-9]/.test(ch))u+=0.62;else u+=0.54;}return u;}
function width(text){return Math.ceil(units(text)*10+24);}
const column=['상태','정상','시급 설정 필요'];
const measured=Math.max(...column.map(width));
assert.equal(measured,width('시급 설정 필요'),'longest displayed body value must determine column width even when header is short');
console.log('sheet full-column longest-display regression: PASS');
