import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context={window:{}};
vm.createContext(context);
vm.runInContext(fs.readFileSync('operations_reference_v208.js','utf8'),context);
const ref=context.window.OPERATIONS_REFERENCE_V208;
const html=fs.readFileSync('index.html','utf8');
const ui=fs.readFileSync('operations_reference_ui_v208.js','utf8');

assert.equal(ref.version,'v208');
assert.equal(ref.inventory.length,172,'all non-heading inventory rows must be retained');
assert.equal(ref.recipes.length,125,'all beverage, food, and batch recipe rows must be retained');
assert.equal(ref.shelf_life.length,125,'the shelf-life reference table must be retained');

const can500=ref.inventory.find(x=>x.name==='500 캔');
assert.deepEqual([can500.minimum_text,can500.current_text,can500.order_text],['야창 2b','매장 1봉/ 야창 2b','창고 여분 보면서']);
const americano=ref.recipes.find(x=>x.menu_name==='아메리카노');
assert.equal(americano.variants.length,3);
assert.match(americano.variants.find(x=>x.label==='HOT(13oz)').content,/온수 225g/);
assert.match(americano.variants.find(x=>x.label==='ICED(1L)').content,/에스프레소4샷/);
const hotdog=ref.recipes.find(x=>x.menu_name==='치즈 치폴레 핫도그');
assert.equal(hotdog.source_version,'26.09.11');
assert.match(hotdog.variants[0].content,/눈꽃 치즈 50g/);
const milkLife=ref.shelf_life.find(x=>x.name==='우유');
assert.equal(milkLife.expiry_after,'3일');

const dataAt=html.indexOf('operations_reference_v208.js?v=20260926v208');
const appAt=html.indexOf('operations_v1.js?v=20260926v208');
const uiAt=html.indexOf('operations_reference_ui_v208.js?v=20260926v208');
assert.ok(dataAt>=0&&dataAt<appAt&&appAt<uiAt,'reference data, legacy operations, then reference UI must load in order');
assert.ok(html.includes('const APP_VERSION="v208"'));
assert.ok(ui.includes('HOT(13oz)')===false,'variant labels must come from source data, not hardcoded UI');
assert.ok(ui.includes('최소수량·현재수량·주문수량'));
assert.ok(ui.includes('공식 패널의 용량·온도별 제조 순서'));
console.log('operations reference v208 QA PASS');
