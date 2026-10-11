import assert from 'node:assert/strict';
import fs from 'node:fs';

// Exercise the exact browser helper and delegated error handler with fake DOM.
// No live images, employee records or authenticated recipes are accessed.
const source=fs.readFileSync('recipe_access_v220.js','utf8');
const start=source.indexOf('  const recipeThumbPlaceholder=row=>');
const end=source.indexOf('  function recipeDetail(',start);
assert.ok(start>=0&&end>start,'Recipe thumbnail source must exist');
const snippet=source.slice(start,end);
const events=[];
const document={addEventListener:(event,callback,capture)=>events.push({event,callback,capture})};
const window={};
const escapeHtml=v=>String(v??'').replaceAll('&','&amp;').replaceAll('"','&quot;')
  .replaceAll('<','&lt;').replaceAll('>','&gt;');
const create=new Function('window','document','esc',snippet+'\nreturn {recipeThumb,recipeThumbPlaceholder};');
const recipe=create(window,document,escapeHtml);
assert.equal(events.length,1,'One central listener instead of inline handlers');
assert.equal(events[0].event,'error');
assert.equal(events[0].capture,true,'Image errors must be captured');
const base={category:'대용량 베이스',menu_name:'초코 베이스 (20잔 분량)',thumbnail_url:null};
assert.match(recipe.recipeThumb(base),/recipe-v220-thumb-placeholder/);
const rendered=recipe.recipeThumb({...base,thumbnail_url:'https://example.com/unavailable.webp'});
assert.match(rendered,/data-recipe-thumb="1"/);
assert.match(rendered,/data-category="대용량 베이스"/);
assert.match(rendered,/data-menu-name="초코 베이스 \(20잔 분량\)"/);
assert.match(rendered,/loading="lazy"/);
const target={innerHTML:''};
const failed={
  dataset:{category:'대용량 베이스',menuName:'초코 베이스 (20잔 분량)'},
  matches:selector=>selector==='.recipe-v220-thumb img[data-recipe-thumb]',
  closest:selector=>selector==='.recipe-v220-thumb'?target:null
};
events[0].callback({target:failed});
assert.match(target.innerHTML,/베이스 제조/);
assert.match(target.innerHTML,/recipe-v220-thumb-placeholder/);
assert.doesNotMatch(target.innerHTML,/<img/);
const normal={innerHTML:'unchanged'};
events[0].callback({target:{matches:()=>false,closest:()=>normal}});
assert.equal(normal.innerHTML,'unchanged','Unrelated image failures remain unaffected');
create(window,document,escapeHtml);
assert.equal(events.length,1,'Do not install duplicated listeners on route reload');
const escaped=recipe.recipeThumb({category:'라떼',menu_name:'A "special"',thumbnail_url:'https://example.com/a&b.webp'});
assert.match(escaped,/a&amp;b\.webp/);
assert.match(escaped,/data-menu-name="A &quot;special&quot;"/);
console.log('PASS broken recipe photo falls back in cards and modals without unrelated DOM changes');
