import assert from 'node:assert/strict';
import { mergeSharedSecret } from './tools/apps_script_secret.mjs';

const repoSource="var SHARED_SECRET = 'REPLACE_WITH_LONG_RANDOM_SECRET';\nfunction doPost() {}\n";
const liveSource="var SHARED_SECRET = 'live-secret-value';\nfunction doPost() {}\n";
assert.equal(
  mergeSharedSecret(repoSource,liveSource),
  "var SHARED_SECRET = 'live-secret-value';\nfunction doPost() {}\n",
  'placeholder source must inherit the deployed secret'
);
assert.equal(mergeSharedSecret(liveSource,liveSource),liveSource,'matching explicit secret may deploy');
assert.throws(
  ()=>mergeSharedSecret("var SHARED_SECRET = 'new-secret';","var SHARED_SECRET = 'live-secret-value';"),
  /differs from deployed value/
);
assert.throws(
  ()=>mergeSharedSecret(repoSource,repoSource),
  /placeholder/
);
assert.throws(
  ()=>mergeSharedSecret("var SHARED_SECRET = '';","var SHARED_SECRET = 'live-secret-value';"),
  /empty/
);

// Live Apps Script source can legitimately use const/let, omit a semicolon,
// or carry an inline comment. These variants must still preserve the live secret.
assert.equal(
  mergeSharedSecret(repoSource,"const SHARED_SECRET = 'live-secret-value' // production secret\nfunction doPost() {}\n"),
  "var SHARED_SECRET = 'live-secret-value';\nfunction doPost() {}\n",
  'const + inline comment source must be accepted'
);
assert.equal(
  mergeSharedSecret(repoSource,"let SHARED_SECRET='live-secret-value'\nfunction doPost() {}\n"),
  "var SHARED_SECRET = 'live-secret-value';\nfunction doPost() {}\n",
  'let + no-semicolon source must be accepted'
);

console.log('PASS Apps Script deployment preserves live SHARED_SECRET and rejects unsafe mismatches');
