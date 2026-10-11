import assert from 'node:assert/strict';
import fs from 'node:fs';

// Execute the checked-in admin tab renderer against Inha and staged stores.
// No production account, store, or payroll data is accessed or changed.
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('function adminSubnav(active){');
const end=html.indexOf('\nasync function mountAdminSubnav(',start);
assert.ok(start>0 && end>start,'Extract canonical admin subnav');
const fn=new Function('CURRENT_STORE_ID','active',
  html.slice(start,end)+'\nreturn adminSubnav(active);');
const tabs=(id,active='admin')=>Array.from(fn(id,active).matchAll(/href="#([^"]+)"/g),m=>m[1]);
const inha=['report','admin','pay','hours','sales','inventory'];
const scoped=['admin','pay','hours'];
assert.deepEqual(tabs(1),inha,'Inha University store retains all management tabs');
for(const id of [2,283]){
  assert.deepEqual(tabs(id),scoped,'Other store '+id+' must show only approved tabs');
  assert.deepEqual(tabs(id,'pay'),scoped,'Changing active tab must not expose hidden tabs');
}
const routeStart=html.indexOf('function route(){');
const routeEnd=html.indexOf('// 관리자 탭 로그인 게이트',routeStart);
assert.ok(routeStart>0 && routeEnd>routeStart,'Extract route boundary');
const route=html.slice(routeStart,routeEnd);
assert.match(route,/\["report","sales","inventory","ops"\]\.includes\(h\)&&Number\(CURRENT_STORE_ID\)!==1/);
assert.match(route,/location\.hash="#admin";return;/,'Direct hash navigation must redirect restricted stores');
assert.match(html,/if\(ctx\?\.role==="STORE_MANAGER"\)/);
assert.match(html,/Number\(CURRENT_STORE_ID\)!==ownStore/);
assert.match(html,/location\.assign\(STORE_ENTRY_URL\(ownStore\)\)/);
console.log('PASS Inha full management tabs, non-Inha three-tab policy and store-scoped navigation guards');
