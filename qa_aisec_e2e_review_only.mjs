import assert from 'node:assert/strict';
import fs from 'node:fs';
import {test} from 'node:test';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const marker = 'AISEC-E2E-REVIEW-ONLY';

test('review-only marker appears once as a non-rendered HTML comment', () => {
  assert.equal([...html.matchAll(/AISEC-E2E-REVIEW-ONLY/g)].length, 1, 'marker must appear exactly once');
  assert.equal([...html.matchAll(/<!-- AISEC-E2E-REVIEW-ONLY -->/g)].length, 1, 'marker must be an HTML comment');
  assert.match(html, /<!DOCTYPE html>\r?\n<!-- AISEC-E2E-REVIEW-ONLY -->\r?\n<html\b/, 'comment must be beside the opening document markup');

  const withoutComments = html.replace(/<!--[\s\S]*?-->/g, '');
  assert.ok(!withoutComments.includes(marker), 'marker must not remain as rendered HTML or script content');
  const scriptBodies = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(match => match[1]);
  assert.ok(scriptBodies.every(body => !body.includes(marker)), 'marker must not appear in executable script');
});
