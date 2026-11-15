import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {backlogIsOpen,pick,canSelect,chooseAndClaim,candidates} from './auto_pick_issue.mjs';
const issue=n=>({number:n,state:'open',title:'['+candidates.find(x=>x.issue===n).id+'] existing unfinished real backlog item',labels:[]});
const backlog=candidates.map(x=>'- [ ] **'+x.id+' (P1)** existing canonical backlog task').join('\n');
const now=Date.parse('2026-11-15T08:00:00Z');
test('selects only original unchecked canonical backlog IDs',()=>{
 assert.equal(backlogIsOpen(backlog,'QA-06'),true);
 assert.equal(backlogIsOpen('- [x] **QA-06** done','QA-06'),false);
 assert.equal(backlogIsOpen('- [ ] **QA-060** another','QA-06'),false);
 assert.equal(backlogIsOpen('- [ ] **QA-06** open','QA-06'),true);
 const all=Object.fromEntries(candidates.map(c=>[c.issue,issue(c.issue)]));
 assert.equal(pick(candidates,backlog,all,{},[],now).id,'QA-06');
 assert.equal(pick(candidates,backlog.replace('- [ ] **QA-06','- [x] **QA-06'),all,{},[],now).id,'MTG-11');
});
test('never picks closed issues, unrelated issues or already delivered code branch',()=>{
 const c=candidates[0],i=issue(c.issue);
 assert.equal(canSelect(c,{...i,state:'closed'},[],[],now),false);
 assert.equal(canSelect(c,{...i,title:'unrelated'},[],[],now),false);
 assert.equal(canSelect(c,i,[],['agent/issue-1055-run-17'],now),false);
 assert.equal(canSelect(c,i,[],['agent/issue-1175-run-17'],now),true);
 assert.equal(canSelect(c,{...i,labels:[{name:'agent-approved'}]},[],[],now),false);
});
test('trusted claims cooldown one day, skip after 2 in week, ignore untrusted',()=>{
 const c=candidates[0],i=issue(c.issue);
 const claim=(timestamp,user='github-actions[bot]')=>({user:{login:user},body:'[AUTODEV:CLAIM backlog=QA-06 issue=1055 run=12 at='+timestamp+']'});
 assert.equal(canSelect(c,i,[claim('2026-11-15T07:55:00.000Z')],[],now),false);
 assert.equal(canSelect(c,i,[claim('2026-11-15T07:55:00.000Z','untrusted')],[],now),true);
 assert.equal(canSelect(c,i,[claim('2026-11-13T06:00:00.000Z')],[],now),true);
 assert.equal(canSelect(c,i,[claim('2026-11-13T06:00:00.000Z'),claim('2026-11-12T06:00:00.000Z')],[],now),false);
});
test('claim uses only allowlisted issue, logs receipt and never grants service write',async()=>{
 const paths=[],expected=candidates[0];
 const fake=async(url,options)=>{
  const path=new URL(url).pathname+new URL(url).search;
  paths.push({path,method:options.method||'GET',body:options.body});
  let data={},status=200;
  const candidate=candidates.find(x=>path.startsWith('/repos/koith/attendance-proto/issues/'+x.issue));
  if(candidate) {
   if(path.endsWith('/comments')&&options.method==='POST'){status=201;data={id:4};}
   else if(path.endsWith('/labels')&&options.method==='POST'){status=200;data=[{name:'agent-approved'}];}
   else if(path.includes('/comments?'))data=[];
   else data=issue(candidate.issue);
  }else if(path.includes('/git/matching-refs/'))data=[];
  else throw Error('unexpected test API '+path);
  return{ok:status<400,status,json:async()=>data};
 };
 const res=await chooseAndClaim({repo:'koith/attendance-proto',token:'SYNTHETIC',run:'123',backlog,fetchImpl:fake,now});
 assert.equal(res.selected,true);assert.equal(res.id,expected.id);assert.equal(res.issue,expected.issue);
 const claims=paths.filter(x=>x.method==='POST');
 assert.equal(claims.length,2);
 assert.match(claims[0].body,/AUTODEV:CLAIM/);
 assert.match(claims[0].body,/accepted_backlog_increment=0/);
 assert.doesNotMatch(claims.map(x=>x.body).join(''),/SUPABASE_SERVICE_ROLE_KEY|PRIVATE_KEY/);
 assert.ok(!paths.some(x=>/dispatches|migrations|payroll_close/.test(x.path)));
});
test('a failed reservation or untrusted context cannot start execution',async()=>{
 const f=async(url,opts)=>{
  const p=new URL(url).pathname;
  if(p.includes('/git/matching-refs/'))return{ok:true,json:async()=>[]};
  if(p.endsWith('/comments')&&opts.method==='POST')return{ok:false,status:403,json:async()=>({})};
  if(p.includes('/comments'))return{ok:true,json:async()=>[]};
  const n=Number(p.split('/').at(-1));
  return {ok:true,json:async()=>issue(n)};
 };
 await assert.rejects(chooseAndClaim({repo:'koith/attendance-proto',token:'SYNTHETIC',run:'4',backlog,fetchImpl:f,now}),/BACKLOG_GITHUB_HTTP_403/);
 await assert.rejects(chooseAndClaim({repo:'other/repo',token:'SYNTHETIC',run:'4',backlog,fetchImpl:f,now}),/UNTRUSTED_REPOSITORY_RUN/);
});
