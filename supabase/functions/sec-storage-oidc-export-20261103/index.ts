import {createRemoteJWKSet,jwtVerify} from 'npm:jose@6.0.12';
import {createClient} from 'npm:@supabase/supabase-js@2.58.0';
import {base64,sha256,seal} from './crypto.ts';
import {AUDIENCE,NOT_AFTER,permittedClaims} from './auth.ts';

const PROJECT_URL=Deno.env.get('SUPABASE_URL')||'';
const MAX_OBJECTS=100;
const MAX_TOTAL_BYTES=100*1024*1024;



const PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIBojANBgkqhkiG9w0BAQEFAAOCAY8AMIIBigKCAYEAvXurkHK+5/pX/xPCMhII\nAb4lm6W/U03HimJLfvUomQu2ev9j49LxazX4sgmiKyPYQ0cZrP+q8+y3ww6tcw3J\n8QLQLmg9fZbs79JaUr/guwGLit57+3ajwDsKj0czfRuilvaHBSFWyu5jgzC/r77A\nY6RHEPUQpbim9+Pv9H8G7j3tJ9VU32c7v5+5Ld1sUo/n/CpPmimVPnCQecFabFdd\nmpKxO4mWyY0rKk4nWt82t1l0NdWrXLnBxeqiHdWOuESmDgXWnDePvsLBmsaXbBQr\nJdgD9cRcSJCWT9L6CdjWeIOp9CWp3zVWBNjrVra5Vl7pLSRad6DQ+0fe5W9pK7LR\n5lItCsdo2Qs9RH6+lSlSjnRFza54L17EwgjKz7Wo7Yaak084rb41dllWbE9ONSNY\nwqQpjhYvMwF4OWeOQi4anB4JCVOVFaWhYr0YI3XS7bZ3qIxoo3rhQ+gggtfIYnDn\nfx1Ae4I0Uj6Kgi9+IgKk4al9ebUjMwlmy7jJfsQYE96/AgMBAAE=\n-----END PUBLIC KEY-----\n";
const encoder=new TextEncoder();
const jwks=createRemoteJWKSet(new URL('https://token.actions.githubusercontent.com/.well-known/jwks'),{timeoutDuration:6000});
const headers={'Cache-Control':'no-store, max-age=0','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const respond=(status:number,body:string)=>new Response(body,{status,headers:{...headers,'content-type':'text/plain; charset=utf-8'}});
function apiKey(){
 const map=Deno.env.get('SUPABASE_SECRET_KEYS');
 if(map){
  try{const k=JSON.parse(map);if(typeof k.default==='string'&&k.default)return k.default}catch{}
 }
 return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
}
async function authorize(req:Request):Promise<boolean>{
 if(Date.now()>NOT_AFTER||req.method!=='POST'||!PROJECT_URL)return false;
 const header=req.headers.get('authorization')||'';
 if(!header.startsWith('Bearer '))return false;
 try{
  const {payload,protectedHeader}=await jwtVerify(header.slice(7),jwks,{
   issuer:'https://token.actions.githubusercontent.com',audience:AUDIENCE,algorithms:['RS256'],maxTokenAge:'4m'
  });
  if(protectedHeader.alg!=='RS256')return false;
  return permittedClaims(payload);
 }catch{return false}
}
async function listFiles(client:any){
 const {data:buckets,error:be}=await client.storage.listBuckets();
 if(be||!Array.isArray(buckets)||!buckets.length||buckets.length>30)throw Error('BUCKET_INVENTORY_UNAVAILABLE');
 const output:{bucket:string,name:string,bytes:number,updated_at:string}[]=[];
 let privateBucketCount=0;
 for(const bucket of buckets){
  if(bucket.public!==true)privateBucketCount++;
  const paths=[''];let guard=0;
  while(paths.length){
   const p=paths.shift()!;
   if(++guard>100)throw Error('STORAGE_DIRECTORY_LIMIT');
   const {data,error}=await client.storage.from(bucket.id).list(p,{limit:100,offset:0,sortBy:{column:'name',order:'asc'}});
   if(error||!Array.isArray(data)||data.length>=100)throw Error('STORAGE_LIST_FAILED');
   for(const item of data){
    if(!item.id){paths.push(p?p+'/'+item.name:item.name);continue}
    const size=Number(item.metadata?.size);
    if(!Number.isSafeInteger(size)||size<0)throw Error('INVALID_STORAGE_SIZE');
    output.push({bucket:bucket.id,name:p?p+'/'+item.name:item.name,bytes:size,updated_at:String(item.updated_at||'')});
    if(output.length>MAX_OBJECTS)throw Error('OBJECT_CAP_EXCEEDED');
   }
  }
 }
 output.sort((a,b)=>(a.bucket+'/'+a.name).localeCompare(b.bucket+'/'+b.name,'en'));
 const total=output.reduce((sum,x)=>sum+x.bytes,0);
 if(total>MAX_TOTAL_BYTES)throw Error('BACKUP_SIZE_CAP_EXCEEDED');
 if(!privateBucketCount)throw Error('PRIVATE_BUCKET_MISSING');
 return {files:output,bucketCount:buckets.length,privateBucketCount,total};
}
Deno.serve(async(req)=>{
 if(!await authorize(req))return respond(401,'UNAUTHORIZED');
 const key=apiKey();
 if(!key)return respond(503,'BACKUP_CONFIGURATION_UNAVAILABLE');
 try{
  const body=await req.json();
  if(!body||typeof body!=='object')return respond(400,'INVALID_REQUEST');
  const client=createClient(PROJECT_URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const inventory=await listFiles(client);
  const files=inventory.files;
  const roster=await sha256(encoder.encode(JSON.stringify(files)));
  if(body.kind==='manifest'){
   return Response.json({format:'storage-escrow-oidc-v1',count:files.length,total_bytes:inventory.total,roster_sha256:roster,bucket_count:inventory.bucketCount,private_bucket_count:inventory.privateBucketCount,expected_archives:files.length},{headers});
  }
  if(body.kind!=='object'||!Number.isSafeInteger(body.index)||body.index<0||body.index>=files.length||body.roster_sha256!==roster)return respond(409,'ROSTER_MISMATCH');
  const file=files[body.index];
  const {data,error}=await client.storage.from(file.bucket).download(file.name);
  if(error||!data)throw Error('STORAGE_DOWNLOAD_FAILED');
  const bytes=new Uint8Array(await data.arrayBuffer());
  if(bytes.length!==file.bytes)throw Error('STORAGE_SIZE_CHANGED');
  const originalHash=await sha256(bytes);
  const record={format:'encrypted-storage-object-v1',bucket:file.bucket,name:file.name,metadata_size:file.bytes,actual_size:bytes.length,updated_at:file.updated_at,sha256:originalHash,roster_sha256:roster,content_base64:base64(bytes)};
  const encrypted=await seal(encoder.encode(JSON.stringify(record)),PUBLIC_KEY);
  return new Response(new TextDecoder().decode(encrypted),{status:200,headers:{...headers,'content-type':'application/octet-stream','x-encrypted-only':'true','x-object-index':String(body.index),'x-roster-sha256':roster}});
 }catch{
  // Never expose error stack, keys, source object names, or file bytes.
  return respond(503,'BACKUP_READ_FAILED');
 }
});
