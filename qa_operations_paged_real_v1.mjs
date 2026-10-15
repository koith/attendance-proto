import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync('supabase/migrations/20261015150500_operations_paged_real_demo_v1.sql','utf8');
const app=fs.readFileSync('index.html','utf8');
const ui=fs.readFileSync('operations_v1.js','utf8');
for(const name of ['admin_operations_inquiry_page','admin_store_operations_inquiry_page','admin_operations_channels_mode','admin_store_operations_channels_mode']){
 assert.match(sql,new RegExp('CREATE OR REPLACE FUNCTION public\\.'+name+'\\('),'Missing scoped RPC '+name);
 assert.match(app,new RegExp('"'+name+'"'),'Client must invoke '+name);
}
assert.match(sql,/ORDER BY business_date DESC,id DESC\s+LIMIT p_page_size OFFSET/,'stable server sort and pagination');
assert.match(sql,/count\(\*\) AS total_count/,'server-owned total_count');
assert.match(sql,/sum\(total_amount\) FILTER\(WHERE status='CONFIRMED'\)/,'total of confirmed rows, not page');
assert.match(sql,/x\.store_id = p_store_id/,'store isolation');
assert.match(sql,/x\.is_demo IS FALSE AND x\.status='CONFIRMED'/,'actual mode excludes demos and pending rows');
assert.match(sql,/p_mode='demo' THEN x\.is_demo IS TRUE/,'demo mode requires explicit selection');
assert.match(ui,/mode:"actual",page:1,size:100/);
assert.match(ui,/BE\.operationsInquiryPage\(/);
assert.match(ui,/BE\.operationsChannelsMode\(/);
assert.match(ui,/표시 '\+num\(rows\.length\)\+' \/ 전체 '\+num\(count\)/,'visible vs total counts');
assert.match(ui,/totals=data\.totals\|\|\{\}/,'summaries are server-wide, not page sums');
assert.match(ui,/q\.page\+\+;refresh\(false\)/,'next-page action');
assert.match(ui,/q\.page--;refresh\(false\)/,'previous-page action');
assert.match(app,/operations_v1\.js\?v=20261015v286/);
assert.match(app,/const APP_VERSION="v0\.291"/);
assert(!ui.includes('BE.operationsInquiry(f,t,null,null)'),'legacy 2000-limited RPC must not render the inquiry');
new Function(ui);
console.log('PASS #833 paginated verified-real default, opt-in demo, server aggregates and full data controls');