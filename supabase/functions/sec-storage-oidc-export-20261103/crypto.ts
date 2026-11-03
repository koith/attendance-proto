// Authenticated encrypted envelope. Only ciphertext is ever returned from the Edge API.
// This helper is also tested against generated synthetic keys in isolated CI.
const te=new TextEncoder();
function arrayBuffer(bytes:Uint8Array):ArrayBuffer{const out=new ArrayBuffer(bytes.byteLength);new Uint8Array(out).set(bytes);return out;}
export function base64(bytes:Uint8Array):string{
  const blocks:string[]=[];
  for(let n=0;n<bytes.length;n+=32768)blocks.push(String.fromCharCode(...bytes.subarray(n,n+32768)));
  return btoa(blocks.join(''));
}
export function fromBase64(s:string):Uint8Array{
  const raw=atob(s);return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
export async function sha256(bytes:Uint8Array):Promise<string>{
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',arrayBuffer(bytes)));
  return Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('');
}
export async function seal(plaintext:Uint8Array,recipientSpki:string):Promise<Uint8Array>{
  const key=await crypto.subtle.importKey('spki',arrayBuffer(fromBase64(recipientSpki.replace(/-----[^-]+-----/g,'').replace(/\s/g,''))),{name:'RSA-OAEP',hash:'SHA-256'},false,['encrypt']);
  const contentKey=await crypto.subtle.generateKey({name:'AES-GCM',length:256},true,['encrypt']);
  const rawKey=new Uint8Array(await crypto.subtle.exportKey('raw',contentKey));
  const wrapped=await crypto.subtle.encrypt({name:'RSA-OAEP'},key,arrayBuffer(rawKey));
  const nonce=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:arrayBuffer(nonce),additionalData:arrayBuffer(te.encode('attendance-storage-escrow-v1'))},contentKey,arrayBuffer(plaintext)));
  return te.encode(JSON.stringify({version:1,algorithm:'RSA-OAEP-SHA256+AES-256-GCM',wrapped_key:base64(new Uint8Array(wrapped)),nonce:base64(nonce),ciphertext:base64(ciphertext)}));
}
