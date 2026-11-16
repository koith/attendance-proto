// Stable-key GitHub Issue status note: one bot-owned comment per state,
// with immutable original issue/PR/CI evidence referenced by URL.
// Historic comments are never deleted or rewritten. No bulk source mirroring.
const allowedKey = /^[A-Z0-9][A-Z0-9_-]{2,99}$/;
const repoPattern = /^[-\w.]+\/[-\w.]+$/;
const secret = /(?:sk-[a-zA-Z0-9_-]{20,}|gh[pousr]_[a-zA-Z0-9]{20,}|-----BEGIN [^-]*PRIVATE KEY-----)/;
export const marker = key => {
  if (!allowedKey.test(key)) throw Error('INVALID_NOTE_KEY');
  return '[automation-state:v1 key=' + key + ']';
};
export function parseNote(body, key) {
  if (typeof body !== 'string' || !body.startsWith(marker(key) + '\n')) return null;
  const out = {};
  for (const line of body.split('\n').slice(1)) {
    const at = line.indexOf('=');
    if (at < 1) continue;
    const name = line.slice(0, at);
    if (/^[a-z_]{1,32}$/.test(name)) out[name] = line.slice(at + 1);
  }
  return out;
}
function serialize(key, values) {
  const rows = [marker(key)];
  for (const [name, value] of Object.entries(values).sort(([a],[b]) => a.localeCompare(b))) {
    if (!/^[a-z_]{1,32}$/.test(name) || !/^[^\r\n]{0,300}$/.test(String(value))) {
      throw Error('INVALID_NOTE_FIELD');
    }
    rows.push(name + '=' + String(value));
  }
  const body = rows.join('\n');
  if (body.length > 1200 || secret.test(body)) throw Error('INVALID_NOTE_SIZE_OR_SECRET');
  return body;
}
export async function upsertNote({repo, issue, token, key, fields, run, countAttempts = false,
  fetchImpl = fetch}) {
  if (!repoPattern.test(repo || '') || !Number.isSafeInteger(issue) || issue < 1 ||
      !token || !/^\d{1,15}$/.test(String(run)) ||
      !fields || typeof fields !== 'object' || Array.isArray(fields)) {
    throw Error('INVALID_NOTE_CONTEXT');
  }
  marker(key);
  const base = 'https://api.github.com/repos/' + repo;
  const headers = {
    authorization: 'Bearer ' + token,
    accept: 'application/vnd.github+json',
    'content-type': 'application/json',
    'user-agent': 'bounded-issue-state'
  };
  const request = async (path, options = {}) => {
    const response = await fetchImpl(base + path, {
      ...options, headers, redirect: 'error', signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw Error('NOTE_GITHUB_HTTP_' + response.status);
    return response.json();
  };
  let existing = null;
  let complete = false;
  for (let page = 1; page <= 25; page++) {
    const comments = await request('/issues/' + issue + '/comments?per_page=100&page=' + page);
    if (!Array.isArray(comments)) throw Error('NOTE_UNTRUSTED_LIST');
    // Find only GitHub's verified bot author and exact dedicated marker.
    for (const comment of comments) {
      if (comment.user?.login === 'github-actions[bot]' &&
          Number.isSafeInteger(comment.id) && comment.id > 0 &&
          parseNote(comment.body, key)) {
        if (!existing || comment.id > existing.id) existing = comment;
      }
    }
    if (comments.length < 100) { complete = true; break; }
  }
  if (!complete) throw Error('NOTE_HISTORY_PAGINATION_LIMIT');
  const prior = existing ? parseNote(existing.body, key) : null;
  if (countAttempts && prior?.last_run === String(run)) {
    return {result:'UNCHANGED', id:existing.id, attempts:Number(prior.attempts || 0)};
  }
  const attempts = countAttempts
    ? Math.min(9999, (Number(prior?.attempts || 0) || 0) + 1) : undefined;
  const values = {...fields, last_run: String(run)};
  if (countAttempts) values.attempts = String(attempts);
  const body = serialize(key, values);
  if (existing?.body === body) return {result:'UNCHANGED', id:existing.id, attempts};
  const path = existing
    ? '/issues/comments/' + existing.id
    : '/issues/' + issue + '/comments';
  const response = await request(path, {method: existing ? 'PATCH' : 'POST',
    body: JSON.stringify({body})});
  if (!Number.isSafeInteger(response.id) || response.id < 1 ||
      (existing && response.id !== existing.id)) throw Error('NOTE_WRITE_NOT_CONFIRMED');
  return {result: existing ? 'UPDATED' : 'CREATED', id:response.id, attempts};
}
