import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {capture} from './process.mjs';
import {decodeArtifact,liveSource} from './evidence-source.mjs';
const zip=bundle=>Buffer.from(capture('python3',['-c','import sys,io,zipfile,base64\nb=io.BytesIO()\nwith zipfile.ZipFile(b,"w") as z:z.writestr("evidence.json",sys.stdin.read())\nprint(base64.b64encode(b.getvalue()).decode())'],{input:JSON.stringify(bundle)}).trim(),'base64');
test('bounded artifact decoding reads only JSON and rejects missing/invalid bundle',()=>{
 assert.deepEqual(decodeArtifact(zip({version:1,receipts:[]})),{version:1,receipts:[]});
 assert.throws(()=>decodeArtifact(zip({version:99,receipts:[]})),/BUNDLE/);
 assert.throws(()=>decodeArtifact(Buffer.alloc(8*1024*1024+1)),/TOO_LARGE/);
});
test('live source verifies artifact run/SHA/expiry/hash and retrieves exact receipt',async()=>{
 const receipt={check:'unit'},bytes=zip({version:1,receipts:[receipt]});
 const run={id:123,head_sha:'a'.repeat(40)};
 const artifact={id:7,expired:false,size_in_bytes:bytes.length,workflow_run:{id:123,head_sha:run.head_sha},digest:'sha256:'+createHash('sha256').update(bytes).digest('hex')};
 let calls=0;
 const source=()=>liveSource('koith/attendance-proto',{api:async()=>artifact,token:'fixture',fetchImpl:async url=>{
  assert.equal(url,'https://api.github.com/repos/koith/attendance-proto/actions/artifacts/7/zip');calls++;return new Response(bytes);
 }});
 assert.deepEqual(await source().receipt(7,run,'unit'),receipt);assert.equal(calls,1);
 artifact.expired=true;await assert.rejects(source().receipt(7,run,'unit'),/EXPIRY/);assert.equal(calls,1);
 artifact.expired=false;artifact.workflow_run.head_sha='b'.repeat(40);await assert.rejects(source().receipt(7,run,'unit'),/IDENTITY/);
 artifact.workflow_run.head_sha=run.head_sha;artifact.digest='sha256:wrong';await assert.rejects(source().receipt(7,run,'unit'),/DIGEST/);
});
