#!/usr/bin/env node
// Fail closed on any narrative append/rewrite of historical canonical ledgers.
// Existing item rows may be updated in place with concise verified evidence.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

export const LEGACY=[
  'PROJECT_BACKLOG_20261017.md',
  'SECURITY_STABILITY_LEDGER_20261103.md',
  'AI_AUTOMATION_SECURITY_LEDGER_20261104.md'
];
function editableRow(line,path) {
 if(path==='PROJECT_BACKLOG_20261017.md')
   return /^\s*-\s*\[[ xX]\]\s+\*\*[A-Z][A-Z0-9-]{2,40}(?=\s|\*\*)/.test(line);
 if(path==='SECURITY_STABILITY_LEDGER_20261103.md')
   return /^\|\s*SEC-S\d\d\s*\|/.test(line);
 if(path==='AI_AUTOMATION_SECURITY_LEDGER_20261104.md')
   return /^\|\s*AISEC-\d\d\s*\|/.test(line);
 return false;
}
export function assessLedgerChange(oldText,newText,path) {
 if(!LEGACY.includes(path))throw Error('UNKNOWN_LEDGER');
 if(oldText===newText)return {path,state:'UNCHANGED'};
 const oldLines=oldText.split('\n'),newLines=newText.split('\n');
 if(oldLines.length!==newLines.length)throw Error('LEDGER_APPEND_OR_DELETE_FORBIDDEN:'+path);
 let touched=0;
 for(let i=0;i<oldLines.length;i++){
  if(oldLines[i]===newLines[i])continue;
  if(!editableRow(oldLines[i],path)||!editableRow(newLines[i],path))
    throw Error('LEDGER_HISTORICAL_NARRATIVE_REWRITE_FORBIDDEN:'+path+':'+(i+1));
  const oldId=oldLines[i].match(path==='PROJECT_BACKLOG_20261017.md'
    ? /^\s*-\s*\[[ xX]\]\s+\*\*([A-Z][A-Z0-9-]{2,40})/
    : /^\|\s*(SEC-S\d\d|AISEC-\d\d)\s*\|/);
  const newId=newLines[i].match(path==='PROJECT_BACKLOG_20261017.md'
    ? /^\s*-\s*\[[ xX]\]\s+\*\*([A-Z][A-Z0-9-]{2,40})/
    : /^\|\s*(SEC-S\d\d|AISEC-\d\d)\s*\|/);
  if(!oldId||!newId||oldId[1]!==newId[1])
    throw Error('LEDGER_TASK_ID_REWRITE_FORBIDDEN:'+path+':'+(i+1));
  if(newLines[i].length>oldLines[i].length+800)
    throw Error('LEDGER_ROW_TOO_LONG:'+path+':'+(i+1));
  touched++;
 }
 if(touched>4||newText.length-oldText.length>1200)
   throw Error('LEDGER_LARGE_CHANGE_FORBIDDEN:'+path);
 return {path,state:'CONCISE_ROW_UPDATES_ONLY',touched,deltaChars:newText.length-oldText.length};
}
export function main(base) {
 if(!/^[a-f0-9]{40}$/.test(base||''))throw Error('INVALID_BASE_SHA');
 const results=[];
 for(const path of LEGACY){
  const old=execFileSync('git',['show',base+':'+path],{encoding:'utf8',maxBuffer:1024*1024});
  const current=fs.readFileSync(path,'utf8');
  results.push(assessLedgerChange(old,current,path));
 }
 console.log('LEGACY_LEDGER_GROWTH_GUARD '+JSON.stringify(results));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 try{main(process.argv[2]);}catch(e){console.error(String(e.message).slice(0,230));process.exitCode=1;}
