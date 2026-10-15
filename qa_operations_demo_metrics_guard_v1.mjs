import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/20261015082000_operations_real_metrics_exclude_demo.sql','utf8');
const app=fs.readFileSync('index.html','utf8');
const operations=fs.readFileSync('operations_v1.js','utf8');

// These are the real production RPC definitions. A missing demo predicate in
// even one path can show seeded 2026-08/09 demo receipts as real franchise sales.
const names=[
  'admin_operations_summary','admin_operations_analytics','admin_operations_trend',
  'admin_store_operations_summary','admin_store_operations_analytics','admin_store_operations_trend'
];
const signatures=[...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)\(/g)].map(x=>x[1]);
assert.deepEqual(signatures.slice().sort(),names.slice().sort(),'Exactly six reporting RPCs, no unrelated object changes');
const statements=sql.split(/(?=CREATE OR REPLACE FUNCTION public\.)/).slice(1);
assert.equal(statements.length,6);
for(const name of names){
  const body=statements.find(x=>x.startsWith('CREATE OR REPLACE FUNCTION public.'+name+'('));
  assert.ok(body,'Missing production RPC: '+name);
  assert.match(body,/SECURITY DEFINER/,'Preserve existing SQL executor security');
  assert.match(body,/SET search_path TO 'public', 'pg_temp'/,'Keep explicit secure search path');
  const store=name.startsWith('admin_store_');
  assert.match(body,store?/public\.can_manage_store\(p_store_id\)/:/public\.is_hq_admin\(\)/,
    'Do not lose original store or HQ access control: '+name);
  const fromCount=(body.match(/FROM public\.operations_transactions\b/gi)||[]).length;
  const demoCount=(body.match(/\bis_demo IS FALSE\b/g)||[]).length;
  const expected=name.endsWith('analytics')?2:1;
  assert.equal(fromCount,expected,'All sales and revenue subqueries must be covered: '+name);
  assert.equal(demoCount,expected,'No seeded demo sales may reach actual metrics: '+name);
  // Require the guard in WHERE next to transaction source conditions, not
  // merely a harmless comment or a separate unrelated query.
  const parts=body.split(/FROM public\.operations_transactions(?:\s+t)?\b/i).slice(1);
  for(const part of parts)assert.match(part.slice(0,260),/\bis_demo IS FALSE\b/,
    'Place demo restriction on EVERY transaction scan: '+name);
}
assert.doesNotMatch(sql,/\b(?:INSERT INTO|UPDATE|DELETE FROM|TRUNCATE|DROP TABLE)\s+public\.(?:operations_transactions|operations_raw_records|operations_import_batches)\b/i,
  'Metrics patch must not modify or remove business records');

const start=operations.indexOf('wrap.querySelector("#opsTemplate").onclick=');
const end=operations.indexOf('submit.onclick=',start);
assert.ok(start>=0&&end>start,'Downloadable operations CSV template exists');
const template=operations.slice(start,end);
const match=template.match(/const csv=("(?:\\.|[^"\\])*")/);
assert.ok(match,'Read actual downloadable CSV source');
const csv=JSON.parse(match[1]);
assert.deepEqual(csv.trim().split(/\r?\n/),
  ['business_date,transaction_type,channel,total_amount,counterparty,source_record_key'],
  'Template must contain headers ONLY; uploading it must not create fabricated financial transactions');
assert.doesNotMatch(csv,/sample|DEMO|2026-\d\d-\d\d|4500/i);
assert.match(operations,/실제 거래 파일만 업로드하세요/);
assert.match(app,/const APP_VERSION="v0\.281"/);
assert.match(app,/id="appVersion">v0\.281<\/span>/);
assert.match(app,/operations_v1\.js\?v=20261015v281/,
  'Real asset must bypass stale browser cache on the corrected release');
// The inquiry intentionally retains labelled demo rows, but actual-money
// cards (including filtered results) must not count them as store revenue.
const calcStart=operations.indexOf('function inquiryTotals(rows){');
const calcEnd=operations.indexOf('function updateInquirySummary(rows)',calcStart);
assert.ok(calcStart>0&&calcEnd>calcStart,'Actual financial totals calculator exists');
const inquiryTotals=Function(operations.slice(calcStart,calcEnd)+';return inquiryTotals;')();
const sample=[
 {is_demo:true,status:'CONFIRMED',net_amount:800000,vat_amount:100000,total_amount:900000},
 {is_demo:false,status:'CONFIRMED',net_amount:4000,vat_amount:400,total_amount:4400},
 {is_demo:false,status:'PENDING',net_amount:6000,vat_amount:600,total_amount:6600},
 {is_demo:null,status:'CONFIRMED',net_amount:9000,vat_amount:900,total_amount:9900}
];
assert.deepEqual(inquiryTotals(sample),{displayed:4,actual:1,notVerified:3,net:4000,vat:400,total:4400},
  'Demo, pending and provenance-unknown receipts cannot inflate actual sales');
assert.deepEqual(inquiryTotals(sample.slice(0,1)),{displayed:1,actual:0,notVerified:1,net:0,vat:0,total:0});
assert.deepEqual(inquiryTotals([]),{displayed:0,actual:0,notVerified:0,net:0,vat:0,total:0});
assert.throws(()=>inquiryTotals(null),/INVALID_RESPONSE/);
assert.match(operations,/updateInquirySummary\(rows\);opsType\.onchange/,
  'Initial inquiry money summary must reflect verified data');
assert.match(operations,/function drawInquiryRows\(rows\)\{updateInquirySummary\(rows\)/,
  'Type/channel filters must refresh financial summary, not only row table');

new Function(operations);
console.log('PASS 6 HQ/store financial RPCs exclude demo with preserved scopes; template is header-only, current v0.281 release');
