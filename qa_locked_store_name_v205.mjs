import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');

assert.ok(html.includes('const APP_VERSION="v205"'),'version must be v205');
assert.ok(html.includes('id="lockedStoreName"'),'locked store name element is required');
assert.ok(html.includes('>인하대학교점</span><span class="app-version-badge"'),'Inha entry needs a useful first-paint label');
assert.ok(html.includes('lockedName.classList.toggle("show",STORE_ENTRY_LOCK&&!dashboard)'),'fixed store name must only show on locked store pages');
assert.ok(html.includes('crumb.classList.toggle("store-context-selector-hidden",dashboard)'),'store breadcrumb must remain visible beside the fixed name');
assert.ok(html.includes('STORE_NAME_BY_ID.get(Number(CURRENT_STORE_ID))'),'fixed label must resolve the selected store name');
assert.ok(html.includes('syncStoreContextUI();\n }catch'),'store label must refresh after the store list loads');

console.log('locked store name v205 QA PASS');
