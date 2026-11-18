import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// HQ operator-only, one-time provisioning for a *not yet confirmed* HQ account.
// No shared administrator secrets or passwords are embedded in the source.
const base = Deno.env.get("SUPABASE_URL") || "";
const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const allowedOrigin = "https://koith.github.io";
const commonHeaders = {
  "Access-Control-Allow-Origin": allowedOrigin,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "Vary": "Origin"
};
const answer = (status: number, code: string) =>
  new Response(JSON.stringify({ok: status === 200, code}), {status, headers: commonHeaders});
const validAccount = (u: any) =>
  Boolean(u && u.id && u.email && u.email_confirmed_at &&
    !u.deleted_at && !u.is_anonymous &&
    (!u.banned_until || new Date(u.banned_until).getTime() <= Date.now()));
async function jsonFrom(path: string, method: string, jwt: string, data?: unknown) {
  const response = await fetch(new URL(path, base), {
    method, redirect: "error",
    headers: {
      apikey: secret,
      Authorization: "Bearer " + jwt,
      "Content-Type": "application/json"
    },
    ...(data === undefined ? {} : {body: JSON.stringify(data)})
  });
  return {status: response.status, ok: response.ok, data: await response.json().catch(() => null)};
}
async function membership(userId: string) {
  const url = new URL("/rest/v1/admin_users", base);
  url.searchParams.set("select", "user_id,email,admin_role,store_id");
  url.searchParams.set("user_id", "eq." + userId);
  const r = await jsonFrom(url.pathname + url.search, "GET", secret);
  if (!r.ok || !Array.isArray(r.data) || r.data.length !== 1) return null;
  return r.data[0];
}
Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") return new Response(null, {status: 204, headers: commonHeaders});
  if (request.method !== "POST") return answer(405, "METHOD_NOT_ALLOWED");
  if (request.headers.get("origin") !== allowedOrigin) return answer(403, "ORIGIN_DENIED");
  if (!base.startsWith("https://waluhdgqhwjjwmflhrle.supabase.co") || !secret)
    return answer(503, "SERVER_CONFIGURATION_UNAVAILABLE");
  const bearer = /^Bearer (\S+)$/i.exec(request.headers.get("authorization") || "");
  if (!bearer) return answer(401, "OPERATOR_LOGIN_REQUIRED");
  const actor = await jsonFrom("/auth/v1/user", "GET", bearer[1]);
  if (!actor.ok || !validAccount(actor.data)) return answer(401, "OPERATOR_LOGIN_REQUIRED");
  const access = await membership(actor.data.id);
  if (!access || access.admin_role !== "HQ" || access.store_id !== null ||
      String(access.email).toLowerCase() !== String(actor.data.email).toLowerCase())
    return answer(403, "HQ_OPERATOR_REQUIRED");

  const raw = await request.text();
  if (raw.length > 1024) return answer(400, "INVALID_REQUEST");
  let submitted: any;
  try { submitted = JSON.parse(raw); } catch { return answer(400, "INVALID_REQUEST"); }
  const email = String(submitted?.email || "").trim().toLowerCase();
  const password = submitted?.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
    typeof password !== "string" || password.length < 10 || password.length > 128 ||
    !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password))
    return answer(400, "INVALID_CREDENTIAL_INPUT");

  const targetLookup = new URL("/rest/v1/admin_users", base);
  targetLookup.searchParams.set("select", "user_id,email,admin_role,store_id");
  targetLookup.searchParams.set("email", "eq." + email);
  const found = await jsonFrom(targetLookup.pathname + targetLookup.search, "GET", secret);
  if (!found.ok || !Array.isArray(found.data) || found.data.length !== 1)
    return answer(404, "ACCOUNT_NOT_FOUND");
  const assigned = found.data[0];
  if (assigned.admin_role !== "HQ" || assigned.store_id !== null ||
      String(assigned.email).toLowerCase() !== email)
    return answer(403, "TARGET_NOT_HQ");
  const targetId = String(assigned.user_id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(targetId) || targetId === actor.data.id)
    return answer(400, "INVALID_TARGET");
  const current = await jsonFrom("/auth/v1/admin/users/" + targetId, "GET", secret);
  const target = current.data?.user || current.data;
  if (!current.ok || !target || target.id !== targetId ||
      String(target.email || "").toLowerCase() !== email ||
      target.deleted_at || target.is_anonymous)
    return answer(409, "TARGET_AUTH_MISMATCH");
  if (target.email_confirmed_at)
    return answer(409, "ALREADY_CONFIRMED_USE_NORMAL_RECOVERY");
  // The administrator provisions only a pending HQ account. GoTrue owns hashing,
  // minimum-password policy and atomic confirmation; password is never logged.
  const changed = await jsonFrom("/auth/v1/admin/users/" + targetId, "PUT", secret,
    {password, email_confirm: true});
  if (!changed.ok) {
    if (changed.status === 422 || changed.status === 400)
      return answer(422, "PASSWORD_REJECTED_BY_AUTH_POLICY");
    return answer(502, "AUTH_ADMIN_UPDATE_FAILED");
  }
  const verified = await jsonFrom("/auth/v1/admin/users/" + targetId, "GET", secret);
  const updated = verified.data?.user || verified.data;
  if (!verified.ok || updated?.id !== targetId || !updated.email_confirmed_at)
    return answer(502, "AUTH_READBACK_NOT_CONFIRMED");
  console.info("HQ_ACCOUNT_PROVISIONED", {actor_id: actor.data.id, target_id: targetId});
  return answer(200, "ACCOUNT_PROVISIONED");
});
