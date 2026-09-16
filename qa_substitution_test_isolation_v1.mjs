import fs from 'node:fs';import assert from 'node:assert/strict';
const js=fs.readFileSync('substitution_v1.js','utf8'),html=fs.readFileSync('substitution.html','utf8');
assert(js.includes("TEST_KEY='baekeok_test_mode_v1'")&&js.includes("TEST_SUB_KEY='baekeok_test_substitution_v1'"));
assert(js.includes("if(testOn())")&&js.includes("a.pin!=='0000'"));
assert(js.includes("saveTestRows(rows)")&&js.includes("운영 데이터는 변경되지 않습니다"));
const testCreate=js.indexOf("if(testOn())",js.indexOf("$('create').onclick")),prodCreate=js.indexOf("substitution_request_create",testCreate);assert(testCreate>0&&prodCreate>testCreate);
assert(html.includes('testSubBanner')&&html.includes('substitution_v1.js?v=20260916b'));
console.log('substitution TEST isolation V1 QA PASS');