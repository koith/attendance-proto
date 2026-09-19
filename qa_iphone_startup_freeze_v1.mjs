import fs from 'node:fs';
import assert from 'node:assert/strict';

const index=fs.readFileSync('index.html','utf8');
const meeting=fs.readFileSync('meeting_ui_20260919_v1.js','utf8');
const ios=fs.readFileSync('ios_navigation_resilience.js','utf8');

assert(!index.includes('meeting_ui_20260919_v1.js'), 'main startup must not load runtime UI enhancer');
assert(!index.includes('substitution_entry_v1.js'), 'main navigation must be rendered directly, not injected after startup');
assert(index.includes('id="substitutionEntryV1" href="substitution.html"'), 'substitute entry must exist in canonical markup');
assert(index.includes('id="payMonthPrev"') && index.includes('id="payMonthNext"'), 'payroll month navigation must be canonical markup');
assert(index.includes('movePayMonth'), 'payroll month navigation must be handled by renderPay');
assert(!index.includes('\\n  #substitutionEntryV1'), 'literal backslash-n must not remain in tab CSS');
assert(!index.includes('MutationObserver'), 'main production page must not install a global DOM observer');
assert(!/setInterval\s*\(\s*(?:enhance|render|drawPay)/.test(index), 'UI render/enhance functions must not be timer-driven');
assert(meeting.includes('setInterval(enhance,2000)'), 'legacy enhancer remains documented but must stay unloaded');
assert(ios.includes('MutationObserver'), 'legacy observer file remains detectable so accidental reloading is caught by this test');
console.log('iPhone startup/runtime architecture regression: PASS');
