// Shared by existing Pages and Google guards; only reviewed automation paths.
export function assertAutomationOnly(files,message) {
 const allowed=new Set(['AGENTS.md','scripts/autonomous_dev_agent.sh',
  '.github/workflows/work-orchestrator.yml','.github/workflows/p0-pages-deploy.yml',
  '.github/workflows/qa1243-live-e2e.yml']);
 if(!message.includes('[AI1331]')||!message.includes('[QA1243-NO-OPERATING-WRITE]')||
  /\[QA1243-(APP|SAFARI|COST|ACTIVATION)-PAGES/.test(message)||
  !Array.isArray(files)||!files.length||files.length>=100||files.some(f=>{
   const name=typeof f==='string'?f:f.filename;
   return ['renamed','removed'].includes(f.status)||typeof name!=='string'||(!allowed.has(name)&&
    !/^scripts\/ai-dev\/[a-z0-9_.-]+\.(mjs|json)$/.test(name)&&
    !/^docs\/ai-dev-workflow\/[a-zA-Z0-9_.-]+\.(md|json)$/.test(name));
  }))throw Error('AI1331_SCOPE_MUST_BE_AUTOMATION_ONLY');
 return true;
}
