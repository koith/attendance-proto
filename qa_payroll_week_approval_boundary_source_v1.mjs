import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
// Exercise the actual sourceFor query chain against store, month and year-boundary rows.
assert.match(source,/\.gte\("week_start",ym\+"-01"\)/);
assert.doesNotMatch(source,/\.gte\("week_start",new Date\(Date\.UTC/);
const query=source.match(/const \{data:weeklyApprovals,error:weeklyApprovalError\}=await client\.from\("payroll_weekly_approvals"\)[\s\S]*?\.order\("id",\{ascending:false\}\);/);
assert.ok(query,'Missing production approval read query');
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const getRows=new AsyncFunction('client','ym','storeId',query[0]+'\nreturn weeklyApprovals;');
const fixture=[
 {store_id:1,week_start:'2025-12-29',approved_won:11111},
 {store_id:1,week_start:'2026-01-05',approved_won:22222},
 {store_id:1,week_start:'2026-09-28',approved_won:33333},
 {store_id:1,week_start:'2026-10-05',approved_won:44444},
 {store_id:1,week_start:'2026-11-02',approved_won:55555},
 {store_id:2,week_start:'2026-10-05',approved_won:66666},
];
const client={from(name){
 assert.equal(name,'payroll_weekly_approvals');
 let rows=fixture.slice();
 return {
 select(){return this},
 eq(key,value){rows=rows.filter(x=>String(x[key])===String(value));return this},
 gte(key,value){rows=rows.filter(x=>x[key]>=value);return this},
 lt(key,value){rows=rows.filter(x=>x[key]<value);return this},
 order(){return this},
 then(resolve){return Promise.resolve(resolve({data:rows,error:null}));}
 };
}};
assert.deepEqual((await getRows(client,'2026-10',1)).map(x=>x.approved_won),[44444],
 'October must not receive September approval or another store');
assert.deepEqual((await getRows(client,'2026-01',1)).map(x=>x.approved_won),[22222],
 'January must not receive December approval');
assert.deepEqual((await getRows(client,'2026-09',1)).map(x=>x.approved_won),[33333],
 'September keeps the September Monday, even if its workweek crosses October');
assert.match(fs.readFileSync('supabase/functions/server-sync-sheet/engine.mjs','utf8'),
 /if\(!weekKey\.startsWith\(ym\)\)continue/);

const helperMatch=source.match(/function weekBelongsToPayrollMonth\(ym,weekStart\)\{[\s\S]*?\n\}/);
assert.ok(helperMatch,'Missing server-side Monday-month guard');
const {runInNewContext}=await import('node:vm');
const owns=(ym,week)=>runInNewContext(helperMatch[0]+'\nweekBelongsToPayrollMonth(ym,week)',{ym,week,Date,Number});
assert.equal(owns('2026-09','2026-09-28'),true,'Cross-month week belongs to its Monday month');
assert.equal(owns('2026-10','2026-09-28'),false,'Next-month zero-won approval must be forbidden');
assert.equal(owns('2026-10','2026-10-05'),true,'Normal October Monday');
assert.equal(owns('2026-10','2026-10-01'),false,'Reject non-Monday');
assert.equal(owns('2026-02','2026-02-30'),false,'Reject invalid calendar date');
assert.equal(owns('2026-12','2026-12-28'),true,'December year-boundary week');
assert.equal(owns('2027-01','2026-12-28'),false,'Reject year-boundary spillover');
assert.match(source,/if\(!weekBelongsToPayrollMonth\(ym,weekStart\)\)/);
const ui=fs.readFileSync('index.html','utf8');
assert.match(ui,/id="weeklyApproveDate" type="date" min="\$\{ym\}-01" max=/);

console.log('PASS Monday-month approval guard and real store-scoped query prevent double posting');
