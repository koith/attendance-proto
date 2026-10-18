import assert from 'node:assert/strict';
import fs from 'node:fs';
const ui=fs.readFileSync('operations_stocktake_v1.js','utf8');
const html=fs.readFileSync('index.html','utf8');
assert.match(html,/operations_stocktake_v1\.js\?v=20261019v340/);
assert.match(ui,/id="opsStocktakeAuditExport"/);
assert.match(ui,/const csv=stocktakeAuditCsv\(data,store\)/);
assert.match(ui,/if\(Number\(data\.store_id\)!==store\)throw Error\("STOCKTAKE_STORE_CHANGED"\)/);
const start=ui.indexOf('function stocktakeMatchingCatalog(');
const end=ui.indexOf('window.openStoreInventoryStocktake=',start);
assert.ok(start>0&&end>start);
const csv=Function(ui.slice(start,end)+'\nreturn stocktakeAuditCsv')();
const d={id:701,store_id:1,counted_on:'2026-10-19',status:'DRAFT',lines:[
 {item_id:10,name:'원두 = 위험',unit:'g',expected_quantity:12.5,counted_quantity:0,variance:-12.5},
 {item_id:11,name:'=HYPERLINK("unsafe","click")',unit:'ml',expected_quantity:15.2,counted_quantity:18.2,variance:3}
]};
const out=csv(d,1);
assert.ok(out.startsWith('\ufeff'),'Korean spreadsheet encoding needs UTF-8 BOM');
assert.match(out,/"실사ID","지점ID","실사일","상태"/);
assert.match(out,/"DRAFT"/);
assert.match(out,/"매장 재고 실사 검토용 · 실사 상태 확인 필수"/);
assert.match(out,/"0","-12\.5"/,'verified physical zero and signed variance must be preserved');
assert.ok(!out.includes('\r\n"=HYPERLINK'),'CSV formula injection must be escaped');
assert.ok(out.includes('"\x27=HYPERLINK(""unsafe"",""click"")"'),'quote escaping and formula prefix');
assert.equal(out.trim().split('\r\n').length,3);
assert.match(csv({...d,status:'POSTED'},1),/"POSTED"/);
assert.throws(()=>csv(d,2),/STOCKTAKE_AUDIT_INVALID_SCOPE/);
assert.throws(()=>csv({...d,counted_on:null},1),/STOCKTAKE_AUDIT_INVALID_SCOPE/);
assert.throws(()=>csv({...d,id:0},1),/STOCKTAKE_AUDIT_INVALID_SCOPE/);
assert.throws(()=>csv({...d,lines:[{...d.lines[0],expected_quantity:null}]},1),/STOCKTAKE_UNVERIFIED_VARIANCE/);
assert.throws(()=>csv({...d,lines:[{...d.lines[0],variance:0}]},1),/STOCKTAKE_UNVERIFIED_VARIANCE/);
assert.throws(()=>csv({...d,lines:[d.lines[0],d.lines[0]]},1),/STOCKTAKE_UNVERIFIED_VARIANCE/);
assert.match(ui,/await BE\.inventoryStocktakeDetail\(id\)/);
assert.match(ui,/await BE\.inventoryStocktakePost\(id\)/,'manual post must remain separate');
console.log('PASS verified branch stocktake CSV, raw count/variance, scope guard and spreadsheet injection');
