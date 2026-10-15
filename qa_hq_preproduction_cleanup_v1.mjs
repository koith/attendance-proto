import assert from 'node:assert/strict';
import fs from 'node:fs';
const f=p=>fs.readFileSync(p,'utf8');
const classify=f('supabase/migrations/20261015123500_hq_real_store_directory_and_name_geo.sql');
const archive=f('supabase/migrations/20261015132500_archive_confirmed_seed_data_before_cleanup.sql');
const prune=f('supabase/migrations/20261015133000_purge_archived_nonproduction_seed_records.sql');
const ui=f('hq_owner_console.js');
for (const name of ['hq_stores_onboarding_list','hq_store_catalog','hq_store_locations_list']){
  const start=classify.indexOf('create or replace function public.'+name+'(');
  assert(start>=0,name+' must keep current HQ API');
  const end=classify.indexOf('$$;',start);
  assert(end>start);
  assert(classify.slice(start,end).includes("coalesce(s.source_store_key,'') not like 'demo_%'"),name+' excludes fake shops server-side');
}
assert.match(classify,/s.name='김해부원점' and s.source_store_key='official_demo'/,'name-derived address must only touch exact genuine listing');
assert.match(classify,/select s.id,null,'경상남도','김해시',null/,'no synthetic street address');
assert(ui.includes('stores.filter(s=>!samples.has(Number(s.id)))'),'HQ picker hides seeded shops client-side');
assert(ui.includes('상세주소 미확인')&&ui.includes('지점명 기준'),'name-derived geography must be disclosed');
assert(!ui.includes(',"주소 미확인","시연 지점"'),'fake shop picker not exposed');
for(const [table,count] of [['stores',39],['store_locations',4],['employees',893],['attendance_events',5236],['employment_periods',719],['employment_contracts',719],['employment_contract_workdays',3595]]){
  assert.match(archive,new RegExp('CREATE TABLE demo_cleanup_archive\\.'+table+'_20261015 AS'),'archive '+table+' before deletion');
  assert(prune.includes('demo_cleanup_archive.'+table+'_20261015'),'prune only archived '+table);
  assert(prune.includes('<>'+count)||prune.includes('<> '+count),'guard '+table+' count '+count);
}
assert.match(archive,/REVOKE ALL ON SCHEMA demo_cleanup_archive FROM PUBLIC, anon, authenticated/i);
assert.match(archive,/REVOKE ALL ON ALL TABLES IN SCHEMA demo_cleanup_archive FROM PUBLIC,anon,authenticated/i);
assert.match(prune,/SOURCE_VS_ARCHIVE_MISMATCH_REFUSE_PURGE/);
assert.match(prune,/LIVE_BUSINESS_REFERENCE_REFUSE_PURGE/);
assert.match(prune,/INHA_READY_STORE_GUARD/);
assert.match(prune,/EXCEPT ALL/,'composite workdays compared as multiset');
assert.match(prune,/NOT EXISTS \(SELECT 1 FROM public.stores WHERE id=1/,'production store must remain');
assert.doesNotMatch(prune,/DELETE FROM public\.stores\s*;/i);
assert.doesNotMatch(prune,/DELETE FROM public\.employees\s*;/i);
assert.doesNotMatch(prune,/DROP\s+SCHEMA\s+demo_cleanup_archive/i);
assert.match(prune,/COMMIT;/);
console.log('PASS HQ-only real store directory, nonfabricated city fallback, 7 archived seed families, exact counts, no real data rewrite');
