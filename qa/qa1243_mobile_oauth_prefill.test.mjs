import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync('supabase/functions/qa1243-mobile-auth/index.ts','utf8');
test('mobile OAuth helper pre-fills fixed public QA client, without copy/paste',()=>{
 assert.ok(source.includes('value="293023370445-le7n6lrrbub90i96ol64tt65lss8s6p2.apps.googleusercontent.com"'));
 assert.ok(source.includes('readonly aria-readonly="true"'));
 assert.ok(!source.includes("clientInput.value='';"));
 assert.ok(source.includes("login_hint:expected"));
});
test('mobile OAuth helper remains static/no backend token handling',()=>{
 assert.ok(source.includes('This function NEVER receives, stores, or forwards Google OAuth tokens'));
 assert.ok(source.includes('QA1243_SCOPE_LIST'));
 assert.ok(source.includes("if(req.method!=='GET')"));
 assert.ok(source.includes("'Cache-Control':'no-store"));
 assert.ok(source.includes("'Referrer-Policy':'no-referrer'"));
 assert.ok(source.includes("function pageResponse(req:Request)"));
});
