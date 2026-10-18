import fs from 'node:fs';import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
const ui=fs.readFileSync('operations_reference_ui_v208.js','utf8');
const src=fs.readFileSync('operations_reference_v208.js','utf8');
// The dedicated store-lock expression was deliberately strengthened to reject
// malformed IDs, explicit mode=store without an ID, and store-path entry.
assert.match(html,/const STORE_ENTRY_LOCK=STORE_ENTRY_MODE==="store"\|\|STORE_ENTRY_ID>0\|\|STORE_ENTRY_PATH\|\|STORE_ENTRY_INVALID;/,
  'dedicated store routes, invalid IDs and ?store=<id> must all remain locked');
assert.match(html,/const STORE_ENTRY_INVALID=STORE_ENTRY_MISSING_ID\|\|/,
  'missing store parameter must be denied, never fall back to a different store');
assert.match(html,/if\(STORE_ENTRY_LOCK\)\{[\s\S]*?shell\.remove\(\);/,
  'locked store cannot regain an HQ store selector');
assert.ok(html.includes('if(STORE_ENTRY_LOCK&&dashboard)location.hash="#pos"'),'store URL must reject HQ dashboard');
// Reference-only source items are rendered as their original textual values,
// not converted to fake measured quantity 0 in the real live inventory card.
assert.ok(ui.includes('const isSource=/^SRC-/i.test(live.sku||"")'),
  'recognized source inventory rows must remain in the reference-only path');
assert.ok(ui.includes('live.source_current_text||row.current_text'),
  'source current stock text must take precedence over absent numeric stock');
assert.ok(ui.includes('esc(row.current_text||"-")'),
  'unmatched source items must still render the supplied source current text');
let raw=src.trim();raw=raw.slice(raw.indexOf('=')+1,-1);const ref=JSON.parse(raw);
assert.equal(ref.inventory.length,172);
assert.ok(ref.inventory.every(x=>x.unit&&x.unit!=='기준'),'all supplied inventory rows need item-specific units');
assert.ok(ref.inventory.every(x=>x.current_text),'all supplied inventory rows need source current-stock text');
console.log('store-entry + source inventory units QA PASS');
