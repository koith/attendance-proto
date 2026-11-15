// NOV14-INS-01 technical feasibility only: synthetic matching, no EDI requests.
// All identifiers are local pseudonymous row keys. No names, resident numbers,
// certificates, browser passwords, file contents or real documents are accepted.
import {createHash} from 'node:crypto';
const key=/^[A-Za-z0-9_-]{1,64}$/;
const sha=/^[a-f0-9]{64}$/;
function die(reason){throw Error('EDI_PLAN_'+reason)}
export function planAttachments({rows,files,formId,batchSize=40,maxBytes=null,checkpoint=null}){
 if(!Array.isArray(rows)||!Array.isArray(files)||rows.length>3000||files.length>3000)die('CAPACITY');
 if(!key.test(formId||''))die('FORM_ID');
 if(!Number.isInteger(batchSize)||batchSize<1||batchSize>50)die('BATCH_SIZE');
 if(maxBytes!==null&&(!Number.isSafeInteger(maxBytes)||maxBytes<1))die('MAX_BYTES');
 const all=new Map(),seenFiles=new Set(),seenRows=new Set();
 for(const f of files){
  if(!f||!key.test(f.rowKey)||!sha.test(f.sha256||'')||
     typeof f.filename!=='string'||f.filename.length>120||
     f.filename.includes('/')||f.filename.includes('\\')||
     !/^[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:pdf|png|jpg|jpeg)$/i.test(f.filename)||
     f.filename.startsWith('.')||!Number.isSafeInteger(f.bytes)||f.bytes<1)die('BAD_FILE_METADATA');
  if(maxBytes!==null&&f.bytes>maxBytes)die('FORM_SPECIFIC_ATTACHMENT_LIMIT');
  if(seenFiles.has(f.filename.toLowerCase()))die('DUPLICATE_FILENAME');
  seenFiles.add(f.filename.toLowerCase());
  if(all.has(f.rowKey))die('AMBIGUOUS_MULTI_FILE_ROW');
  all.set(f.rowKey,{filename:f.filename,sha256:f.sha256,bytes:f.bytes});
 }
 const ordered=[];
 for(const r of rows){
  if(!r||!key.test(r.rowKey)||!Number.isSafeInteger(r.index)||r.index<1)die('ROW_KEY_INVALID');
  if(seenRows.has(r.rowKey))die('DUPLICATE_ROW_KEY');
  seenRows.add(r.rowKey);
  const file=all.get(r.rowKey);
  if(!file)die('MISSING_ATTACHMENT');
  ordered.push({rowKey:r.rowKey,index:r.index,file});
 }
 if(ordered.length!==all.size)die('UNASSIGNED_FILE');
 if(new Set(ordered.map(x=>x.index)).size!==rows.length)die('DUPLICATE_ROW_INDEX');
 ordered.sort((a,b)=>a.index-b.index);
 const digest=createHash('sha256').update(JSON.stringify({formId,ordered})).digest('hex');
 if(checkpoint!==null){
  if(checkpoint.formId!==formId||checkpoint.digest!==digest)die('STALE_OR_WRONG_CHECKPOINT');
  if(!Array.isArray(checkpoint.confirmedKeys)||checkpoint.confirmedKeys.some(x=>!seenRows.has(x))||
     new Set(checkpoint.confirmedKeys).size!==checkpoint.confirmedKeys.length)die('INVALID_CHECKPOINT');
 }
 const confirmed=new Set(checkpoint?.confirmedKeys||[]);
 const batches=[];
 for(let i=0;i<ordered.length;i+=batchSize){
  const chunk=ordered.slice(i,i+batchSize);
  batches.push({batch:Math.floor(i/batchSize)+1,pending:chunk.filter(x=>!confirmed.has(x.rowKey)),alreadyConfirmed:chunk.filter(x=>confirmed.has(x.rowKey)).length});
 }
 return {formId,digest,total:ordered.length,confirmed:confirmed.size,batchSize,batches,
  receiptFormat:{formId,digest,confirmedKeys:'verified UI read-back only; never infer from click'}};
}
