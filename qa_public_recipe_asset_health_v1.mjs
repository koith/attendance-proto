import assert from 'node:assert/strict';

// Post-deployment Pages check. Never execute downloaded JavaScript in the QA process.
const root=process.env.APP_SMOKE_HOST||'https://koith.github.io/attendance-proto';
const sha=process.env.GITHUB_SHA||'manual';
let lastError;
for(let attempt=1;attempt<=6;attempt++){
 try{
  const url=new URL(root.replace(/\/+$/,'')+'/operations_reference_v208.js');
  url.searchParams.set('security_release',sha+'-'+attempt);
  const response=await fetch(url,{headers:{'Cache-Control':'no-cache'}});
  if(!response.ok)throw new Error('HTTP '+response.status);
  const text=(await response.text()).trim();
  assert.ok(text.startsWith('window.OPERATIONS_REFERENCE_V208='),'expected source reference object');
  const value=JSON.parse(text.slice('window.OPERATIONS_REFERENCE_V208='.length).replace(/;\s*$/,''));
  assert.ok(Array.isArray(value.recipes)&&value.recipes.length===0,'PUBLISHED_RECIPE_CONTENT_LEAK');
  assert.equal(value.inventory.length,172,'reference inventory must still load');
  assert.equal(value.shelf_life.length,125,'shelf-life reference must still load');
  console.log('PASS live Pages recipe source contains no manufacturing instructions, inventory and shelf life remain intact');
  process.exit(0);
 }catch(error){
  lastError=error;
  if(attempt<6)await new Promise(resolve=>setTimeout(resolve,10000));
 }
}
throw new Error('LIVE_RECIPE_ASSET_NOT_SAFE: '+lastError?.message);
