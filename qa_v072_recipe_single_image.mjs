import fs from 'node:fs';import assert from 'node:assert/strict';
const css=fs.readFileSync('recipe_access_v220.css','utf8'),js=fs.readFileSync('recipe_access_v220.js','utf8'),idx=fs.readFileSync('index.html','utf8');
assert(idx.includes('APP_VERSION="v0.72"'));
assert(css.includes('.recipe-v220-card.is-open .recipe-v220-open>.recipe-v220-thumb'));
assert(css.includes('object-fit:contain'));
assert(!css.includes('.recipe-v220-inline-hero'));
assert(!js.includes('recipe-v220-inline-hero'));
console.log('v0.72 single expanded recipe image QA PASS');
