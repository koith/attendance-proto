#!/usr/bin/env node
// Reference the canonical GitHub source without copying its body to another comment.
// Original issues/comments and Git history remain intact; this script is read-only.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const digest = s => createHash('sha256').update(s, 'utf8').digest('hex');
const secret = /(?:sk-[a-zA-Z0-9_-]{20,}|gh[pousr]_[a-zA-Z0-9]{20,}|-----BEGIN [^-]*PRIVATE KEY-----)/;
const copiedReceipt = /^\[(?:development-intake:v1:|ai-dev-checkpoint:v1|SEC-AUTO:|AGENT:)/;

export function extractSource(eventName, event) {
  const issue = event.issue;
  let body, kind, author, origin, commentId = null;
  if (eventName === 'issues') {
    if (!['opened', 'edited', 'reopened', 'labeled'].includes(event.action)) return null;
    body = issue?.body;
    kind = 'issue';
    author = issue?.user?.login;
    origin = 'GitHub issue ' + event.action;
  } else if (eventName === 'issue_comment') {
    if (event.action !== 'created' || event.comment?.user?.type === 'Bot' ||
        copiedReceipt.test(String(event.comment?.body || '').trimStart())) return null;
    body = event.comment?.body;
    kind = 'comment';
    author = event.comment?.user?.login;
    commentId = Number(event.comment?.id);
    origin = 'GitHub comment ' + commentId;
  } else if (eventName === 'workflow_dispatch') {
    const n = Number(event.inputs?.issue_number);
    if (!Number.isSafeInteger(n) || n < 1) throw Error('Invalid issue input');
    return {readIssue: n};
  } else {
    throw Error('Unsupported event name');
  }
  const issueNumber = Number(issue?.number);
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1 ||
      !author || typeof body !== 'string' ||
      (kind === 'comment' && (!Number.isSafeInteger(commentId) || commentId < 1))) {
    throw Error('Untrusted or incomplete event source');
  }
  return {issueNumber, kind, author, origin, text: body, title: issue?.title || '', commentId};
}

export function makeReference(source) {
  if (!source || !Number.isSafeInteger(source.issueNumber) || source.issueNumber < 1 || !source.author) {
    throw Error('Invalid source identity');
  }
  if (typeof source.text !== 'string' || !source.text.trim() || source.text.length > 50000) {
    throw Error('Missing or oversized source; not validated');
  }
  if (secret.test(source.text)) throw Error('Sensitive token detected; refusing source validation');
  const id = digest(JSON.stringify([
    source.issueNumber, source.kind, source.author, source.title, source.text
  ]));
  return {
    issue: source.issueNumber,
    kind: source.kind,
    commentId: source.commentId || null,
    sha256: id,
    sourceChars: source.text.length
  };
}

// Backward-compatible validation hook used by existing AI checkpoint integrity checks.
// It validates text in memory and NEVER produces or publishes a copied body.
export function makeReceipt(source) { return makeReference(source); }

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!/^[-\w.]+\/[-\w.]+$/.test(repo || '') || !token || !process.env.GITHUB_EVENT_PATH) {
    throw Error('GitHub context absent; fail closed');
  }
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  let source = extractSource(process.env.GITHUB_EVENT_NAME, event);
  if (!source) {
    console.log('SOURCE_NOT_APPLICABLE');
    return;
  }
  if (source.readIssue) {
    const api = (process.env.GITHUB_API_URL || 'https://api.github.com') +
      '/repos/' + repo + '/issues/' + source.readIssue;
    const response = await fetch(api, {
      method: 'GET',
      headers: {Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token},
      signal: AbortSignal.timeout(15000)
    });
    if (!response.ok) throw Error('SOURCE_READ_FAILED_HTTP_' + response.status);
    const issue = await response.json();
    source = extractSource('issues', {action: 'opened', issue});
    if (!source || source.issueNumber !== Number(event.inputs.issue_number)) {
      throw Error('SOURCE_NUMBER_MISMATCH');
    }
  }
  const reference = makeReference(source);
  const url = 'https://github.com/' + repo + '/issues/' + reference.issue +
    (reference.commentId ? '#issuecomment-' + reference.commentId : '');
  // Never emit original content or create GitHub comments. One compact run summary only.
  console.log('SOURCE_REFERENCE ' + JSON.stringify({...reference, url}));
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
      'GitHub source reference: ' + url + '\n' +
      'SHA-256: ' + reference.sha256 + ' | characters: ' + reference.sourceChars +
      ' | copied comments: 0\n');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error('SOURCE_REFERENCE_FAILED: ' + String(error.message).slice(0,120));
    process.exitCode = 1;
  });
}
