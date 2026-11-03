// The only outbound result is AES-GCM ciphertext wrapped with an existing RSA public key.
// GitHub OIDC ID token stays in process memory; no Supabase credentials are required.
import {mkdirSync,writeFileSync,chmodSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const base='https://waluhdgqhwjjwmflhrle.supabase.co/functions/v1/sec-storage-oidc-export-20261103';
const audience='attendance-storage-escrow-20261103';
const output=process.env.RUNNER_TEMP?join(process.env.RUNNER_TEMP,'sec-storage-encrypted-20261103'):null;
if(!output||!process.env.ACTIONS_ID_TOKEN_REQUEST_URL||!process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)throw Error('OIDC_RUNNER_NOT_CONFIGURED');
mkdirSync(output,{recursive:false,mode:0o700});
async function getOidcToken(){
 const u=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);
 u.searchParams.set('audience',audience);
 const r=await fetch(u,{headers:{authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},redirect:'error',signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('OIDC_IDENTITY_MINT_FAILED_'+r.status);
 const b=await r.json();
 if(typeof b.value!=='string'||b.value.length<100)throw Error('OIDC_RESPONSE_INVALID');
 return b.value;
}
async function command(body){
 const bearer=await getOidcToken();
 let r;
 try{r=await fetch(base,{method:'POST',headers:{authorization:'Bearer '+bearer,'content-type':'application/json','accept':'application/octet-stream'},body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(120000)});}
 catch{throw Error('BACKUP_EDGE_CONNECT_FAILED')}
 if(!r.ok)throw Error('BACKUP_EDGE_HTTP_'+r.status);
 return r;
}
const meta=await command({kind:'manifest'});
const manifest=await meta.json();
if(manifest.format!=='storage-escrow-oidc-v1'||manifest.count!==14||!/^([a-f0-9]{64})$/.test(manifest.roster_sha256))throw Error('STORAGE_SOURCE_ROSTER_NOT_VERIFIED');
let totalCipherBytes=0;const chunks=[];
for(let index=0;index<manifest.count;index++){
 const response=await command({kind:'object',index,roster_sha256:manifest.roster_sha256});
 if(response.headers.get('x-encrypted-only')!=='true'||response.headers.get('x-roster-sha256')!==manifest.roster_sha256||response.headers.get('x-object-index')!==String(index))throw Error('ENCRYPTED_CONTENT_ATTESTATION_MISSING');
 const buf=Buffer.from(await response.arrayBuffer());
 if(buf.length<500||buf.length>20000000)throw Error('UNEXPECTED_CIPHERTEXT_LENGTH');
 let envelope;try{envelope=JSON.parse(buf.toString('utf8'))}catch{throw Error('UNPARSEABLE_CIPHERTEXT_ENVELOPE')}
 if(envelope.version!==1||envelope.algorithm!=='RSA-OAEP-SHA256+AES-256-GCM'||!envelope.wrapped_key||!envelope.nonce||!envelope.ciphertext)throw Error('CIPHERTEXT_ENVELOPE_INVALID');
 const filename='object-'+String(index).padStart(2,'0')+'.json.enc';
 const path=join(output,filename);
 writeFileSync(path,buf,{flag:'wx',mode:0o600});
 chunks.push({index,filename,encrypted_bytes:buf.length,sha256:createHash('sha256').update(buf).digest('hex')});
 totalCipherBytes+=buf.length;
 console.log('SEALED_OBJECT_VERIFIED index='+index+' cipher_bytes='+buf.length);
}
const result={format:'attendance-storage-encrypted-v1',source_object_count:manifest.count,source_metadata_size_bytes:manifest.total_bytes,roster_sha256:manifest.roster_sha256,started_at:new Date().toISOString(),objects:chunks,encrypted_archive_total_bytes:totalCipherBytes};
writeFileSync(join(output,'encrypted-manifest.json'),JSON.stringify(result,null,2),{mode:0o600});
console.log('ENCRYPTED_ARCHIVE_READY object_count='+manifest.count+' total_cipher_bytes='+totalCipherBytes);
// Never print object names, payroll data, bearer tokens or service-role credentials.
