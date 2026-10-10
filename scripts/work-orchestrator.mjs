import fs from 'node:fs';
const file=process.env.WORK_STATE_FILE||'.automation/work-state.json';
const definitions=[
 ['payroll','급여 계산 및 주간 승인',['payroll-scenarios','weekly-approval','payroll-production']],
 ['admin','본사·지점 관리 및 격리',['admin-navigation','store-isolation','admin-production']],
 ['regression','전체 회귀 검증',['ci','mobile-desktop','critical-flows']],
 ['deploy','최종 운영 배포',['main-merged','edge-deployed','web-deployed','production-smoke']]
];
const initial=()=>({version:1,tasks:definitions.map(([id,name,checks])=>({id,name,checks,status:'pending',evidence:{}})),history:[]});
const state=fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):initial();
const save=()=>{fs.mkdirSync(file.slice(0,file.lastIndexOf('/'))||'.',{recursive:true});fs.writeFileSync(file,JSON.stringify(state,null,2)+'\n')};
const [command='next',id,check,proof]=process.argv.slice(2);
const task=state.tasks.find(t=>t.id===id);
const event=(action,details)=>state.history.push({at:new Date().toISOString(),action,details});
if(command==='init'){save();console.log(file)}
else if(command==='next'){const t=state.tasks.find(x=>x.status!=='done');console.log(JSON.stringify(t?{task:t.id,status:t.status,missing:t.checks.filter(c=>!t.evidence[c])}:{status:'complete'}))}
else if(command==='record'){
 if(!task||!task.checks.includes(check)||!proof||proof.length<8)throw Error('Valid task, check and evidence required');
 task.evidence[check]={proof,at:new Date().toISOString()};task.status='in_progress';event('record',{id,check,proof});save();
}else if(command==='complete'){
 if(!task)throw Error('Unknown task');
 const missing=task.checks.filter(c=>!task.evidence[c]);if(missing.length)throw Error('Missing evidence: '+missing.join(','));
 if(state.tasks.slice(0,state.tasks.indexOf(task)).some(t=>t.status!=='done'))throw Error('Preceding task incomplete');
 task.status='done';event('complete',id);save();
}else if(command==='blocked'){
 if(!task||!check||!proof)throw Error('Reason and attempted alternatives required');
 task.status='blocked';task.block={reason:check,alternatives:proof};event('blocked',{id,reason:check,alternatives:proof});save();
}else if(command==='status')console.log(JSON.stringify(state,null,2));
else throw Error('Unknown command');
