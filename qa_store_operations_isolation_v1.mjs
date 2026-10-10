import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync('supabase/migrations/20261011092000_store_scoped_operations_ledger.sql','utf8');
const app=fs.readFileSync('index.html','utf8');
const ops=fs.readFileSync('operations_v1.js','utf8');
assert.match(sql,/ALTER TABLE public\.operations_transactions ADD COLUMN IF NOT EXISTS store_id bigint/);
assert.match(sql,/ALTER TABLE public\.operations_raw_records ADD COLUMN IF NOT EXISTS store_id bigint/);
assert.match(sql,/ALTER TABLE public\.operations_import_batches ADD COLUMN IF NOT EXISTS store_id bigint/);
const names=['summary','analytics','trend','transactions','inquiry','channels','imports','collect_request','import_stage'];
for(const name of names){
 const signature='CREATE OR REPLACE FUNCTION public.admin_store_operations_'+name+'(';
 const from=sql.indexOf(signature),to=sql.indexOf('CREATE OR REPLACE FUNCTION ',from+signature.length);
 assert.ok(from>=0,'Missing store RPC: '+name);
 const body=sql.slice(from,to<0?undefined:to);
 assert.match(body,/public\.can_manage_store\(p_store_id\)/,'Must authorize store: '+name);
 if(!['imports','collect_request','import_stage'].includes(name))
  assert.match(body,/store_id=p_store_id/,'Must filter store: '+name);
 const fn='admin_store_operations_'+name;
 assert.match(app,new RegExp('"'+fn+'"'),'App must use '+fn);
 assert.ok(sql.includes('REVOKE ALL ON FUNCTION public.'+fn),'Missing public privilege revocation '+fn);
}
assert.match(sql,/CREATE OR REPLACE FUNCTION public\.admin_store_reconciliation_issues/);
assert.match(sql,/store_id,raw_record_id,source,source_store_key,source_record_key/);
assert.match(sql,/v_store_key:='store:'\|\|p_store_id/);
assert.match(sql,/ON CONFLICT\(source,source_store_key,source_record_key\) DO UPDATE/);
assert.match(sql,/IF v_rows<1 OR v_rows>1500/);
assert.match(sql,/INVALID_TOTAL_AMOUNT_ROW_/);
assert.match(sql,/AMOUNT_MISMATCH_ROW_/);
assert.match(sql,/jsonb_build_object\('date_only',true,'file_name',p_file_name\)/);
assert.match(sql,/WHERE t\.store_id=p_store_id/);
assert.doesNotMatch(sql,/UPDATE public\.operations_transactions SET store_id/);
assert.match(app,/async operationsScoped\(hqFn,storeFn,hqArgs=\{\},storeArgs=\{\}\)/);
assert.match(app,/if\(context\?\.role==="STORE_MANAGER"\)/);
assert.match(app,/rpc\(storeFn,\{p_store_id:CURRENT_STORE_ID\|\|1,\.\.\.storeArgs\},true\)/);
assert.match(app,/if\(context\?\.role==="HQ"\)return rpc\(hqFn,hqArgs,true\)/);
assert.match(app,/const APP_VERSION="v0\.202"/);
assert.match(ops,/connector_configured===false/);
assert.match(ops,/r\?\.normalized\?'지점 데이터 반영 완료'/);
console.log('PASS per-store sales, reporting and validated CSV import scoped to manager store');
