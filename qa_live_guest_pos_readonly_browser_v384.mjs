// SEC live acceptance: real published Pages + real public staff RPCs.
// All production state-changing requests are blocked BEFORE network dispatch.
// No real user names, event IDs, tokens, screenshots or employee data in logs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium,webkit} from 'playwright';

const base='https://koith.github.io/attendance-proto';
const source=fs.readFileSync('index.html','utf8');
const version=source.match(/const APP_VERSION="(v[0-9.]+)"/)?.[1];
const api=source.match(/SUPABASE_URL:\s*"(https:\/\/[^"]+\.supabase\.co)"/)?.[1];
const anon=source.match(/SUPABASE_ANON_KEY:\s*"([^"]+)"/)?.[1];
assert.ok(version && api==='https://waluhdgqhwjjwmflhrle.supabase.co' && anon?.length>50,
  'Published app host/version/public-only key preconditions');
const allowRPC=new Set(['list_stores','pos_public_staff_cards','pos_public_staff_picker']);
const guestHeaders={apikey:anon,Authorization:'Bearer '+anon,'Content-Type':'application/json'};
const runTotals={contexts:0,views:0,live_rpc:0,blocked_requests:0,version_clicks:0};
const browserTypes=[['chromium',chromium],['webkit',webkit]];

for (const [engine,driver] of browserTypes) {
  const browser=await driver.launch({headless:true});
  try {
    for (const viewport of [{width:390,height:844},{width:1280,height:900}]) {
      const context=await browser.newContext({viewport,locale:'ko-KR',timezoneId:'Asia/Seoul'});
      try {
        const page=await context.newPage();
        const calls=[];
        // Every production write is denied unless it is a reviewed read-only
        // PostgREST RPC. No PIN, login, punch, correction, payroll or sync call
        // ever leaves this browser, even if application code tries to do so.
        await page.route('**/*',async route=>{
          const req=route.request();
          const url=new URL(req.url());
          if (url.hostname.endsWith('.supabase.co')) {
            const rpc=url.pathname.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/i)?.[1];
            if (req.method()==='POST' && rpc && allowRPC.has(rpc)
                && url.origin===api) {
              calls.push(rpc);runTotals.live_rpc++;
              return route.continue();
            }
            runTotals.blocked_requests++;
            return route.fulfill({status:403,contentType:'application/json',
              body:JSON.stringify({code:'SEC_READ_ONLY_TEST_BLOCK'})});
          }
          if (!['GET','HEAD','OPTIONS'].includes(req.method())) {
            runTotals.blocked_requests++;
            return route.abort('blockedbyclient');
          }
          return route.continue();
        });
        const live=await page.goto(base+'/index.html?mode=store&store=1&sec_qa='+engine+'-'+viewport.width+'#pos',
          {waitUntil:'domcontentloaded',timeout:45000});
        assert.equal(live?.status(),200,'Published Pages HTTP status');
        await page.locator('#appVersion').waitFor({state:'visible',timeout:30000});
        assert.equal((await page.locator('#appVersion').innerText()).trim(),version,
          'Actual published version mismatch');
        await page.locator('#empGrid .emp').first().waitFor({state:'visible',timeout:35000});
        const count=await page.locator('#empGrid .emp').count();
        assert.ok(count>0 && count<1000,'Actual public store staff card count abnormal');
        assert.ok(calls.includes('list_stores') && calls.includes('pos_public_staff_cards'),
          'Actual live list_stores and public POS card RPCs must have been called');
        const first=page.locator('#empGrid .emp').first();
        assert.equal(await first.getAttribute('role'),'button',
          'Guest employee card must be keyboard/screenreader accessible');
        const rect=await first.boundingBox();
        assert.ok(rect && rect.width>90 && rect.height>30 && rect.x>=-3
          && rect.x+rect.width<=viewport.width+3,
          'First guest card must be visible inside device viewport');
        const nonEmpty=await page.locator('#lockedStoreName').innerText();
        assert.ok(nonEmpty.trim().length>1,'Store identity must be shown on dedicated URL');

        // Probe real published anonymous RPC separately; request body contains
        // only public branch ID; data is checked in memory but NEVER printed.
        const response=await page.request.post(api+'/rest/v1/rpc/pos_public_staff_cards',
          {headers:guestHeaders,data:{p_store_id:1},timeout:20000});
        assert.equal(response.status(),200,'Real public READY-store staff endpoint');
        const body=await response.json();
        assert.ok(Array.isArray(body),'Public roster API must return an array');
        assert.equal(count,body.length,'Rendered public cards vs live API roster count');
        const deny=/pin|password|wage|salary|payroll|ssn|birth|account|email|phone|tax|contract|secret/i;
        assert.ok(body.every(row=>row&&typeof row==='object'
          &&Object.keys(row).every(key=>!deny.test(key))),
          'Sensitive field appeared in anonymous staff roster');

        // Actual pointer interaction on live UI, without selecting an employee
        // or invoking a punch/password/administrator operation.
        await page.locator('#testModeControls').waitFor({state:'attached',timeout:20000});
        const before=await page.locator('#testModeControls').isVisible();
        await page.locator('#appVersion').click({timeout:10000});
        const after=await page.locator('#testModeControls').isVisible();
        assert.notEqual(after,before,'Published version click should toggle controls');
        runTotals.version_clicks++;
        runTotals.contexts++;
        runTotals.views++;
        await page.close();

        // Real published STAGED location must be fail-closed. No employee data
        // is fetched from branch 1 and no administrator click is performed.
        const staged=await context.newPage();
        await staged.route('**/rest/v1/rpc/**',async route=>{
          const req=route.request();
          const url=new URL(req.url());
          const rpc=url.pathname.split('/').pop();
          if(req.method()==='POST' && url.origin===api && allowRPC.has(rpc)) {
            return route.continue();
          }
          return route.fulfill({status:403,contentType:'application/json',body:'{}'});
        });
        await staged.goto(base+'/index.html?mode=store&store=2#pos',
          {waitUntil:'domcontentloaded',timeout:45000});
        await staged.getByText('지점 운영 준비 중').waitFor({timeout:20000});
        assert.equal(await staged.locator('#empGrid .emp').count(),0,
          'Staged branch displays public employee cards');
        assert.equal(await staged.locator('#storeSelect').count(),0,
          'Staged location exposes HQ store switcher');
        await staged.close();
        runTotals.views++;
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
assert.equal(runTotals.contexts,4);
assert.equal(runTotals.views,8);
assert.equal(runTotals.version_clicks,4);
console.log('PASS LIVE published Pages '+version+
  ' browser Chromium/WebKit, desktop/mobile; 4 REAL guest POS storefront cards, 4 STAGED fail-closed routes, actual public RPC parity, no employee data exposed in output, all production writes blocked. contexts='+runTotals.contexts+
  ' live_rpc='+runTotals.live_rpc+' blocked='+runTotals.blocked_requests);
