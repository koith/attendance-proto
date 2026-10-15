import assert from 'node:assert/strict';
import fs from 'node:fs';

const js=fs.readFileSync('hq_owner_console.js','utf8');
const sql=fs.readFileSync('scripts/verified_store_locations_20261015.sql','utf8');
const start=js.indexOf(' const PROVINCES='),end=js.indexOf(' const resetQuickFilters=',start);
assert(start>=0&&end>start,'HQ address hierarchy declarations available');
const {PROVINCES,ADMIN_DISTRICTS,normalizeProvince,validRegion,region}=
  new Function(js.slice(start,end)+'\nreturn {PROVINCES,ADMIN_DISTRICTS,normalizeProvince,validRegion,region};')();
assert.equal(PROVINCES['광주'],'전남광주통합특별시');
assert.equal(PROVINCES['전남'],'전남광주통합특별시');
assert.equal(normalizeProvince('광주광역시'),'전남광주통합특별시');
assert.equal(normalizeProvince('전라남도'),'전남광주통합특별시');
assert.equal(normalizeProvince('전남광주'),'전남광주통합특별시');
assert.equal(new Set(Object.values(PROVINCES)).size,Object.values(PROVINCES).length-1);
for(const district of ['서구','광산구','북구','동구','나주시','무안군','목포시','순천시','장성군']){
  assert(ADMIN_DISTRICTS['전남광주통합특별시'].includes(district),district+' must be mapped');
  assert(validRegion({province:'전남광주통합특별시',district,subdistrict:''}),district+' valid location');
}
assert.equal(validRegion({province:'전남광주통합특별시',district:'부평구'}),null,'reject invalid child');
assert(validRegion({province:'서울',district:'성동구'}),'legacy province aliases retained');
assert(sql.includes('not exists (select 1 from public.store_locations old'),'never overwrite locations');
assert.match(sql,/on conflict \(store_id\) do nothing/i,'safe repeat');
assert.match(sql,/count\(\*\) from public.stores s2 where s2.name=c.name/,'ambiguous store name rejected');
assert.match(sql,/https:\/\/10billioncoffee.co.kr\/store/,'official source link');
const ids=[...sql.matchAll(/\('([^']+점)',/g)].map(m=>m[1]);
assert.equal(ids.length,12,'12 auditable exact business names');
assert.equal(new Set(ids).size,12,'no duplicate store names');
console.log('PASS 2026 Gwangju-Jeonnam hierarchy aliases, cross-province denials and 12 guarded source-address candidates');

assert.equal(region({is_sample:true}).province,'시연 지점','sample remains distinct from actual unverified');
assert.equal(region({is_sample:false}).province,'주소 미확인');
assert(validRegion({is_sample:true}),'sample region filter must select demos');
const rpc=fs.readFileSync('supabase/migrations/20261015115500_hq_sample_store_flags_v1.sql','utf8');
assert.match(rpc,/auth\.uid\(\) is null or not public\.is_hq_admin\(\)/i,'HQ-only source flag');
assert.match(rpc,/revoke all on function public\.hq_store_sample_flags_list\(\) from public,anon/i,'not anon callable');
assert.match(rpc,/source_store_key like 'demo_%'/i,'must classify by persisted seed source');
assert(js.includes('rpc("hq_store_sample_flags_list").catch(()=>[])'),'optional protected source, older QA mocks unaffected');
assert(js.includes('stores.filter(s=>!samples.has(Number(s.id)))'),'exclude seeded stores from every HQ selector');
assert(js.includes('상세주소 미확인')&&js.includes('지점명 기준'),'name-only geography must be explicit');
assert(!js.includes('"주소 미확인","시연 지점"'),'synthetic region choice must not appear');
const extra=fs.readFileSync('scripts/verified_store_locations_20261015_extra.sql','utf8');
assert(extra.includes('부천신흥시장점')&&extra.includes('남양주다산점'));
assert.match(extra,/on conflict \(store_id\) do nothing/i);
console.log('PASS HQ sample placeholders separated from genuine pending physical addresses, protected RPC and 2 additional source records');
