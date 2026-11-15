import test from 'node:test';
import assert from 'node:assert/strict';
import {planAttachments} from '../../scripts/research/edi_attachment_match.mjs';
const hash='a'.repeat(64),mk=(index)=>({rowKey:'fake_'+index,index}),file=i=>({rowKey:'fake_'+i,filename:'dummy_'+i+'.pdf',sha256:hash,bytes:1024});
const exercise=(n=3000,opt={})=>planAttachments({formId:'SYNTHETIC',rows:Array.from({length:n},(_,i)=>mk(i+1)),files:Array.from({length:n},(_,i)=>file(i+1)),...opt});
test('3000 synthetic people batch by 40, exact 75 batches and checksum',()=>{
 const p=exercise();assert.equal(p.total,3000);assert.equal(p.batches.length,75);
 assert.equal(p.batches.reduce((n,b)=>n+b.pending.length,0),3000);
 assert.equal(p.confirmed,0);assert.equal(p.digest.length,64);
});
test('30/50/43 batch plans remain within 50 and deterministic when shuffled',()=>{
 for(const n of [30,43,50]){const x=exercise(97,{batchSize:n});assert.ok(x.batches.every(b=>b.pending.length<=n));assert.equal(x.batches.flatMap(b=>b.pending).length,97)}
 const rows=[mk(2),mk(1)],files=[file(1),file(2)];
 const a=planAttachments({formId:'X',rows,files});
 const b=planAttachments({formId:'X',rows:[mk(1),mk(2)],files:[file(2),file(1)]});
 assert.equal(a.digest,b.digest);
});
test('resume only after explicit external UI read-back, and fail closed on changed input',()=>{
 const a=exercise(40);
 const ck={formId:'SYNTHETIC',digest:a.digest,confirmedKeys:['fake_2','fake_1']};
 const resumed=exercise(40,{checkpoint:ck});
 assert.equal(resumed.confirmed,2);assert.equal(resumed.batches[0].pending.length,38);
 assert.throws(()=>exercise(41,{checkpoint:ck}),/STALE_OR_WRONG_CHECKPOINT/);
 assert.throws(()=>exercise(40,{checkpoint:{...ck,confirmedKeys:['fake_1','fake_1']}}),/INVALID_CHECKPOINT/);
 assert.throws(()=>exercise(40,{checkpoint:{...ck,confirmedKeys:['person_NOT_IN_LIST']}}),/INVALID_CHECKPOINT/);
});
test('wrong/ambiguous/missing files reject without touching any service',()=>{
 const base={formId:'SYNTHETIC',rows:[mk(1)],files:[file(1)]};
 const fail=(input,reason)=>assert.throws(()=>planAttachments({...base,...input}),new RegExp(reason));
 fail({files:[]},'MISSING_ATTACHMENT');
 fail({files:[file(1),file(2)]},'UNASSIGNED_FILE');
 fail({rows:[mk(1),mk(1)]},'DUPLICATE_ROW_KEY');
 fail({files:[file(1),{...file(1),filename:'duplicate.pdf'}]},'AMBIGUOUS_MULTI_FILE_ROW');
 fail({files:[{...file(1),filename:'../../secrets.pdf'}]},'BAD_FILE_METADATA');
 fail({files:[{...file(1),filename:'dummy.pdf.exe'}]},'BAD_FILE_METADATA');
 fail({files:[{...file(1),sha256:'bad'}]},'BAD_FILE_METADATA');
 fail({files:[{...file(1),bytes:3000000}],maxBytes:2000000},'FORM_SPECIFIC_ATTACHMENT_LIMIT');
 fail({batchSize:51},'BATCH_SIZE');
 fail({rows:[{...mk(1),index:0}]},'ROW_KEY_INVALID');
});
test('no auth, upload, notification, or operating write capability in research matcher',async()=>{
 const fs=await import('node:fs');
 const source=fs.readFileSync('scripts/research/edi_attachment_match.mjs','utf8');
 assert.doesNotMatch(source,/fetch\s*\(|https?:\/\/|GITHUB_TOKEN|Authorization\s*:|document\.querySelector|Deno\.env|process\.env/);
});
