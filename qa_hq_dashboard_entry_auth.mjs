// HQ access regression guard. Run: node qa_hq_dashboard_entry_auth.mjs
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
assert.match(html,/function openHqDashboard\(\)\s*\{[\s\S]*?STORE_ENTRY_LOCK/,'dedicated store entry must not navigate to HQ');
assert.doesNotMatch(html,/getElementById\(["']hqHome["']\)\.(?:onclick|addEventListener)/,'logo must not become a dashboard navigation control');
const dashboard=html.match(/if\(h==="dashboard"\)\{[^\n]+/);
assert.ok(dashboard,'dashboard route must exist');
assert.match(dashboard[0],/STORE_ENTRY_LOCK/,'store-entry route must be blocked');
assert.match(dashboard[0],/(?:adminContext|isHqAdmin|is_hq_admin)/,'HQ route must check server-authoritative HQ role');
console.log('HQ route authorization regression: PASS');
