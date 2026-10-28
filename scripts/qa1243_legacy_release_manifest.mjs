// Build only public release metadata; never read credentials or operating data.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const index=readFileSync('index.html','utf8');
const version=index.match(/const APP_VERSION="(v\d+\.\d+)"/)?.[1];
const commit=process.env.GITHUB_SHA;
assert.match(commit||'',/^[a-f0-9]{40}$/,'exact release SHA required');
assert.ok(version);
writeFileSync('app-release.json',JSON.stringify({version,commit,index_sha256:createHash('sha256').update(index).digest('hex')})+'\n');
console.log('PUBLIC_RELEASE_MANIFEST_READY '+JSON.stringify({version,commit}));
