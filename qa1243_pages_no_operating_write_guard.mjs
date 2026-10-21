import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const pages=readFileSync('.github/workflows/p0-pages-deploy.yml','utf8');
const notify=readFileSync('.github/workflows/verified-pages-deployment-notification.yml','utf8');
const qa=readFileSync('.github/workflows/qa1243-live-e2e.yml','utf8');
const apps=readFileSync('.github/workflows/apps-script-deploy.yml','utf8');
const marker='[QA1243-NO-OPERATING-WRITE]';
// On the special, reviewed QA-only main push all three operating release jobs
// MUST skip, including the job containing POST(mode:deployment) sheet writer.
assert.match(pages,/Verify marked QA-only changes contain no operating assets/);
assert.match(pages,/QA1243_NO_WRITES_UNEXPECTED_MAIN_CHANGE/);
assert.match(pages,/supabase\/functions\/qa1243-mobile-auth\/index\.ts/);
assert.match(pages,/scripts\/qa1243_mobile_http_smoke\.mjs/);
assert.match(qa,/QA-only Safari live public GET POST query security/);
assert.match(qa,/node scripts\/qa1243_mobile_http_smoke\.mjs/);
const safari=readFileSync('supabase/functions/qa1243-mobile-auth/index.ts','utf8');
assert.match(safari,/QA1243_READ_ONLY_PAGE/);
assert.doesNotMatch(safari,/api\.github\.com|github_pat_|SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(safari,/localStorage|sessionStorage/);
assert.match(pages,/const allowed=new Set\(/);
assert.match(pages,/!files\.some\(f=>\[/);
assert.match(pages,/scripts\/qa1243_oauth_bootstrap\.mjs/);
assert.match(pages,/QA1243_OAuth_Start\.cmd/);
assert.match(qa,/node scripts\/qa1243_oauth_bootstrap\.test\.mjs/);
assert.match(qa,/secrets\.QA1243_GOOGLE_OAUTH_CLIENT_SECRET/);
assert.match(qa,/secrets\.QA1243_GOOGLE_OAUTH_REFRESH_TOKEN/);
for(const name of ['build-pages','notify-deployment-result','deploy-pages']){
  const begin=pages.indexOf('\n  '+name+':');
  assert.ok(begin>=0,'Missing Pages job: '+name);
  const rest=pages.slice(begin+4);
  const next=rest.search(/\n  [a-z][a-z-]*:\n/);
  const block=pages.slice(begin,next>=0?begin+4+next:pages.length);
  assert.ok(block.includes('!contains(github.event.head_commit.message, '+JSON.stringify(marker).replace(/"/g,"'")+')'),
    'QA only must skip operating job '+name);
}
assert.match(pages,/body: JSON\.stringify\(\{mode:'deployment'\}\)/);
assert.match(notify,/!contains\(github\.event\.workflow_run\.head_commit\.message, '\[QA1243-NO-OPERATING-WRITE\]'\)/);
assert.match(qa,/QA1243_GOOGLE_OAUTH_CLIENT_ID/);
assert.doesNotMatch(qa,/secrets\.GOOGLE_OAUTH_CLIENT_ID/);
assert.doesNotMatch(apps,/scripts\/qa1243_build_isolated_gas|QA1243_QA_GOOGLE_BOOTSTRAP/);
console.log('PASS QA1243 QA-only main push cannot invoke Pages publisher, operating Sheet refresh, or false production deploy notification');
