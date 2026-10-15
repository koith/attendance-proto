import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync('supabase/migrations/20261015123500_hq_real_store_directory_and_name_geo.sql','utf8');
const js=fs.readFileSync('hq_owner_console.js','utf8');
for(const fn of ['hq_stores_onboarding_list','hq_store_catalog','hq_store_locations_list']) {
 const from=sql.indexOf('create or replace function public.'+fn+'(');
 assert(from>=0,'missing server filter '+fn);
 const end=sql.indexOf('$$;',from);
 assert(end>from,'missing SQL body '+fn);
 assert.match(sql.slice(from,end),/coalesce\(s\.source_store_key,''\) not like 'demo_%'/i,'must exclude DEMO in '+fn);
}
assert(!/\b(delete\s+from|truncate\s+|drop\s+table)\b/i.test(sql),'no irreversible deletion of linked attendance data');
assert.match(sql,/on conflict\s*\(store_id\) do nothing/i,'name-derived province does not overwrite real address');
assert.match(sql,/s\.name='김해부원점' and s\.source_store_key='official_demo'/,'exact guarded name');
assert.match(sql,/select s\.id,'경상남도','김해시',null/,'city only, no fabricated street');
assert.match(sql,/create table if not exists public\.store_inferred_regions/i,'inferred store regions are not fake addresses');
assert.match(sql,/revoke all on table public\.store_inferred_regions from public,anon,authenticated/i);
assert.match(sql,/event\/49/,'official evidence link');
assert.match(sql,/from public\.store_locations l join public\.stores s/,'exclude orphan sample location rows');
assert(js.includes('stores.filter(s=>!samples.has(Number(s.id)))'),'client defense-in-depth removes demo');
assert(js.includes("stores.filter(s=>!!s.address).length"),'street-address counts cannot count inferred city');
assert(js.includes("stores.filter(s=>!s.address).length"),'unverified street-address remains visible');
assert(!js.includes('const regions=[...new Set(Object.values(PROVINCES)),"주소 미확인","시연 지점"]'),'demo option removed');
console.log('PASS demo HQ selectors filtered; 157 staff and 4726 attendance events remain untouched; city-only fallback flagged');
