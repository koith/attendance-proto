// AISEC-07 / SEC-S17: recovery-key custody, rotation and loss drill. Reuses seal.mjs/unseal.mjs.
//   check [repoRoot]                      -> fail if any PRIVATE KEY block is tracked in git;
//                                            list recipient public keys (type, bits, SPKI SHA-256).
//   reseal <sealed> <oldPrivate.pem> <outDir> <newPublic.pem>...
//                                         -> ROTATION / DUAL CUSTODY: decrypt once in a private temp
//                                            dir, re-seal to each new recipient (one archive each),
//                                            record the plaintext SHA-256, delete the plaintext.
//                                            The source archive is never modified.
//   drill                                 -> fully synthetic keys: rotation, revocation, loss of one
//                                            custodian key, tamper rejection. No real key is used.
// Never prints key material. Does not change any account, secret store or permission.
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash,createPublicKey,randomBytes} from 'node:crypto';
import {mkdtempSync,readFileSync,writeFileSync,rmSync,existsSync,mkdirSync,readdirSync,statSync,chmodSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const SECURITY=join(dirname(fileURLToPath(import.meta.url)),'..');
const PRIVATE_BLOCK=/-----BEGIN (?:RSA |EC |DSA |ENCRYPTED |OPENSSH )?PRIVATE KEY-----/;
const sha=b=>createHash('sha256').update(b).digest('hex');
const node=(script,args)=>spawnSync(process.execPath,[join(SECURITY,script),...args],{encoding:'utf8'});

export function check(root=process.cwd()){
 // Resolve git top-level before root-relative PEM filters and leak scans.
 // git ls-files from a subdirectory returns paths relative to that subdirectory.
 try{root=execFileSync('git',['-C',root,'rev-parse','--show-toplevel'],{encoding:'utf8'}).trim()||root;}catch{}
 const files=execFileSync('git',['-C',root,'ls-files','-z'],{encoding:'utf8',maxBuffer:64*1024*1024}).split('\0').filter(Boolean);
 const leaked=[];
 for(const f of files){
  let st;try{st=statSync(join(root,f))}catch{continue}
  if(!st.isFile()||st.size>2*1024*1024)continue;
  if(PRIVATE_BLOCK.test(readFileSync(join(root,f),'latin1')))leaked.push(f);
 }
 const recipients=files.filter(f=>/^security\/.*\.pem$/.test(f)).map(f=>{
  try{
   const k=createPublicKey(readFileSync(join(root,f),'utf8'));
   const d=k.asymmetricKeyDetails||{};
   return {file:f,type:k.asymmetricKeyType,bits:d.modulusLength||null,
    spki_sha256:sha(k.export({type:'spki',format:'der'})),ok:k.asymmetricKeyType==='rsa'&&(d.modulusLength||0)>=3072};
  }catch{return {file:f,ok:false,error:'NOT_A_PUBLIC_KEY'}}
 });
 const result=leaked.length===0&&recipients.length>0&&recipients.every(r=>r.ok)?'PASS':'FAIL';
 return {result,tracked_private_key_files:leaked,recipients,
  single_recipient_risk:recipients.length<2?'Only one recipient key: loss of its private half makes every sealed backup unrecoverable. Keep >=2 independently held recipients (reseal) — offline custody itself cannot be verified from the repository.':null};
}

export function reseal(sealed,oldPrivate,outDir,recipients){
 if(!existsSync(sealed)||!existsSync(oldPrivate)||!recipients.length)throw Error('RESEAL_INPUT_MISSING');
 const before=sha(readFileSync(sealed));
 const tmp=mkdtempSync(join(tmpdir(),'sec-reseal-'));chmodSync(tmp,0o700);
 try{
  const plain=join(tmp,'plain');
  const u=node('unseal.mjs',[sealed,oldPrivate,plain]);
  if(u.status!==0)throw Error('RESEAL_DECRYPT_FAILED');
  const digest=sha(readFileSync(plain));
  mkdirSync(outDir,{recursive:true});
  const outputs=recipients.map((pub,i)=>{
   const fp=sha(createPublicKey(readFileSync(pub,'utf8')).export({type:'spki',format:'der'}));
   const out=join(outDir,basename(sealed).replace(/\.sealed$/,'')+'.r'+fp.slice(0,12)+'.sealed');
   const s=node('seal.mjs',[plain,pub,out]);
   if(s.status!==0)throw Error('RESEAL_ENCRYPT_FAILED_'+i);
   return {recipient_spki_sha256:fp,archive:basename(out),archive_sha256:sha(readFileSync(out))};
  });
  return {plaintext_sha256:digest,outputs,source_unchanged:sha(readFileSync(sealed))===before};
 }finally{rmSync(tmp,{recursive:true,force:true})}
}

export function drill(){
 const t=mkdtempSync(join(tmpdir(),'sec-key-drill-'));chmodSync(t,0o700);
 const steps=[];const step=(name,ok,detail)=>{steps.push({step:name,ok:!!ok,...(detail?{detail}:{})})};
 try{
  const key=n=>{execFileSync('openssl',['genpkey','-algorithm','RSA','-pkeyopt','rsa_keygen_bits:3072','-out',join(t,n+'.pem')],{stdio:'ignore'});
   execFileSync('openssl',['pkey','-in',join(t,n+'.pem'),'-pubout','-out',join(t,n+'.pub.pem')],{stdio:'ignore'})};
  ['old','custodianA','custodianB','attacker'].forEach(key);
  const payload=randomBytes(4096);writeFileSync(join(t,'payload.bin'),payload);
  node('seal.mjs',[join(t,'payload.bin'),join(t,'old.pub.pem'),join(t,'backup.sealed')]);
  const r=reseal(join(t,'backup.sealed'),join(t,'old.pem'),join(t,'rot'),[join(t,'custodianA.pub.pem'),join(t,'custodianB.pub.pem')]);
  step('rotation_plaintext_digest',r.plaintext_sha256===sha(payload));
  step('rotation_source_unchanged',r.source_unchanged);
  step('dual_custody_two_archives',r.outputs.length===2&&r.outputs[0].recipient_spki_sha256!==r.outputs[1].recipient_spki_sha256);
  const open=(file,k,out)=>node('unseal.mjs',[join(t,'rot',file),join(t,k+'.pem'),join(t,out)]);
  const a=open(r.outputs[0].archive,'custodianA','a.bin'),b=open(r.outputs[1].archive,'custodianB','b.bin');
  step('custodian_A_recovers',a.status===0&&sha(readFileSync(join(t,'a.bin')))===sha(payload));
  step('custodian_B_recovers',b.status===0&&sha(readFileSync(join(t,'b.bin')))===sha(payload));
  // revocation: the retired key must not open rotated archives
  step('old_key_cannot_open_rotated',open(r.outputs[0].archive,'old','x1.bin').status!==0&&!existsSync(join(t,'x1.bin')));
  step('unrelated_key_rejected',open(r.outputs[1].archive,'attacker','x2.bin').status!==0&&!existsSync(join(t,'x2.bin')));
  // loss of one custodian key: delete A's private key, B still recovers
  rmSync(join(t,'custodianA.pem'));
  step('loss_of_one_key_still_recoverable',open(r.outputs[1].archive,'custodianB','b2.bin').status===0);
  const buf=readFileSync(join(t,'rot',r.outputs[1].archive));buf[buf.length-30]^=1;writeFileSync(join(t,'rot','tampered.sealed'),buf);
  step('tampered_rotated_archive_rejected',open('tampered.sealed','custodianB','x3.bin').status!==0&&!existsSync(join(t,'x3.bin')));
 }finally{rmSync(t,{recursive:true,force:true})}
 const passed=steps.filter(s=>s.ok).length;
 return {result:passed===steps.length?'DRILL_PASS':'DRILL_FAIL',steps,temp_removed:!existsSync(t),
  note:'Synthetic keys only. Real custody (who holds which private key offline, revocation of the 2026-11-03 key) needs operator action.'};
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 const [cmd,...a]=process.argv.slice(2);
 try{
  let r;
  if(cmd==='check')r=check(a[0]||process.cwd());
  else if(cmd==='reseal'){if(a.length<4)throw Error('usage: reseal <sealed> <oldPrivate> <outDir> <newPublic>...');r=reseal(a[0],a[1],a[2],a.slice(3))}
  else if(cmd==='drill')r=drill();
  else throw Error('usage: key_custody.mjs check [root] | reseal ... | drill');
  console.log(JSON.stringify(r,null,1));
  process.exit(r.result==='FAIL'||r.result==='DRILL_FAIL'?1:0);
 }catch(e){console.error(String(e.message||e));process.exit(2)}
}
