// QA1243: pure, Deno/Node-compatible code. Never log links, tokens or hook bodies.
const PROJECT_REF = 'waluhdgqhwjjwmflhrle';
const BASE = `https://${PROJECT_REF}.supabase.co`;
const ROOT = 'https://koith.github.io/attendance-proto/';
const ACTIVATION = `${ROOT}owner_activation.html`;
const MAX_AGE_SECONDS = 300;
const encoder = new TextEncoder();

function decodeBase64(value) {
  const s = atob(value);
  return Uint8Array.from(s, c => c.charCodeAt(0));
}
function encodeBase64(bytes) {
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text);
}
async function hmac(key, message) {
  const imported = await crypto.subtle.importKey('raw', key, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, encoder.encode(message)));
}
function sameBytes(a, b) {
  let diff = a.length ^ b.length;
  for (let i=0;i<Math.max(a.length,b.length);i++) diff |= (a[i] || 0) ^ (b[i] || 0);
  return diff === 0;
}
function hookKey(secret) {
  if (!/^v1,whsec_[A-Za-z0-9+/=]{40,}$/.test(secret || '')) throw Error('HOOK_SECRET_INVALID');
  let key;
  try { key = decodeBase64(secret.substring('v1,whsec_'.length)); } catch { throw Error('HOOK_SECRET_INVALID'); }
  if (key.length < 32) throw Error('HOOK_SECRET_INVALID');
  return key;
}
export async function verifyHook(raw, headers, secret, now=Date.now()) {
  if (typeof raw !== 'string' || raw.length > 32768) throw Error('HOOK_BODY_INVALID');
  const id = headers.get('webhook-id');
  const stamp = headers.get('webhook-timestamp');
  const sig = headers.get('webhook-signature');
  if (!id || !/^[\w-]{1,128}$/.test(id) || !stamp || !/^\d{10}$/.test(stamp) || !sig) throw Error('HOOK_HEADERS_INVALID');
  if (Math.abs(Math.floor(now/1000) - Number(stamp)) > MAX_AGE_SECONDS) throw Error('HOOK_TIMESTAMP_EXPIRED');
  const expected = await hmac(hookKey(secret), `${id}.${stamp}.${raw}`);
  const candidates = sig.split(' ').filter(v => /^v1,[A-Za-z0-9+/=]+$/.test(v));
  if (!candidates.some(v => { try {return sameBytes(decodeBase64(v.slice(3)), expected);}catch{return false;} })) throw Error('HOOK_SIGNATURE_INVALID');
  let event;
  try { event = JSON.parse(raw); } catch { throw Error('HOOK_JSON_INVALID'); }
  return {id, event};
}
function validEmail(v) {
  if (typeof v !== 'string' || v.length > 254 || /[\r\n<>,\s]/.test(v) || !/^[^@]+@[^@]+\.[^@]+$/.test(v)) throw Error('EMAIL_INVALID');
  return v;
}
function tokenHash(v) {
  if (typeof v !== 'string' || !/^[a-fA-F0-9]{64}$/.test(v)) throw Error('TOKEN_HASH_INVALID');
  return v;
}
function redirectUrl(v) {
  if (v !== ROOT && v !== ACTIVATION) throw Error('REDIRECT_NOT_ALLOWLISTED');
  return v;
}
function escapeHtml(v) { return v.replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function verifyLink(kind, hash, redirect) {
  const url = new URL(`${BASE}/auth/v1/verify`);
  url.searchParams.set('token', tokenHash(hash));
  url.searchParams.set('type', kind);
  url.searchParams.set('redirect_to', redirectUrl(redirect));
  return url.toString();
}
function simpleMessage(to, kind, hash, redirect, title) {
  const link=verifyLink(kind,hash,redirect);
  return {to,subject:`[백억커피] ${title}`,body:`백억커피 인증 안내입니다. 다음 주소로 본인 확인을 완료하세요: ${link}`,
    html:`<!doctype html><html lang="ko"><body><h2>백억커피 ${escapeHtml(title)}</h2><p>아래 주소에서 본인 확인을 완료해 주세요.</p><a href="${escapeHtml(link)}">인증 계속하기</a><p>요청하지 않았다면 무시하세요.</p></body></html>`};
}
export function planMessages(event, inviteHTML) {
  const user = event?.user, data = event?.email_data;
  if (!user || !data || typeof data !== 'object') throw Error('HOOK_PAYLOAD_INVALID');
  const to = validEmail(user.email);
  const redirect = redirectUrl(data.redirect_to || ROOT);
  switch(data.email_action_type) {
    case 'invite': {
      if (typeof inviteHTML !== 'string' || (inviteHTML.match(/\{\{ \.ConfirmationURL \}\}/g)||[]).length!==1) throw Error('INVITE_TEMPLATE_INVALID');
      const link=verifyLink('invite',data.token_hash,redirect);
      return [{to,subject:'[백억커피] 매장 관리자 계정 초대 안내',
        body:`백억커피 관리자 계정 초대입니다. 본인 확인과 비밀번호 설정: ${link}`,
        html:inviteHTML.replace('{{ .ConfirmationURL }}',escapeHtml(link))}];
    }
    case 'signup':return [simpleMessage(to,'signup',data.token_hash,redirect,'가입 이메일 인증')];
    case 'magiclink':return [simpleMessage(to,'magiclink',data.token_hash,redirect,'로그인 링크')];
    case 'recovery':return [simpleMessage(to,'recovery',data.token_hash,redirect,'비밀번호 재설정')];
    case 'email_change': {
      const newer = validEmail(user.new_email);
      if (data.token_hash_new && data.token_hash) {
        // Supabase's historically reversed field mapping is intentional.
        return [simpleMessage(to,'email_change',data.token_hash_new,redirect,'기존 이메일 변경 확인'),
          simpleMessage(newer,'email_change',data.token_hash,redirect,'새 이메일 변경 확인')];
      }
      return [simpleMessage(newer,'email_change',data.token_hash,redirect,'이메일 변경 확인')];
    }
    default: throw Error('EMAIL_ACTION_UNSUPPORTED');
  }
}
export function validGasUrl(input) {
  try {const u=new URL(input);return u.protocol==='https:' && u.hostname==='script.google.com' && /^\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u.pathname) && !u.username && !u.password && !u.search && !u.hash;}catch{return false;}
}
export async function signedBridgeEnvelope(message, id, secret, now=Date.now()) {
  return signedData({to:message.to,subject:message.subject,body:message.body,html:message.html},id,secret,now);
}
export async function signedConnectivityEnvelope(id, secret, now=Date.now()) {
  return signedData({operation:'connectivity'},id,secret,now);
}
async function signedData(data, id, secret, now) {
  if (typeof secret!=='string' || secret.length<32) throw Error('BRIDGE_SECRET_MISSING');
  const nonce = id;
  if (!/^[\w-]{1,128}$/.test(nonce)) throw Error('RELAY_NONCE_INVALID');
  const sent_at=Math.floor(now/1000);
  const signature=encodeBase64(await hmac(encoder.encode(secret),`${sent_at}.${nonce}.${JSON.stringify(data)}`));
  return {sent_at,nonce,data,signature};
}
export const BRIDGE_REF=PROJECT_REF;
