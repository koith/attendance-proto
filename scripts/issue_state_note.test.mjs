import {test} from 'node:test';
import assert from 'node:assert/strict';
import {upsertNote,marker,parseNote} from './issue_state_note.mjs';

const base = {repo:'koith/attendance-proto',issue:1492,token:'fixture-token',run:'100',
  key:'SEC_FAIL_SEC-S04_DEVELOP_FAILED',fields:{status:'FAILED',cause:'DEVELOP_FAILED'}};
const comment = (id,body,user='github-actions[bot]') => ({id,body,user:{login:user}});
function server(initial=[],failWrite=null) {
  const calls=[];let records=[...initial];let id=900;
  const fetchImpl = async (url,opts) => {
    const u=new URL(url),path=u.pathname,method=opts.method||'GET';
    calls.push({path,method,body:opts.body});
    if(failWrite && method!=='GET') return {ok:false,status:failWrite,json:async()=>({})};
    if(method==='GET') {
      const page=Number(u.searchParams.get('page')||1);
      return {ok:true,status:200,json:async()=>records.slice((page-1)*100,page*100)};
    }
    const body=JSON.parse(opts.body).body;
    if(method==='POST') { records.push(comment(++id,body));return {ok:true,status:201,json:async()=>({id})}; }
    if(method==='PATCH') {
      const c=records.find(x=>x.id===Number(path.split('/').at(-1)));
      if(!c) return {ok:false,status:404,json:async()=>({})};
      c.body=body;return {ok:true,status:200,json:async()=>({id:c.id})};
    }
    throw Error('unexpected method');
  };
  return {records,calls,fetchImpl};
}
test('creates once, then updates same comment with attempt count, never appends repeatedly',async()=>{
  const srv=server();
  const a=await upsertNote({...base,countAttempts:true,fetchImpl:srv.fetchImpl});
  assert.equal(a.result,'CREATED');assert.equal(a.attempts,1);
  const b=await upsertNote({...base,countAttempts:true,fetchImpl:srv.fetchImpl});
  assert.equal(b.result,'UNCHANGED');assert.equal(b.attempts,1);
  const c=await upsertNote({...base,run:'101',countAttempts:true,fetchImpl:srv.fetchImpl});
  assert.equal(c.result,'UPDATED');assert.equal(c.attempts,2);
  assert.equal(srv.records.length,1);
  assert.equal(srv.calls.filter(x=>x.method==='POST').length,1);
  assert.equal(srv.calls.filter(x=>x.method==='PATCH').length,1);
});
test('untrusted owner comment cannot spoof bot state marker',async()=>{
  const srv=server([comment(50,marker(base.key)+'\nstatus=FAILED','koith')]);
  const r=await upsertNote({...base,fetchImpl:srv.fetchImpl});
  assert.equal(r.result,'CREATED');assert.equal(srv.records.length,2);
});
test('bounded pagination finds existing state after 100 unrelated comments',async()=>{
  const old=marker(base.key)+'\nstatus=FAILED\ncause=DEVELOP_FAILED\nlast_run=98\nattempts=3';
  const arr=Array.from({length:100},(_,i)=>comment(i+1,'old ordinary progress'));
  arr.push(comment(500,old));
  const srv=server(arr);
  const r=await upsertNote({...base,run:'101',countAttempts:true,fetchImpl:srv.fetchImpl});
  assert.equal(r.result,'UPDATED');assert.equal(r.attempts,4);
  assert.equal(srv.records.length,101);
  assert.ok(srv.calls.filter(x=>x.method==='GET').length>=2);
});
test('rejects unbounded or insecure fields and failed write',async()=>{
  const srv=server();
  await assert.rejects(upsertNote({...base,key:'../../user',fetchImpl:srv.fetchImpl}),/INVALID_NOTE_KEY/);
  await assert.rejects(upsertNote({...base,fields:{payload:'x'.repeat(301)},fetchImpl:srv.fetchImpl}),/INVALID_NOTE_FIELD/);
  await assert.rejects(upsertNote({...base,fields:{payload:'sk-'+'a'.repeat(30)},fetchImpl:srv.fetchImpl}),/SECRET/);
  await assert.rejects(upsertNote({...base,fetchImpl:server([],403).fetchImpl}),/NOTE_GITHUB_HTTP_403/);
});
test('parseNote requires exact marker and keeps key-value fields compact',()=>{
  assert.equal(parseNote('[other]\nx=y',base.key),null);
  assert.deepEqual(parseNote(marker(base.key)+'\nattempts=2\nstatus=FAILED',base.key),
    {attempts:'2',status:'FAILED'});
});
