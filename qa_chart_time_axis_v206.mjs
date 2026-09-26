import fs from 'node:fs';
import assert from 'node:assert/strict';

const js=fs.readFileSync(new URL('./operations_v1.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('./operations_v1.css',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');

assert.ok(js.includes('axisAt=i=>L+i*group+group/2'),'every time bucket needs one canonical center axis');
assert.ok(js.includes('x=axisAt(i)-barArea/2+si*barW'),'grouped bars must be centered around the time axis');
assert.ok(js.includes('const gx=axisAt(i).toFixed(1)'),'vertical guides must use the same center as bars, points, and labels');
assert.ok(js.includes('plotLayers=mode==="line"?grid+vGuides+marks:grid+marks+vGuides'),'bar axes must remain visible while line points remain above their axes');
assert.ok(js.includes("'<text x=\"'+axisAt(i).toFixed(1)"),'date labels must share the canonical center');
assert.ok(css.includes('.ops-chart svg .ops-chart-vguide{stroke:#b9c5be;stroke-width:.9;opacity:.9'),'time axes must be visibly distinct from horizontal grid lines');
assert.ok(html.includes('operations_v1.js?v=20260926v206'));
assert.ok(html.includes('operations_v1.css?v=20260926v206'));
assert.ok(html.includes('const APP_VERSION="v206"'));

console.log('chart time axis v206 QA PASS');
