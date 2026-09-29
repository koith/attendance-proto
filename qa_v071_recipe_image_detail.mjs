import fs from 'node:fs';import assert from 'node:assert/strict';
const css=fs.readFileSync('recipe_access_v220.css','utf8'),js=fs.readFileSync('recipe_access_v220.js','utf8'),idx=fs.readFileSync('index.html','utf8');
assert(idx.includes('APP_VERSION="v0.71"'));
assert(css.includes('.recipe-v220-thumb img{width:100%;height:100%;object-fit:contain'));
assert(css.includes('.recipe-v220-inline-hero img'));
assert(css.includes('object-fit:contain'));
assert(js.includes('recipe-v220-inline-hero'));
assert(js.includes('등록된 상품 이미지 없음'));
console.log('v0.71 recipe image detail QA PASS');
