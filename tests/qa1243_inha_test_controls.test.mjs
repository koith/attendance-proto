import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync('index.html','utf8');
const a=html.indexOf('function canShowInhaTestControls(){'),b=html.indexOf('function syncInhaTestControls(){',a);
assert.ok(a>0&&b>a,'Use the actual app store eligibility predicate');
const run=(id,{loading=false,unavailable=false,mode='store',hash='#pos'}={})=>new Function('CURRENT_STORE_ID','STORE_ENTRY_LOADING','STORE_ENTRY_UNAVAILABLE','STORE_ENTRY_MODE','location',html.slice(a,b)+'return canShowInhaTestControls();')(id,loading,unavailable,mode,{hash});
test('only resolved available Inha store context exposes floating test controls',()=>{
 assert.equal(run(1),true);
 for(const id of [0,null,NaN,2,80,244,99999])assert.equal(run(id),false,'store '+id);
 for(const state of [{loading:true},{unavailable:true},{mode:'hq'},{hash:'#dashboard'}])assert.equal(run(1,state),false);
 for(const hash of ['#pos','#attendance','#recipe','#admin','#pay','#hours'])assert.equal(run(1,{hash}),true);
});
test('early CSS and version button cannot revive controls outside store scope',()=>{
 for(const id of ['testModeControls','testModeBanner','testTimeModal'])assert.ok(html.includes('html:not(.inha-test-controls) #'+id));
 assert.match(html,/function syncStoreContextUI\(\)\{\s*syncInhaTestControls\(\)/);
 const toggle=readFileSync('version_test_toggle_982.js','utf8');
 assert.match(toggle,/if\(!allowed\(\)\)return;\s*visible=!visible/);
 assert.match(toggle,/baekeok:store-context-change/);
 assert.doesNotMatch(toggle,/BaekeokTest\.set\(/);
});
