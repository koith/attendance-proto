import assert from 'node:assert/strict';
import fs from 'node:fs';
const ui=fs.readFileSync('hq_owner_console.js','utf8');
const browser=fs.readFileSync('qa_hq_owner_browser_acceptance.mjs','utf8');
const app=fs.readFileSync('index.html','utf8');
const liveVer=app.match(/const APP_VERSION="v0\.(\d+)";/);
assert.ok(liveVer && Number(liveVer[1])>=274,
  'HQ quick picker keyboard navigation requires a visible new release v0.274+');
assert.match(app,new RegExp('id="appVersion">v0\\.'+liveVer[1]+'</span>'),
  'App badge and embedded release version must match');
const ownerAssets=[...app.matchAll(/hq_owner_console\.js\?v=(\d{8})v(\d+)/g)];
assert.equal(ownerAssets.length,2,'Both HQ owner script bootstrap paths must be cache-busted');
for(const asset of ownerAssets){
 assert.ok(Number(asset[1])>=20261015 && Number(asset[2])>=274,
   'HQ owner picker release must load fresh v0.274+ app JS, not cached old controls');
}

assert.match(ui,/box\.addEventListener\("keydown",event=>/,'Escape listener must be delegated on stable owner container');
assert.match(ui,/event\.key!=="Escape"/,'Only Escape closes the quick picker');
assert.match(ui,/event\.target\?\.closest\?\.\(".hq-quick-overlay"\)/,'Do not hijack unrelated keyboard actions');
assert.match(ui,/event\.preventDefault\(\);event\.stopPropagation\(\);/);
assert.match(ui,/const originatingMode=quickMode;/,'Preserve originating control before closing');
assert.match(ui,/resetQuickFilters\(\);render\(\);/,'No stale region selection after closing');
assert.match(ui,/originatingMode\)body\.querySelector/,'Return focus to the matching picker trigger');
assert.match(ui,/addEventListener\("click",closeQuickPicker\)/,'Button and Escape must share reset behavior');
assert.match(browser,/keyboard\.press\('Escape'\)/,'Browser QA must actually press Escape');
assert.match(browser,/document\.activeElement===el/,'Browser QA must validate restored keyboard focus');
assert.match(browser,/Escape must reset the region before reopen/,'Browser QA must validate initial state');
console.log('PASS HQ quick picker keyboard dismissal and acceptance wiring');
