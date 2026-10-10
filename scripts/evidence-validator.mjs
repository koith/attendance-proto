import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const file=process.env.WORK_STATE_FILE||'.automation/work-state.json';
const s=JSON.parse(fs.readFileSync(file,'utf8'));
const bad=[];
for(const t of s.tasks){for(const [check,e] of Object.entries(t.evidence)){
 if(!t.checks.includes(check)||!e?.proof)bad.push(t.id+':'+check);
 if(!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/(actions\/runs\/\d+|pull\/\d+|commit\/[a-f0-9]{7,40})/.test(e?.proof||''))bad.push('unsupported proof '+t.id+':'+check);
}
if(t.status==='done'&&t.checks.some(c=>!t.evidence[c]))bad.push('incomplete '+t.id);
}
if(bad.length){console.error(bad.join('\n'));process.exit(1)}
console.log('Evidence shape validated; external CI and deployment verification still required');
