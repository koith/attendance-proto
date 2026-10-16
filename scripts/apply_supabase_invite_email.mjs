#!/usr/bin/env node
// Issue #918: apply ONLY the hosted Supabase Auth invite subject/body.
// This does not touch SMTP secrets, user accounts or authentication policies.
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const PROJECT_REF = "waluhdgqhwjjwmflhrle";
const SUBJECT = "[백억커피] 매장 관리자 계정 초대 안내";
const html = await readFile(new URL("../supabase/email-templates/invite.html", import.meta.url), "utf8");
const expectedPlaceholder = "{{ .ConfirmationURL }}";

function assertTemplate() {
  if ((html.match(/\{\{\s*\.ConfirmationURL\s*\}\}/g) || []).length !== 1)
    throw new Error("Invitation must contain exactly one Supabase confirmation URL");
  if (!/<html\s+lang="ko"/i.test(html) || !html.includes("백억커피") || !html.includes("계정 활성화"))
    throw new Error("Korean brand and account activation text required");
  if (/<script\b|<iframe\b|<form\b|<img\b|onerror\s*=|onload\s*=/i.test(html))
    throw new Error("Mail must not contain active scripts/forms or external images");
  if (!html.includes('href="' + expectedPlaceholder + '"'))
    throw new Error("Invitation button must point directly to the Supabase confirmation URL");
  if (!SUBJECT.startsWith("[백억커피]")) throw new Error("Korean subject required");
}
assertTemplate();
const checksum = createHash("sha256").update(html).digest("hex").slice(0, 16);
if (!process.argv.includes("--apply")) {
  console.log("PASS: Korean email invitation template QA, sha256=" + checksum);
  console.log("Apply requires Supabase Management API token with auth_config_write. No production change in dry-run.");
  process.exit(0);
}
if (process.env.SUPABASE_PROJECT_REF && process.env.SUPABASE_PROJECT_REF !== PROJECT_REF)
  throw new Error("Refusing to apply auth template to a different project");
const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
if (!accessToken) throw new Error("MISSING_SUPABASE_ACCESS_TOKEN (Management API credential required)");
const url = "https://api.supabase.com/v1/projects/" + PROJECT_REF + "/config/auth";
async function call(method, body) {
  const response = await fetch(url, {
    method,
    headers: {Authorization: "Bearer " + accessToken, "Content-Type": "application/json"},
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error("Auth config " + method + " HTTP " + response.status + " (response suppressed to protect secrets)");
  return response.json();
}
const before = await call("GET");
if (before.mailer_subjects_invite === SUBJECT && before.mailer_templates_invite_content === html) {
  console.log("ALREADY_APPLIED: template matches, sha256=" + checksum);
  process.exit(0);
}
await call("PATCH", {
  mailer_subjects_invite: SUBJECT,
  mailer_templates_invite_content: html,
});
const after = await call("GET");
if (after.mailer_subjects_invite !== SUBJECT || after.mailer_templates_invite_content !== html)
  throw new Error("Auth config readback mismatch; do not claim applied");
console.log("APPLIED_VERIFIED: hosted Supabase invite subject and HTML, sha256=" + checksum);
console.log("SMTP sender/domain unchanged; custom SMTP requires separate verified sender configuration.");
