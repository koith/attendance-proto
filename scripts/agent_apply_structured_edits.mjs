// Deterministic, fail-closed bridge from READ-ONLY AI output to an isolated git
// checkout. The model NEVER receives a shell, GitHub write API or production access.
// It can propose literal replacements; only this host-side validator writes.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const BEGIN='AGENT_EDITS_BEGIN';
const END='AGENT_EDITS_END';
const ROOT_APP=/^[a-zA-Z0-9_-]+\.(?:js|html|css)$/;
const ROOT_QA=/^qa_[a-zA-Z0-9_-]+\.mjs$/;
const MAX_RESPONSE=250_000, MAX_EDITS=12, MAX_REPLACEMENT=80_000;

function parseProposal(output) {
  if(typeof output!=='string'||output.length>MAX_RESPONSE)throw Error('Invalid or oversized agent output');
  const start=output.lastIndexOf(BEGIN);
  if(start<0)throw Error('Missing '+BEGIN+' structured edit proposal');
  const stop=output.indexOf(END,start+BEGIN.length);
  if(stop<0)throw Error('Missing '+END+' structured edit proposal');
  const raw=output.slice(start+BEGIN.length,stop).trim();
  // Accept optional presentation fences, but never execute the proposed text.
  const first=raw.indexOf('{'),last=raw.lastIndexOf('}');
  if(first<0||last<=first)throw Error('Expected JSON object inside edit markers');
  let proposal;
  try{proposal=JSON.parse(raw.slice(first,last+1))}catch(e){throw Error('Invalid JSON change proposal: '+e.message)}
  if(!proposal||!Array.isArray(proposal.edits)||proposal.edits.length<2||
    proposal.edits.length>MAX_EDITS)throw Error('Expected 2..'+MAX_EDITS+' edits');
  return proposal.edits;
}

export function applyStructuredEdits({root,output,dryRun=false}) {
  const edits=parseProposal(output);
  if(typeof root!=='string'||!path.isAbsolute(root))throw Error('Absolute checkout root required');
  const changes=new Map();
  let app=false,qa=false;
  for(const e of edits) {
    if(!e||typeof e.path!=='string'||!(ROOT_APP.test(e.path)||ROOT_QA.test(e.path))||
      e.path.includes('..')||e.path.includes('/')||e.path.includes('\\'))
      throw Error('Forbidden edit path: '+String(e?.path).slice(0,100));
    if(typeof e.new!=='string'||!e.new.trim()||e.new.length>MAX_REPLACEMENT)
      throw Error('Empty or oversized replacement: '+e.path);
    if(ROOT_QA.test(e.path))qa=true;
    if(ROOT_APP.test(e.path))app=true;
    const filename=path.join(root,e.path);
    if(!changes.has(e.path)){
      let present=false,original='';
      try{
        const info=fs.lstatSync(filename);
        if(!info.isFile()||info.isSymbolicLink())throw Error('Not a regular file: '+e.path);
        original=fs.readFileSync(filename,'utf8');present=true;
      }catch(err){if(err.code!=='ENOENT')throw err}
      changes.set(e.path,{filename,present,original,updated:original});
    }
    const c=changes.get(e.path);
    if(e.old===null && ROOT_QA.test(e.path)&&!c.present){
      if(c.updated!=='')throw Error('QA test creation repeated: '+e.path);
      c.updated=e.new;
      continue;
    }
    if(typeof e.old!=='string'||!e.old.length||!c.present)
      throw Error('Existing-file edit requires an exact nonempty old string: '+e.path);
    const start=c.updated.indexOf(e.old);
    if(start<0||c.updated.indexOf(e.old,start+e.old.length)>=0)
      throw Error('Old text must occur exactly once: '+e.path);
    c.updated=c.updated.slice(0,start)+e.new+c.updated.slice(start+e.old.length);
  }
  if(!app||!qa)throw Error('Required both application code and feature QA changes');
  for(const [name,c] of changes) {
    if(c.updated===c.original)throw Error('No real text change: '+name);
  }
  // Validate the entire transaction before any write. Never execute generated
  // shell, allow traversal/renames, or touch workflows, data, schemas or secrets.
  if(!dryRun)for(const c of changes.values())fs.writeFileSync(c.filename,c.updated,{flag:c.present?'w':'wx'});
  return [...changes.keys()];
}

const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  try{
    const output=fs.readFileSync(process.argv[2]||'', 'utf8');
    const edited=applyStructuredEdits({root:process.cwd(),output});
    console.log('Applied validated isolated agent edits: '+edited.join(', '));
  }catch(e){console.error('AGENT_EDITS_REJECTED: '+String(e?.message||e));process.exitCode=1}
}
