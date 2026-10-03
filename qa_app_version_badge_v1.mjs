import fs from 'node:fs';
import assert from 'node:assert/strict';
const html=fs.readFileSync('index.html','utf8');
const m=html.match(/const APP_VERSION="(v\d+(?:\.\d+)*)";/);
assert(m,'APP_VERSION constant required');
assert(html.includes('id="appVersion"'),'visible app version badge required');
assert(html.includes('document.getElementById("appVersion").textContent=APP_VERSION'),'badge must bind to APP_VERSION');

assert(/\.app-version-badge\{[^}]*display:inline-block/.test(html),'version badge style contract required');
console.log('app version badge QA: PASS',m[1]);
