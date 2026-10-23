// QA1243 isolated Supabase Auth Send Email Hook -> signed GAS MailApp transport.
// Disabled unless the operator explicitly configures all secrets and enables it.
// Deployment alone must not configure production Auth Hooks.
import {verifyHook,planMessages,validGasUrl,signedBridgeEnvelope} from './core.mjs';
import {INVITE_HTML} from './invite_template.mjs';

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return new Response('method not allowed',{status:405});
  if (Deno.env.get('QA1243_GMAIL_BRIDGE_ENABLED') !== 'true') return new Response('not enabled',{status:503});
  const hookSecret=Deno.env.get('QA1243_SEND_EMAIL_HOOK_SECRET') || '';
  const sharedSecret=Deno.env.get('QA1243_GMAIL_BRIDGE_SECRET') || '';
  const gasUrl=Deno.env.get('QA1243_GMAIL_BRIDGE_URL') || '';
  if (!hookSecret || sharedSecret.length<32 || !validGasUrl(gasUrl)) return new Response('configuration unavailable',{status:503});
  try {
    const {id,event}=await verifyHook(await request.text(),request.headers,hookSecret);
    const messages=planMessages(event,INVITE_HTML);
    for (let n=0;n<messages.length;n++) {
      const payload=await signedBridgeEnvelope(messages[n],`${id}_${n}`,sharedSecret);
      const response=await fetch(gasUrl,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload),redirect:'follow',signal:AbortSignal.timeout(12000)});
      if (!response.ok) throw Error('RELAY_HTTP_ERROR');
      const raw=await response.text();
      if (raw.length>2048) throw Error('RELAY_RESPONSE_INVALID');
      let receipt;
      try {receipt=JSON.parse(raw);}catch{throw Error('RELAY_RESPONSE_INVALID');}
      if (receipt?.ok!==true) throw Error('RELAY_REJECTED');
    }
    return Response.json({});
  } catch(err) {
    // Never log raw message, recipient, verification token, secret or HTML.
    const code=err instanceof Error ? err.message : 'UNKNOWN';
    const badInput=/^(HOOK_|EMAIL_|TOKEN_|REDIRECT_|INVITE_|EMAIL_ACTION_)/.test(code);
    console.error('QA1243_MAIL_BRIDGE_FAIL',/^[A-Z_]+$/.test(code)?code:'UNEXPECTED');
    return Response.json({error:'auth mail delivery unavailable'}, {status:badInput ? 400 : 503});
  }
});
