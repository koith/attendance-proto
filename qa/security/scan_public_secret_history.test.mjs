import assert from "node:assert/strict";
import test from "node:test";
import { scanText } from "../../scripts/security/scan_public_secret_history.mjs";

test("reject GitHub classic token with no token disclosed", () => {
  const token = ["ghp", "_", "A".repeat(36)].join("");
  assert.ok(scanText(token).includes("github-classic-token"));
});
test("reject fine-grained GitHub token", () => {
  const token = ["github", "_pat_", "B".repeat(82)].join("");
  assert.ok(scanText(token).includes("github-fine-grained-token"));
});
test("reject private key PEM marker", () => {
  const pem = ["-----BEGIN ", "PRIVATE KEY", "-----"].join("");
  assert.ok(scanText(pem).includes("private-key"));
});
test("reject Supabase service_role signed JWT and allow anon JWT", () => {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const makeToken = role => [
    header, Buffer.from(JSON.stringify({ role, iss: "supabase" })).toString("base64url"),
    "x".repeat(40)
  ].join(".");
  assert.ok(scanText(makeToken("service_role")).includes("supabase-service-role-jwt"));
  assert.ok(!scanText(makeToken("anon")).includes("supabase-service-role-jwt"));
});
test("reject embedded production-style Postgres password", () => {
  const connection = ["postgres", "://", "dbuser", ":", "p".repeat(18), "@db.example.test:5432/app"].join("");
  assert.ok(scanText(connection).includes("postgres-embedded-password"));
});
test("ignore synthetic PostgreSQL fixture credentials on loopback or Docker service", () => {
  for (const host of ["localhost", "127.0.0.1", "postgres"]) {
    const value = ["postgres://demo:", "s".repeat(20), "@", host, ":5432/fixture"].join("");
    assert.deepEqual(scanText(value), []);
  }
});
test("ignore harmless docs, placeholder secrets and public URL", () => {
  assert.deepEqual(scanText("Read-only SUPABASE_URL=https://example.supabase.co\nGH_TOKEN=fake"), []);
});
