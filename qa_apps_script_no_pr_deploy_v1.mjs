import assert from 'node:assert/strict';
import fs from 'node:fs';

const yml=fs.readFileSync('.github/workflows/apps-script-deploy.yml','utf8');
assert.match(yml,/pull_request:\s*\n\s*branches:\s*\[main\]/,'Run contract QA for PRs');
assert.match(yml,/push:\s*\n\s*branches:\s*\[main\]/,'Deploy after main push');
assert.match(yml,/name: Push source and redeploy existing web app\s*\n\s*if: github\.event_name != 'pull_request'/,
  'Unmerged PR code must never deploy to an actual Apps Script web app');
assert.match(yml,/name: Confirm Sheet refresh after Apps Script deployment\s*\n\s*if: github\.event_name != 'pull_request'/,
  'Sheet refresh must only follow eligible deployments');
assert.match(yml,/node qa_sheet_auto_resize_contract\.mjs/,'Keep width QA on all PR checks');
assert.match(yml,/node qa_apps_script_no_pr_deploy_v1\.mjs/,'Prevent a future unsafe workflow edit');
console.log('PASS Apps Script deployment denied for PR; main/dispatch remain eligible');
