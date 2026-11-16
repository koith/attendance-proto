// On-demand, short status index extracted from legacy historical ledgers.
// No duplicated state file; legacy checkbox is NOT independent acceptance proof.
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

const SOURCES=[
  ['development','PROJECT_BACKLOG_20261017.md'],
  ['security','SECURITY_STABILITY_LEDGER_20261103.md'],
  ['agent_security','AI_AUTOMATION_SECURITY_LEDGER_20261104.md']
];
const idPattern=/^[A-Z][A-Z0-9-]{2,40}$/;

export function makeStatusIndex(sources) {
  const items=[], seen=new Set();
  for(const {kind,path,content} of sources){
    const lines=String(content||'').split(/\r?\n/);
    for(let i=0;i<lines.length;i++){
      const row=lines[i];let id,status,raw;
      if(kind==='development'){
        const m=row.match(/^\s*-\s*\[([ xX])\]\s+\*\*([A-Z][A-Z0-9-]{2,40})(?=\s|\*\*)/);
        if(!m)continue;
        id=m[2];status=m[1].toLowerCase()==='x'?'MARKED_DONE':'OPEN';
        raw='checkbox_only';
      }else{
        if(!row.startsWith('|'))continue;
        const cols=row.split('|').slice(1,-1).map(x=>x.trim());
        id=cols[0];
        if(!idPattern.test(id||'') ||
           (kind==='security'&&!/^SEC-S\d\d$/.test(id)) ||
           (kind==='agent_security'&&!/^AISEC-\d\d$/.test(id)))continue;
        const cell=kind==='security'?cols[3]:cols[2];
        const normal=String(cell||'').replace(/^\*+|\*+$/g,'').trim();
        const m=normal.match(/^(COMPLETE|IN_PROGRESS|NOT_STARTED|UNVERIFIED|FAILED_PATH)(?:\s*\(.*\))?$/);
        if(!m)continue;
        status=m[1];raw='ledger_status';
      }
      const key=kind+':'+id;
      if(seen.has(key))continue;
      seen.add(key);
      items.push({id,kind,status,path,line:i+1,authority:raw});
    }
  }
  items.sort((a,b)=>a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id));
  if(items.length>160)throw Error('INDEX_ITEM_LIMIT');
  const counts={};
  for(const row of items) {
    const key=row.kind+'/'+row.status;
    counts[key]=(counts[key]||0)+1;
  }
  return {schema:1,source:'legacy-ledger-index-not-acceptance',count:items.length,counts,items};
}

export function boundedIndex(sources,maxChars=12000){
  const result=JSON.stringify(makeStatusIndex(sources));
  if(result.length>maxChars)throw Error('INDEX_CONTEXT_LIMIT');
  return result;
}

function main(){
  const sources=SOURCES.map(([kind,path])=>({kind,path,content:fs.readFileSync(path,'utf8')}));
  console.log(boundedIndex(sources));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main();
