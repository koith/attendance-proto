import {generateKeyPair,SignJWT,jwtVerify} from 'npm:jose@6.0.12';
import {AUDIENCE,IMMUTABLE_SUB,WORKFLOW_REF,NOT_AFTER,permittedClaims} from '../../supabase/functions/sec-storage-oidc-export-20261103/auth.ts';
const fixture={
 sub:IMMUTABLE_SUB,repository:'koith/attendance-proto',repository_id:'1346210224',
 repository_owner:'koith',repository_owner_id:'48688331',ref:'refs/heads/main',
 workflow_ref:WORKFLOW_REF,event_name:'push',run_attempt:'1',run_id:'41620000111'
};
Deno.test('exact immutable identity and scope rejects malicious claims',()=>{
 if(!permittedClaims(fixture,NOT_AFTER-60_000))throw Error('EXPECTED_VALID_CLAIMS_REJECTED');
 for(const [key,invalid] of [
  ['sub','repo:koith/attendance-proto:ref:refs/heads/main'],
  ['sub','repo:koith@48688331/attendance-proto@999:ref:refs/heads/main'],
  ['repository','attacker/repo'],['repository_id','1'],
  ['repository_owner','attacker'],['repository_owner_id','3'],
  ['ref','refs/heads/evil'],['workflow_ref','attacker/repo/.github/workflows/inject.yml@refs/heads/main'],
  ['event_name','pull_request'],['run_attempt','2'],['run_id','bad']
 ] as const){
  if(permittedClaims({...fixture,[key]:invalid},NOT_AFTER-60_000))throw Error('MALICIOUS_CLAIM_ACCEPTED:'+key);
 }
 if(permittedClaims(fixture,NOT_AFTER+1))throw Error('EXPIRED_FUNCTION_ACCEPTED');
});
Deno.test('RS256 invalid signature, expired token, issuer and audience rejected',async()=>{
 const good=await generateKeyPair('RS256');
 const bad=await generateKeyPair('RS256');
 const make=async(override:{iss?:string,aud?:string,exp?:number}={})=>{
  const now=Math.floor(Date.now()/1000);
  return await new SignJWT(fixture).setProtectedHeader({alg:'RS256'})
    .setIssuer(override.iss??'https://token.actions.githubusercontent.com')
    .setAudience(override.aud??AUDIENCE).setIssuedAt(now-5)
    .setExpirationTime(override.exp??now+100).sign(good.privateKey);
 };
 const checked=async(token:string,key=good.publicKey)=>{
  try{const {payload}=await jwtVerify(token,key,{issuer:'https://token.actions.githubusercontent.com',audience:AUDIENCE,algorithms:['RS256'],maxTokenAge:'4m'});
   return permittedClaims(payload,NOT_AFTER-60000);
  }catch{return false}
 };
 const token=await make();if(!await checked(token))throw Error('VALID_SIGNATURE_REJECTED');
 if(await checked(token,bad.publicKey))throw Error('WRONG_SIGNATURE_ACCEPTED');
 for(const t of [await make({aud:'evil'}),await make({iss:'https://fake.invalid'}),await make({exp:Math.floor(Date.now()/1000)-10})]){
  if(await checked(t))throw Error('INVALID_JWT_ACCEPTED');
 }
});
