import fs from 'node:fs';
import assert from 'node:assert/strict';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

assert.ok(html.includes('const APP_VERSION="v223"'), 'APP_VERSION must be v223');
assert.ok(html.includes('class="admin-account-trigger"'), 'compact account trigger must exist in admin subnav');
assert.ok(html.includes('class="admin-account-popover"'), 'account popover must exist');
assert.ok(html.includes('id="adminAccountEmail"'), 'signed-in email must be shown inside popover');
assert.ok(html.includes('id="adminAccountSettings"'), 'settings action must exist inside popover');
assert.ok(html.includes('id="adminAccountLogout"'), 'logout action must exist inside popover');
assert.ok(html.includes('await mountAdminSubnav("admin")'), 'admin route must mount the account menu');
assert.ok(!html.includes('class="admin-quick-title"'), 'old large account row must be removed');
assert.ok(!html.includes('id="adminSettingsBtn"'), 'old standalone settings button must be removed');

console.log('admin account menu v222 QA PASS');
