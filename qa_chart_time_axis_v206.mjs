import fs from 'node:fs';
import assert from 'node:assert/strict';

const js=fs.readFileSync(new URL('./operations_v1.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('./operations_v1.css',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');

assert.ok(js.includes('axisAt=i=>L+i*group+group/2'),'every time bucket needs one canonical center axis');
assert.ok(js.includes('clusterW=active.length*barW'),'bar clusters must use only visible bars');
assert.ok(js.includes('xx=axisAt(i)-clusterW/2+slot*barW'),'visible bar clusters must be centered around the time axis');
assert.ok(js.includes('const gx=axisAt(i).toFixed(1)'),'vertical guides must use the same center as bars, points, and labels');
assert.ok(js.includes('plotLayers=mode==="line"?grid+vGuides+marks:grid+marks+vGuides'),'bar axes must remain visible while line points remain above their axes');
assert.ok(js.includes("'<text x=\"'+axisAt(i).toFixed(1)"),'date labels must share the canonical center');
assert.ok(css.includes('.ops-chart svg .ops-chart-vguide{stroke:#b9c5be;stroke-width:.9;opacity:.9'),'time axes must be visibly distinct from horizontal grid lines');
const version=html.match(/const APP_VERSION="(v\d+)"/)?.[1];
assert.ok(version,'app version must exist');
assert.match(html,new RegExp(`operations_v1\\.js\\?v=\\d{8}${version}`));
assert.match(html,new RegExp(`operations_v1\\.css\\?v=\\d{8}${version}`));

console.log('chart time axis QA PASS');
