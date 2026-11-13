#!/usr/bin/env node
// SEC-S15 / AISEC-06: redact-only, offline scan of tracked files AND all Git blob history.
// Never print matched credentials or source lines. No external dependencies or network.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_BLOB_BYTES = 16 * 1024 * 1024;
const MAX_FINDINGS = 100;
const RULES = [
  ["github-classic-token", /\bgh[pousr]_[A-Za-z0-9]{36}\b/],
  ["github-fine-grained-token", /\bgithub_pat_[A-Za-z0-9_]{60,}\b/],
  ["openai-api-key", /\bsk-(?:proj-)?[A-Za-z0-9_-]{40,}\b/],
  ["supabase-secret-key", /\bsb_secret_[A-Za-z0-9_-]{12,}\b/],
  ["private-key", /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/],
];
const SERVICE_JWT = /\b(eyJ[A-Za-z0-9_-]{12,})\.(eyJ[A-Za-z0-9_-]{12,})\.([A-Za-z0-9_-]{16,})\b/g;

export function scanText(value) {
  const text = typeof value === "string" ? value : value.toString("utf8");
  const hits = [];
  for (const [rule, pattern] of RULES) if (pattern.test(text)) hits.push(rule);
  // localhost/127.0.0.1 and Docker service "postgres" are ephemeral synthetic CI fixtures.
  // Remote embedded DB passwords still fail; no real connection string is logged.
  const postgresUrls = /\bpostgres(?:ql)?:\/\/[^:\s\/@]{1,64}:[^@\s\/]{12,}@([A-Za-z0-9.-]+)/g;
  for (const match of text.matchAll(postgresUrls)) {
    const host = match[1].toLowerCase();
    if (!["localhost", "127.0.0.1", "postgres"].includes(host) &&
        !hits.includes("postgres-embedded-password")) {
      hits.push("postgres-embedded-password");
    }
  }
  for (const match of text.matchAll(SERVICE_JWT)) {
    try {
      const payload = JSON.parse(Buffer.from(match[2], "base64url").toString("utf8"));
      if (payload.role === "service_role" && !hits.includes("supabase-service-role-jwt")) {
        hits.push("supabase-service-role-jwt");
      }
    } catch { /* Not a valid JWT; do not report a source value. */ }
  }
  return hits;
}

function git(args, input, maxBuffer = 96 * 1024 * 1024) {
  const r = spawnSync("git", args, { input, maxBuffer, encoding: "buffer" });
  if (r.error || r.status !== 0) {
    throw new Error("Git operation failed: " + args[0] + " (status " + r.status + ")");
  }
  return r.stdout;
}
function isBinary(bytes) {
  return bytes.subarray(0, 8192).includes(0);
}
function record(findings, origin, path, bytes) {
  if (isBinary(bytes)) return;
  for (const rule of scanText(bytes)) {
    if (findings.length < MAX_FINDINGS) findings.push({ origin, path, rule });
  }
}
function scanCurrent(findings) {
  const names = git(["ls-files", "-z"]).toString("utf8").split("\0").filter(Boolean);
  let oversize = 0;
  for (const name of names) {
    let bytes;
    try { bytes = readFileSync(name); } catch { continue; }
    if (bytes.length > MAX_BLOB_BYTES) { oversize++; continue; }
    record(findings, "working-tree", name, bytes);
  }
  return { checked: names.length, oversize };
}
function scanHistory(findings) {
  const lines = git(["rev-list", "--objects", "--all"]).toString("utf8").trim().split("\n");
  const paths = new Map();
  for (const line of lines) {
    const sep = line.indexOf(" ");
    const sha = sep < 0 ? line : line.slice(0, sep);
    if (/^[0-9a-f]{40,64}$/.test(sha) && !paths.has(sha)) {
      paths.set(sha, sep < 0 ? "(unnamed blob)" : line.slice(sep + 1));
    }
  }
  const shas = [...paths.keys()];
  if (!shas.length) throw new Error("No Git objects found; full-history checkout required");
  const checks = git(
    ["cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)"],
    Buffer.from(shas.join("\n") + "\n")
  ).toString("utf8").trim().split("\n");
  const blobs = [];
  let oversize = 0;
  for (const line of checks) {
    const [sha, kind, length] = line.split(" ");
    if (kind !== "blob") continue;
    if (Number(length) > MAX_BLOB_BYTES) { oversize++; continue; }
    blobs.push(sha);
  }
  // Small bounded batches avoid loading an entire repository's historical contents into memory.
  for (let offset = 0; offset < blobs.length; offset += 32) {
    const batch = blobs.slice(offset, offset + 32);
    const output = git(["cat-file", "--batch"], Buffer.from(batch.join("\n") + "\n"), 540 * 1024 * 1024);
    let cursor = 0;
    for (const sha of batch) {
      const end = output.indexOf(10, cursor);
      if (end < 0) throw new Error("Truncated git cat-file header");
      const header = output.subarray(cursor, end).toString("utf8").split(" ");
      const length = Number(header[2]);
      if (header[0] !== sha || header[1] !== "blob" || !Number.isSafeInteger(length)) {
        throw new Error("Unexpected git cat-file object");
      }
      const start = end + 1;
      if (start + length >= output.length) throw new Error("Truncated git cat-file object");
      record(findings, "git-blob:" + sha.slice(0, 12), paths.get(sha), output.subarray(start, start + length));
      cursor = start + length + 1;
    }
  }
  return { checked: blobs.length, oversize };
}
function main() {
  const findings = [];
  const current = scanCurrent(findings);
  const history = process.argv.includes("--history") ? scanHistory(findings) : { checked: 0, oversize: 0 };
  // Only finding metadata is printed. NEVER print matched values, snippets, raw URLs or env values.
  for (const item of findings) {
    console.error("REDACTED_SECRET_FINDING rule=" + item.rule + " origin=" + item.origin +
      " file=" + JSON.stringify(item.path));
  }
  console.log("SEC-S15 audit: current=" + current.checked + " history_blobs=" + history.checked +
    " findings=" + findings.length + " oversize=" + (current.oversize + history.oversize));
  if (current.oversize + history.oversize) {
    console.error("INCOMPLETE_SCAN: blobs over 16 MiB require separate offline review");
    process.exitCode = 2;
  }
  if (findings.length) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { main(); } catch (error) {
    console.error("SECRET_SCAN_ERROR: " + error.message);
    process.exitCode = 2;
  }
}
