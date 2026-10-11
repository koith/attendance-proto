import assert from 'node:assert/strict';
import fs from 'node:fs';
const edge=fs.readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
const before=edge.indexOf('const {data:snap,error:snapError}=await client.from("payroll_snapshot")');
assert.ok(before>=0,'closed payroll source query must exist');
const end=edge.indexOf(';',before);
const query=edge.slice(before,end+1);
assert.match(query,/\.eq\("store_id",storeId\)\.eq\("ym",ym\)/,
 'database must constrain both the requested store and the selected month');
assert.doesNotMatch(query,/\.eq\("ym",ym\);$/,
 'a global month-only salary query risks leaking a transferred employee\'s prior-store snapshot');
assert.match(edge,/const ids=new Set\(\(data\.employees\|\|\[\]\)\.map/);
assert.match(edge,/snapshots=\(snap\|\|\[\]\)\.filter\(s=>ids\.has/,'retain employee intersection as a second isolation check');
assert.match(edge,/closedPayroll=snapshotRows\(snapshots,ym\)/);
const sql=fs.readFileSync('supabase/migrations/20261010100000_sheet_payroll_week_boundary.sql','utf8');
assert.match(sql,/e\.store_id=p_store_id/,'source employee roster remains store-scoped');
console.log('PASS payroll snapshot SELECT is store+month scoped even after employee transfer');
