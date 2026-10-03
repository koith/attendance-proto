import fs from 'node:fs';
import assert from 'node:assert/strict';

const gas=fs.readFileSync('apps_script.gs','utf8');
const edge=fs.readFileSync('edge_sync_sheet.ts','utf8');

assert.match(gas,/setValues\(out\)[\s\S]*SpreadsheetApp\.flush\(\)[\s\S]*autoResizeColumns\(1,\s*width\)[\s\S]*SpreadsheetApp\.flush\(\)/,'Apps Script must flush then auto-resize all used columns after write');
assert.match(gas,/column_resize_applied:\s*true/,'Apps Script must report resize proof');
assert.doesNotMatch(gas,/autoResizeColumns[\s\S]{0,120}catch\s*\([^)]*\)\s*\{\s*\/\*[^*]*무시/,'auto-resize failure must not be silently ignored');
assert.match(edge,/SHEET_COLUMN_RESIZE_NOT_CONFIRMED/,'Edge sync must fail closed without resize proof');
assert.match(edge,/resize_scope !== "all_used_columns_after_write"/,'Edge sync must require all used columns');
assert.match(edge,/width_source !== "actual_cell_contents"/,'Edge sync must require actual-cell-content sizing');
console.log('sheet auto-resize contract: PASS');
