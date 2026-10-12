import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const sql=readFileSync('supabase/migrations/20261012154000_verified_passorder_recipe_thumbnail_four.sql','utf8');
const expected=[
  [34,'연유 버터떡','260429-231448-048643'],
  [93,'콜드브루 연유라떼','250918-065749-953581'],
  [104,'패스츄리 호두과자(5EA)','260709-032316-291917'],
  [135,'빅 초코 버터떡','260705-231623-582231']
];
for(const [id,name,token] of expected){
  assert.ok(sql.includes('('+id+'::bigint'),name+' row must be guarded by id');
  assert.ok(sql.includes("'"+name+"'"),name+' must preserve exact menu spelling');
  assert.ok(sql.includes(token+'.image'),name+' must point to its verified merchant menu image');
}
const urls=[...sql.matchAll(/https:\/\/passorder-static\.passorder\.site\/store\/[^'\s]+\.image/g)].map(m=>m[0]);
assert.equal(urls.length,4);
assert.equal(new Set(urls).size,4,'No product may reuse a different product picture');
assert.match(sql,/r\.menu_name = verified\.exact_name/);
assert.match(sql,/r\.is_demo IS FALSE/);
assert.match(sql,/r\.effective_to IS NULL/);
assert.match(sql,/r\.thumbnail_url IS NULL/);
assert.ok(!/delete\s+from|truncate\b/i.test(sql),'Do not delete production recipe data');
console.log('PASS four merchant-listed exact-match photographs, non-destructive guarded migration');
