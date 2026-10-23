import {createHash} from 'node:crypto';
import {transition, STATES} from './state.mjs';
import {makeReceipt} from '../issue_intake_receipt.mjs';
export const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const marker='[ai-dev-checkpoint:v1]';
const sha=/^[a-f0-9]{40}$/;
const text = (v,name) => { if(typeof v!=='string'||!v.trim()||v.length>8000)throw Error('INVALID_'+name); };
export function validate(record) {
  if(record.version!==1||!Number.isSafeInteger(record.issue)||record.issue<1)throw Error('INVALID_ISSUE');
  if(!/^[a-z0-9-]{1,80}$/.test(record.task))throw Error('INVALID_TASK');
  if(!/^[\w.-]{1,100}$/.test(record.event_id))throw Error('INVALID_EVENT_ID');
  if(!Number.isSafeInteger(record.revision)||record.revision<1)throw Error('INVALID_REVISION');
  if(record.revision===1 ? record.parent!==null : !/^[a-f0-9]{64}$/.test(record.parent||''))throw Error('INVALID_PARENT');
  if(![...STATES,'BLOCKED'].includes(record.state)||!sha.test(record.sha))throw Error('INVALID_STATE_OR_SHA');
  for(const key of ['branch','scope','acceptance','next_action'])text(record[key],key.toUpperCase());
  if(!/^[a-zA-Z0-9_./-]+$/.test(record.branch)||record.branch.includes('..'))throw Error('INVALID_BRANCH');
  if(!/^\d{4}-\d\d-\d\dT/.test(record.at)||!Number.isFinite(Date.parse(record.at)))throw Error('INVALID_TIME');
  if(typeof record.failure!=='string'||!Array.isArray(record.proofs)||record.proofs.length>50)throw Error('INVALID_DETAILS');
  for(const url of record.proofs) if(!/^https:\/\/github\.com\/[-\w.]+\/[-\w.]+\/(?:pull|commit|actions\/runs|issues)\/[\w/#.-]+$/.test(url))throw Error('INVALID_PROOF_LINK');
  if(record.state==='BLOCKED'&&(!record.failure.trim()||!record.required_action?.trim()||!STATES.includes(record.resume_state)))throw Error('BLOCKED_DETAILS_REQUIRED');
  // Reuse intake's size and secret-redaction boundary before public persistence.
  makeReceipt({issueNumber:record.issue,kind:'comment',author:'checkpoint',title:'',text:JSON.stringify(record)});
  return record;
}
export function encode(record) {
  validate(record);
  return `${marker}\n\n\`\`\`json\n${JSON.stringify({record,digest:hash(record)},null,2)}\n\`\`\`\n`;
}
export function decode(comment, {issue, trustedAuthors}) {
  if(!comment.body?.startsWith(marker+'\n'))return null;
  if(!trustedAuthors.includes(comment.user?.login))return null;
  const match=comment.body.match(/^\[ai-dev-checkpoint:v1\]\n\n```json\n([\s\S]+)\n```\n?$/);
  if(!match)throw Error('CORRUPT_CHECKPOINT');
  const {record,digest}=JSON.parse(match[1]);validate(record);
  if(record.issue!==issue||digest!==hash(record))throw Error('CHECKPOINT_DIGEST_OR_ISSUE_MISMATCH');
  return {record,digest,url:comment.html_url||comment.url};
}
export function history(comments, context) {
  const tasks={};
  for(const comment of comments){
    const entry=decode(comment,context);if(!entry)continue;
    const {record:r,digest}=entry;
    const task=tasks[r.task]??={entries:[],events:new Map(),latest:null};
    const repeated=task.events.get(r.event_id);
    if(repeated){if(repeated.digest!==digest)throw Error('EVENT_ID_CONFLICT');continue;}
    const previous=task.latest;
    if(r.revision!==(previous?.record.revision||0)+1 || r.parent!==(previous?.digest||null))throw Error('CHECKPOINT_FORK_OR_MISSING_PARENT');
    if(previous && Date.parse(r.at)<Date.parse(previous.record.at))throw Error('STALE_CHECKPOINT_TIME');
    task.entries.push(entry);task.events.set(r.event_id,entry);task.latest=entry;
  }
  return tasks;
}
export function prepare(input, comments, context, {headSha, now=new Date().toISOString()}={}) {
  const task=history(comments,context)[input.task];
  const repeated=task?.events.get(input.event_id);
  if(repeated){
    for(const key of ['sha','branch','state','scope','acceptance','next_action','failure','required_action','proofs'])
      if(JSON.stringify(input[key]??(key==='proofs'?[]:''))!==JSON.stringify(repeated.record[key]??(key==='proofs'?[]:'')))throw Error('EVENT_ID_CONFLICT');
    return {duplicate:true,...repeated};
  }
  const previous=task?.latest;
  if(input.expected_revision!==(previous?.record.revision||0)||input.expected_sha!==(previous?.record.sha||null))throw Error('STALE_CHECKPOINT_WRITER');
  if(input.sha!==headSha)throw Error('STALE_BRANCH_SHA');
  if(previous && input.sha!==previous.record.sha && input.state!=='IN_PROGRESS')throw Error('NEW_SHA_REQUIRES_REVALIDATION');
  // Checkpoint claims are tracking only. Milestones are derived by the independent
  // gate, never authorized by caller-supplied verified=true or proof URL strings.
  if(!['READY','IN_PROGRESS','BLOCKED'].includes(input.state))throw Error('USE_INDEPENDENT_GATE_FOR_MILESTONES');
  if(previous)transition(previous.record.state,input.state,{reason:input.failure,resumeState:previous.record.resume_state});
  const record={version:1,issue:context.issue,task:input.task,event_id:input.event_id,
    revision:(previous?.record.revision||0)+1,parent:previous?.digest||null,
    state:input.state,sha:input.sha,branch:input.branch,scope:input.scope,acceptance:input.acceptance,
    next_action:input.next_action,failure:input.failure||'',required_action:input.required_action||'',
    resume_state:input.state==='BLOCKED'?(previous?.record.resume_state||previous?.record.state||'READY'):null,
    proofs:input.proofs||[],at:now};
  validate(record);
  return {duplicate:false,record,digest:hash(record),body:encode(record)};
}
export function resume(issue, comments, context) {
  if(issue.number!==context.issue||typeof issue.body!=='string'||!issue.body.trim())throw Error('ISSUE_DEFINITION_MISSING');
  const tasks=history(comments,context);
  return {version:1,issue:issue.number,title:issue.title,url:issue.html_url,
    definition:issue.body,definition_sha256:hash(issue.body),
    tasks:Object.fromEntries(Object.entries(tasks).map(([id,t])=>[id,{...t.latest.record,checkpoint_url:t.latest.url,
      completion:'CANNOT_VERIFY',note:'Checkpoint is a progress claim; use independent acceptance gate for completion.'}])),
    next_action:Object.keys(tasks).length?'Follow each task next_action; continue independent unblocked tasks.':'Read issue and record scope, acceptance, branch and next action before coding.',
    conversation_recovery:false};
}
