import fs from 'node:fs';
import assert from 'node:assert/strict';

const gas=fs.readFileSync('apps_script.gs','utf8');
assert.match(gas,/h==='날짜'[\s\S]{0,100}setNumberFormat\('yyyy-mm-dd'\)/,'date columns must restore a human-readable date format');
assert.match(gas,/\['출근','퇴근','실근무','총근무','야간근무'\][\s\S]{0,140}setNumberFormat\('\[h\]:mm'\)/,'time/duration columns must restore a human-readable time format');
assert.doesNotMatch(gas,/setNumberFormat\('0(?:\.0+)?'\)/,'date/time report columns must not be intentionally rendered as raw serial numbers');
console.log('sheet display-value contract: PASS');
