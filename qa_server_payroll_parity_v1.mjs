import assert from "node:assert/strict";
import fs from "node:fs";
const browser=fs.readFileSync("index.html","utf8");
const server=fs.readFileSync("supabase/functions/server-sync-sheet/engine.mjs","utf8");
function body(src,signature){
  const start=src.indexOf(signature);
  assert.ok(start>=0,"missing "+signature);
  const end=src.indexOf("\n}\n",start);
  assert.ok(end>start,"unclosed "+signature);
  return src.slice(start,end+2);
}
// The deployed payroll runtime intentionally embeds browser functions verbatim.
// Detect any drift BEFORE writing live payslips or Google Sheets.
for(const f of [
  "async function computeMonthPayroll(ym)",
  "async function buildSheetSyncPayload(ym)",
  "function calcPayroll(",
  "function applyCorrections(",
  "function pairEvents(",
  "function idOrder(",
  "function fromIso("
])assert.equal(body(server,f),body(browser,f),"server/browser payroll or attendance algorithm drift: "+f);
// The only consciously reimplemented helper computes elapsed Sunday closures.
// Keep this checked against the browser's shared helper.
const weeks=fs.readFileSync("payroll_elapsed_weeks_v1.js","utf8");
assert.match(weeks,/if\(m<cur\)return 4/);
assert.match(weeks,/if\(m>cur\)return 0/);
assert.match(weeks,/d<now\.getDate\(\)/);
assert.match(server,/if\(ym<cur\)return 4/);
assert.match(server,/if\(ym>cur\)return 0/);
assert.match(server,/d<nowWall\.getDate\(\)/);
console.log("PASS browser/server payroll core, attendance corrections, sheet report and elapsed-week source parity");
