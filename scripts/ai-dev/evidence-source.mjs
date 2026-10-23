import {capture} from './process.mjs';
import {createHash} from 'node:crypto';
import {githubClient} from './github.mjs';
export function decodeArtifact(bytes) {
 if(bytes.length>8*1024*1024)throw Error('ARTIFACT_TOO_LARGE');
 // Never extract archive paths or execute archive content. Only a bounded JSON member.
 const result=capture('python3',['-c',
  'import io,json,sys,zipfile\nz=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))\nn=[i for i in z.infolist() if i.filename=="evidence.json"]\nassert len(n)==1 and n[0].file_size<=1048576, "INVALID_EVIDENCE_MEMBER"\nsys.stdout.write(z.read(n[0]).decode("utf-8"))'],{input:bytes,maxBytes:1048576,timeout:5000});
 const bundle=JSON.parse(result);
 if(bundle.version!==1||!Array.isArray(bundle.receipts))throw Error('INVALID_EVIDENCE_BUNDLE');
 return bundle;
}
export function liveSource(repository,{api=githubClient(repository),token=process.env.GITHUB_TOKEN,fetchImpl=fetch}={}) {
 const cache=new Map();
 return {provenance:'github-live',
  pr:n=>api(`/pulls/${n}`),run:n=>api(`/actions/runs/${n}`),
  jobs:async(n,attempt)=>{
   const jobs=[];
   for(let page=1;page<=10;page++){
    const data=await api(`/actions/runs/${n}/attempts/${attempt}/jobs?per_page=100&page=${page}`);
    if(!Array.isArray(data.jobs))throw Error('JOBS_MISSING');jobs.push(...data.jobs);
    if(jobs.length===data.total_count)return jobs;
    if(data.jobs.length<100)throw Error('JOBS_TRUNCATED');
   }
   throw Error('JOBS_LIMIT');
  },
  receipt:async(id,run,check)=>{
   if(!cache.has(id)){
    const artifact=await api(`/actions/artifacts/${id}`);
    if(artifact.id!==id||artifact.expired||artifact.workflow_run?.id!==run.id||artifact.workflow_run?.head_sha!==run.head_sha||artifact.size_in_bytes>8*1024*1024)throw Error('ARTIFACT_IDENTITY_OR_EXPIRY');
    const response=await fetchImpl(`https://api.github.com/repos/${repository}/actions/artifacts/${id}/zip`,{
     signal:AbortSignal.timeout(20000),redirect:'follow',headers:{Accept:'application/vnd.github+json',...(token?{Authorization:`Bearer ${token}`}:{})}});
    if(!response.ok)throw Error('ARTIFACT_UNAVAILABLE_HTTP_'+response.status);
    // Fetch follows GitHub's signed archive redirect and strips Authorization on
    // cross-origin redirects. The caller cannot supply a download URL.
    const reader=response.body.getReader(),chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;
     if(size>8*1024*1024){await reader.cancel();throw Error('ARTIFACT_TOO_LARGE');}chunks.push(value);}
    const bytes=Buffer.concat(chunks);
    if(artifact.digest&&artifact.digest!==`sha256:${createHash('sha256').update(bytes).digest('hex')}`)throw Error('ARTIFACT_DIGEST_MISMATCH');
    cache.set(id,decodeArtifact(bytes));
   }
   const receipts=cache.get(id).receipts.filter(r=>r.check===check);
   if(receipts.length!==1)throw Error('MISSING_OR_DUPLICATE_RECEIPT');
   return receipts[0];
  }
 };
}
