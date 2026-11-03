import {seal,sha256,fromBase64,base64} from '../../supabase/functions/sec-storage-oidc-export-20261103/crypto.ts';
Deno.test('RSA-OAEP/AES-GCM roundtrip of synthetic file; tampering refused',async()=>{
 const pair=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:3072,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
 const pubBytes=new Uint8Array(await crypto.subtle.exportKey('spki',pair.publicKey));
 const pub='-----BEGIN PUBLIC KEY-----\n'+base64(pubBytes)+'\n-----END PUBLIC KEY-----';
 const sample=new TextEncoder().encode('synthetic-only-backup-data');
 const sealed=JSON.parse(new TextDecoder().decode(await seal(sample,pub)));
 if(sealed.version!==1||sealed.algorithm!=='RSA-OAEP-SHA256+AES-256-GCM')throw Error('BAD_FORMAT');
 const contentKey=await crypto.subtle.decrypt({name:'RSA-OAEP'},pair.privateKey,fromBase64(sealed.wrapped_key));
 const key=await crypto.subtle.importKey('raw',contentKey,{name:'AES-GCM'},false,['decrypt']);
 const extra=new TextEncoder().encode('attendance-storage-escrow-v1');
 const original=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(sealed.nonce),additionalData:extra},key,fromBase64(sealed.ciphertext));
 if(new TextDecoder().decode(original)!=='synthetic-only-backup-data')throw Error('ROUNDTRIP_MISMATCH');
 const changed=fromBase64(sealed.ciphertext);changed[0]^=1;
 let rejected=false;
 try{await crypto.subtle.decrypt({name:'AES-GCM',iv:fromBase64(sealed.nonce),additionalData:extra},key,changed)}catch{rejected=true}
 if(!rejected)throw Error('TAMPERED_CIPHER_ACCEPTED');
 if((await sha256(sample)).length!==64)throw Error('BAD_SHA256');
});
