#!/usr/bin/env node
// Bounded, read-only view of the existing canonical markdown ledgers.
// Never modifies a ledger or fetches a whole GitHub comment thread.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const LEDGERS = [
  'PROJECT_BACKLOG_20261017.md',
  'SECURITY_STABILITY_LEDGER_20261103.md',
  'AI_AUTOMATION_SECURITY_LEDGER_20261104.md'
];
const MAX = 6000;
const escapeRegex = s => s.replace(/[.*+?^$()|[\]{}\\]/g, '\\$&');

export function compactLedgerContext(documents, id = null, maxChars = MAX) {
  if (!Array.isArray(documents) || !Number.isSafeInteger(maxChars) || maxChars < 1000) {
    throw Error('INVALID_CONTEXT_INPUT');
  }
  if (id !== null && !/^[A-Z][A-Z0-9-]{2,40}$/.test(id)) throw Error('INVALID_TASK_ID');
  const result = {schema: 1, mode: 'bounded-read-only', task: id, sources: [], hits: []};
  const pattern = id && new RegExp('(^|[^A-Z0-9-])' + escapeRegex(id) + '(?![A-Z0-9-])');
  for (const doc of documents) {
    const body = String(doc.content || '');
    const rows = body.split(/\r?\n/);
    result.sources.push({
      path: doc.path, chars: body.length, lines: rows.length,
      sha256: createHash('sha256').update(body).digest('hex').slice(0,16)
    });
    if (!pattern) continue;
    const matches = rows.map((line, i) => ({line: i + 1, text: line}))
      .filter(row => pattern.test(row.text));
    const canonical = matches.filter(row =>
      row.text.startsWith('|') && row.text.split('|')[1]?.trim() === id);
    const last = matches.slice(-4);
    const selected = [...canonical.slice(0, 1), ...last]
      .filter((row, i, arr) => arr.findIndex(x => x.line === row.line) === i);
    result.hits.push(...selected.map(row => ({
      path: doc.path, line: row.line, excerpt: row.text.slice(0, 420)
    })));
  }
  let output = JSON.stringify(result);
  while (output.length > maxChars && result.hits.length) {
    result.hits.pop();
    result.truncated = true;
    output = JSON.stringify(result);
  }
  if (output.length > maxChars) throw Error('METADATA_EXCEEDS_CONTEXT_BUDGET');
  return output;
}
function main() {
  const id = process.argv[2] || null;
  const documents = LEDGERS.map(path => ({path, content: fs.readFileSync(path, 'utf8')}));
  console.log(compactLedgerContext(documents, id));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
