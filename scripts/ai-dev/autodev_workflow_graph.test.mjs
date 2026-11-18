import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
const path='.github/workflows/autonomous-development-agent.yml';
const text=readFileSync(path,'utf8');
const section=(name)=>{
 const match=text.match(new RegExp('^  '+name+':\\n([\\s\\S]*?)(?=^  [a-z][a-z-]+:\\n|$(?![\\s\\S]))','m'));
 assert.ok(match,'workflow job '+name+' exists');
 return match[1];
};
test('QA and publish receive the same approved issue ID from direct dependencies',()=>{
 const capture=section('capture-intake'),develop=section('develop');
 const qa=section('qa'),publish=section('publish');
 assert.match(capture,/issue_number:\s*\$\{\{\s*steps\.pick\.outputs\.issue_number/);
 assert.match(develop,/needs:\s*capture-intake/);
 assert.match(qa,/needs:\s*\[capture-intake,\s*develop\]/);
 assert.match(publish,/needs:\s*\[capture-intake,\s*qa\]/);
 assert.match(qa,/ISSUE_NUMBER:\s*\$\{\{\s*needs\.capture-intake\.outputs\.issue_number\s*\}\}/);
 assert.match(publish,/ISSUE_NUMBER:\s*\$\{\{\s*needs\.capture-intake\.outputs\.issue_number\s*\}\}/);
 assert.match(qa,/node scripts\/security\/validate_agent_publish_patch\.mjs/);
 assert.match(publish,/node scripts\/security\/validate_agent_publish_patch\.mjs/);
});
test('provider-key and privileged publish stages remain separate',()=>{
 const develop=section('develop'),qa=section('qa'),publish=section('publish');
 assert.match(develop,/copilot-requests:\s*write/);
 assert.match(qa,/contents:\s*read/);
 assert.match(publish,/contents:\s*write/);
 assert.match(publish,/pull-requests:\s*write/);
 assert.doesNotMatch(qa,/OPENAI_API_KEY:\s*\$\{\{/);
});
