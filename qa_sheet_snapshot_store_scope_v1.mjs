import assert from 'node:assert/strict';
import fs from 'node:fs';
const edge=fs.readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
const before=edge.indexOf('const {data:snap,error:snapError}=await client.from("payroll_snapshot")');
assert.ok(before>=0,'closed payroll source query must exist');
const end=edge.indexOf(';',before);
const query=edge.slice(before,end+1);
assert.match(query,/\.eq\("store_id",storeId\)\.eq\("ym",ym\)/,
 'database must constrain both the requested store and the selected month');
assert.match(query,/select\("store_id,employee_id/,'return snapshot source store identity for defense-in-depth');
assert.match(edge,/snapshots=\(snap\|\|\[\]\)\.filter\(s=>Number\(s\.store_id\)===storeId\)/,
 'filter the snapshot store directly instead of relying on current employee assignment');
assert.doesNotMatch(edge,/snapshots=\(snap\|\|\[\]\)\.filter\(s=>ids\.has/);
const section=edge.slice(before,edge.indexOf('return {source:data,report,workingAttendance',before));
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const run=new AsyncFunction('client','storeId','ym','snapshotRows',section+'\nreturn closedPayroll;');
const fixture=[
 {store_id:1,ym:'2026-09',employee_id:77,employee_name:'전출 직원',gross_pay:1250000},
 {store_id:2,ym:'2026-09',employee_id:88,employee_name:'다른 지점',gross_pay:9900000},
 {store_id:1,ym:'2026-10',employee_id:77,employee_name:'다음 달',gross_pay:1300000}
];
const client={from(table){assert.equal(table,'payroll_snapshot');const filters={};return {
 select(fields){assert.match(fields,/store_id,employee_id/);return this;},
 eq(field,value){filters[field]=value;return this;},
 then(resolve){resolve({data:fixture.filter(x=>Object.entries(filters).every(([k,v])=>x[k]===v)),error:null});}
};}};
const priorStoreHistory=await run(client,1,'2026-09',rows=>rows.map(x=>x.employee_id));
assert.deepEqual(priorStoreHistory,[77],'former employee historical snapshot must remain in source store');
const differentStore=await run(client,2,'2026-09',rows=>rows.map(x=>x.employee_id));
assert.deepEqual(differentStore,[88],'cross-store closed payroll may not leak');

assert.match(edge,/closedPayroll=snapshotRows\(snapshots,ym\)/);
const sql=fs.readFileSync('supabase/migrations/20261010100000_sheet_payroll_week_boundary.sql','utf8');
assert.match(sql,/e\.store_id=p_store_id/,'source employee roster remains store-scoped');
console.log('PASS snapshot history survives employee transfer with both database and JS store/month checks');
