import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

const version=html.match(/const APP_VERSION="(v0\.\d+)"/)?.[1];
assert.ok(version, "Current app version must exist");
assert.ok(html.includes('aria-label="현재 앱 버전 '+version+'"'), "Menu release version matches visible badge");
assert.ok(html.includes('class="admin-account-trigger"'), 'compact account trigger must exist in admin subnav');
assert.ok(html.includes('class="admin-account-popover"'), 'account popover must exist');
assert.ok(html.includes('id="adminAccountEmail"'), 'signed-in email must be shown inside popover');
assert.ok(html.includes('id="adminAccountSettings"'), 'settings action must exist inside popover');
assert.ok(html.includes('id="adminAccountLogout"'), 'logout action must exist inside popover');
assert.ok(html.includes('confirm("로그아웃하시겠습니까?")'), 'logout must ask for confirmation');
assert.ok(html.includes('await mountAdminSubnav("admin")'), 'admin route must mount the account menu');
assert.ok(!html.includes('class="admin-quick-title"'), 'old large account row must be removed');
assert.ok(!html.includes('id="adminSettingsBtn"'), 'old standalone settings button must be removed');

console.log('admin account menu v222 QA PASS');

// Execute the real shared handler: a closed account menu must not steal Escape.
const vm=await import('node:vm');
const start=html.indexOf('async function mountAdminSubnav('),end=html.indexOf('\nfunction upgradeLegacyPageTitle(',start);
let focuses=0;const listeners={};
const trigger={setAttribute(){},focus(){focuses++}},popover={hidden:true},nodes={adminAccountTrigger:trigger,adminAccountPopover:popover,adminAccountSettings:{},adminAccountLogout:{}};
const context={window:{},view:{querySelectorAll:()=>[],insertAdjacentHTML(){}},adminSubnav:()=>'',document:{getElementById:id=>nodes[id],addEventListener:(k,fn)=>{listeners[k]=fn},removeEventListener(){}},LIVE:true,Auth:{},confirm:()=>false,location:{reload(){}},openPersonalSettings(){},toast(){}};
vm.runInNewContext(html.slice(start,end)+'\nthis.mount=mountAdminSubnav',context);
await context.mount('admin',true);
listeners.keydown({key:'Escape'});assert.equal(focuses,0,'Closed menu must not steal focus from another dialog');
popover.hidden=false;listeners.keydown({key:'Escape'});assert.equal(focuses,1);assert.equal(popover.hidden,true);
console.log('PASS shared account Escape focus stays inside its active menu');

