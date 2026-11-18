import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {openBacklogIds,approvedCandidates,backlogIsOpen,pick,canSelect,chooseAndClaim} from './auto_pick_issue.mjs';

const now=Date.parse('2026-11-18T11:00:00Z');
const ledger=[
 '- [ ] **MTG-13 (P2)** Existing usage variance',
 '- [x] **QA-06 (P1)** Historical completed task',
 '- [ ] **P0-TEST (P0)** Existing urgent task'
].join('\n');
const issue=(id,number)=>({number,state:'open',title:'['+id+'] approved existing work',labels:[{name:'agent-approved'}]});
const claim=(days,id='MTG-13',number=1170)=>({user:{login:'github-actions[bot]'},
 body:'[AUTODEV:CLAIM backlog='+id+' issue='+number+' run=12 at='+new Date(now-days*86400000).toISOString()+']'});
test('approved open real issue plus unchecked ledger ID required',()=>{
 assert.equal(openBacklogIds(ledger).size,2);
 assert.equal(backlogIsOpen(ledger,'QA-06'),false);
 const rows=[issue('MTG-13',1170),issue('QA-06',1055),issue('NOT-IN-LEDGER',999),
  issue('P0-TEST',2000),{...issue('P0-TEST',2001),labels:[]}];
 assert.deepEqual(approvedCandidates(ledger,rows).map(x=>x.id),['P0-TEST','MTG-13']);
 assert.equal(approvedCandidates(ledger,[]).length,0);
});
test('approved first scheduled claim allowed; at most 3 attempts per week',()=>{
 const c={id:'MTG-13',issue:1170},i=issue('MTG-13',1170);
 assert.equal(canSelect(c,i,[],[],now),true);
 assert.equal(canSelect(c,{...i,labels:[]},[],[],now),false);
 assert.equal(canSelect(c,{...i,state:'closed'},[],[],now),false);
 assert.equal(canSelect(c,i,[],['agent/issue-1170-run-123'],now),false);
 assert.equal(canSelect(c,i,[claim(.5)],[],now),false);
 assert.equal(canSelect(c,i,[claim(1.5),claim(2.5)],[],now),true);
 assert.equal(canSelect(c,i,[claim(1.5),claim(2.5),claim(3.5)],[],now),false);
});
test('approved issue discovery claims once without auto approving a new issue',async()=>{
 const paths=[],approved=[issue('MTG-13',1170),issue('QA-06',1055),issue('P0-TEST',2000)];
 const fake=async(u,opt)=>{
  const path=new URL(u).pathname+new URL(u).search;
  paths.push({path,method:opt.method||'GET',body:opt.body});
  if(path.includes('/issues?state=open&labels=agent-approved'))return {ok:true,json:async()=>approved};
  if(path==='/repos/koith/attendance-proto/issues/1170')return {ok:true,json:async()=>issue('MTG-13',1170)};
  if(path==='/repos/koith/attendance-proto/issues/2000')return {ok:true,json:async()=>({...issue('P0-TEST',2000),state:'closed'})};
  if(path==='/repos/koith/attendance-proto/issues/1170/comments?per_page=100')return {ok:true,json:async()=>[claim(1.5),claim(2.5)]};
  if(path==='/repos/koith/attendance-proto/issues/2000/comments?per_page=100')return {ok:true,json:async()=>[]};
  if(path.includes('/git/matching-refs/'))return {ok:true,json:async()=>[]};
  if(path==='/repos/koith/attendance-proto/issues/1170/comments'&&opt.method==='POST')return {ok:true,json:async()=>({id:432})};
  throw Error('UNEXPECTED_API '+path);
 };
 const r=await chooseAndClaim({repo:'koith/attendance-proto',token:'SYNTHETIC',run:123,backlog:ledger,fetchImpl:fake,now});
 assert.equal(r.selected,true);assert.equal(r.issue,1170);assert.equal(r.matching,2);
 assert.equal(paths.filter(x=>x.method==='POST').length,1);
 assert.ok(!paths.some(x=>x.path.endsWith('/labels')));
});
test('no match is reported as NO_WORK not as development success',async()=>{
 const fake=async()=>({ok:true,json:async()=>[]});
 const r=await chooseAndClaim({repo:'koith/attendance-proto',token:'SYNTHETIC',run:124,backlog:ledger,fetchImpl:fake,now});
 assert.equal(r.selected,false);assert.equal(r.reason,'NO_APPROVED_OPEN_BACKLOG_ISSUES');
});
test('unsafe repository and GitHub errors reject execution',async()=>{
 const fail=async()=>({ok:false,status:403,json:async()=>({})});
 await assert.rejects(chooseAndClaim({repo:'other/repo',token:'SYNTHETIC',run:124,backlog:ledger,fetchImpl:fail,now}),/UNTRUSTED_REPOSITORY_RUN/);
 await assert.rejects(chooseAndClaim({repo:'koith/attendance-proto',token:'SYNTHETIC',run:124,backlog:ledger,fetchImpl:fail,now}),/BACKLOG_GITHUB_HTTP_403/);
});
