import assert from 'node:assert/strict';
import fs from 'node:fs';

const js=fs.readFileSync(new URL('./operations_v1.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');

assert.ok(js.includes('.filter(x=>x.val!==0)'),'zero-value bars must not reserve a visual slot');
assert.ok(js.includes('clusterW=active.length*barW'),'bar cluster width must follow visible bars');
assert.ok(js.includes('xx=axisAt(i)-clusterW/2+slot*barW'),'visible bars must be centered on each time axis');

const positions=(axis,barWidth,count)=>Array.from({length:count},(_,slot)=>axis-(count*barWidth)/2+slot*barWidth);
const one=positions(100,20,1);
assert.equal(one[0]+10,100,'one visible bar must be centered on the time axis');
const two=positions(100,20,2);
assert.equal((two[0]+10+two[1]+10)/2,100,'two visible bars must straddle the time axis equally');

assert.ok(html.includes('const APP_VERSION="v207"'));
assert.ok(html.includes('operations_v1.js?v=20260926v207'));
console.log('visible bar center v207 QA PASS');
