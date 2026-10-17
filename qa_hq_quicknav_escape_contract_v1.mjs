import assert from 'node:assert/strict';
import fs from 'node:fs';
const ui=fs.readFileSync('hq_owner_console.js','utf8');
const browser=fs.readFileSync('qa_hq_owner_browser_acceptance.mjs','utf8');
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
assert.match(ui,/box\.__hqOwnerKeyboardCleanup\?\.\(\)/,
  'Reopening must release prior listeners');
assert.match(ui,/const stopOutsideKeys=/,'Quick popup must support listener disposal');
assert.match(ui,/if\(quickMode\)startOutsideKeys\(\);else stopOutsideKeys\(\);/,
  'Only an open popup may capture document keyboard events');
assert.match(ui,/new MutationObserver/,'Outer modal dismissal and unmount must be detected');
assert.match(ui,/new AbortController\(\)/,'Remount must abort old delegated listener');
assert.match(browser,/Remount must not leak prior keyboard listeners/);
assert.match(browser,/Unrelated focus must not be intercepted/);
assert.match(browser,/Unmount must unregister keyboard capture/);
const app=fs.readFileSync('index.html','utf8');
const version=app.match(/const APP_VERSION="v0\.(\d+)";/);
assert.ok(version&&Number(version[1])>=274,
  'HQ quick picker keyboard fix must have a distinguishable published app version');
assert.ok(new RegExp('id="appVersion"[^>]*>v0[.]'+version[1]+'</button>').test(app),
  'Visible release badge and JS version must agree');
const quickScripts=[...app.matchAll(/hq_owner_console\.js\?v=(\d{8}v\d+)/g)].map(m=>m[1]);
assert.equal(quickScripts.length,2,'Both lazy and static HQ script loaders must bust browser cache');
assert.equal(new Set(quickScripts).size,1,'Both HQ script loaders must use the same artifact revision');
const [date,revision]=quickScripts[0].split('v').map(Number);
assert.ok(date>=20261015&&revision>=274,
  'Old v0.271 HQ script cache may not hide Escape and Tab accessibility changes');
console.log('PASS HQ quick picker keyboard dismissal and acceptance wiring');
