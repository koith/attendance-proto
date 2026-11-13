#!/usr/bin/env node
// Read-only security inventory. Never print credential values, personal emails, or matched content.
// Call with --history for a best-effort, whole Git blob-history scan (requires fetch-depth: 0).
import {readFileSync, writeFileSync} from 'node:fs';
import {execFileSync,spawnSync} from 'node:child_process';

const history=process.argv.includes('--history');
const enforce=process.argv.includes('--require-no-credential-hits');
const patterns=[
 ['credential_private_key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/g],
 ['credential_supabase_secret',/\bsb_secret_[A-Za-z0-9_-]{16,}\b/g],
 ['credential_github_token',/\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/g],
 ['credential_openai',/\bsk-(?:proj-)?[A-Za-z0-9_-]{28,}\b/g],
 ['credential_cloud_key',/\bAKIA[0-9A-Z]{16}\b/g],
 ['credential_google_service_private_key',/\"private_key\"\s*:\s*\"-----BEGIN (?:RSA )?PRIVATE KEY-----/g],
 ['credential_database_url',/\bpostgres(?:ql)?:\/\/[^\s'\"\/]+:[^@\s'\"\/]{6,}@(?!localhost\b|127\.0\.0\.1\b)[^\s'\"\/]+/gi],
 ['credential_slack_token',/\bxox[baprs]-[A-Za-z0-9-]{18,}\b/g],
 ['person_email',/\b[A-Z0-9._%+-]+@(?:gmail|naver|daum|kakao|hanmail)\.(?:com|net)\b/gi],
 ['possible_phone',/\b01[016789][ -]?\d{3,4}[ -]?\d{4}\b/g],
];
const findings=[],stats={files:0,history_blobs:0,oversized:0,nontext:0};
const seen=new Set();
function scan(path,text,origin) {
  if (!text || text.includes('\0')) {stats.nontext++;return}
  if(text.length>1024*1024){stats.oversized++;return}
  const lines=text.split(/\r?\n/);
  for(let i=0;i<lines.length;i++){
    for(const [kind,regex] of patterns){
      regex.lastIndex=0;
      const match=lines[i].match(regex);
      if (!match) continue;
      // The isolated PG test workflow uses one fixed local Docker service name
      // \"postgres\". This is a synthetic DSN, not a production network address.
      // Only whitelist exact reviewed workflow+service host and record its count.
      if(kind==='credential_database_url' &&
         path==='.github/workflows/pin-server-security.yml' &&
         /services:\\s*\\n\\s+postgres:/.test(text) &&
         match.every(candidate=>{try{return new URL(candidate).hostname==='postgres'}catch{return false}})) {
        stats.synthetic_postgres_fixture_urls=(stats.synthetic_postgres_fixture_urls||0)+match.length;
        continue;
      }
      // Never emit matched content, even into CI artifacts. Paths and line numbers only.
      findings.push({kind,path,origin,line:i+1,count:match.length});
    }
  }
}
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
for(const path of files) {
  if (/^(?:node_modules|dist|vendor)\//.test(path))continue;
  try {scan(path,readFileSync(path,'utf8'),'HEAD');stats.files++} catch {}
}
if(history){
  // Scan past committed blobs without checkout, excludes generated/binary and jumbo objects.
  const objects=execFileSync('git',['rev-list','--objects','--all'],{encoding:'utf8',maxBuffer:256*1024*1024})
    .trim().split('\n').map(s=>{const n=s.indexOf(' ');return n<0?null:{sha:s.slice(0,n),path:s.slice(n+1)}})
    .filter(Boolean); // All historical reachable paths, including dotfiles and extensionless configs.
  const unique=objects.filter(o=>{if(seen.has(o.sha))return false;seen.add(o.sha);return true});
  const ids=unique.map(o=>o.sha).join('\n')+'\n';
  const info=spawnSync('git',['cat-file','--batch-check=%(objectname) %(objecttype) %(objectsize)'],{input:ids,encoding:'utf8',maxBuffer:256*1024*1024});
  if(info.status!==0)throw new Error('history git cat-file metadata failed');
  const sized=new Map(info.stdout.trim().split('\n').map(line=>{const [oid,type,size]=line.split(' ');return [oid,{type,size:Number(size)}]}));
  const safe=unique.filter(o=>{const v=sized.get(o.sha);return v&&v.type==='blob'&&v.size>0&&v.size<1024*1024});
  const input=safe.map(o=>o.sha).join('\n')+'\n';
  const b=spawnSync('git',['cat-file','--batch'],{input,encoding:null,maxBuffer:512*1024*1024});
  if(b.status!==0)throw new Error('history blob scan failed');
  let offset=0;
  for(const o of safe){
    const nl=b.stdout.indexOf(10,offset);
    if(nl<0)throw new Error('truncated git history');
    const header=b.stdout.subarray(offset,nl).toString('utf8').trim().split(' ');
    const size=Number(header[2]),start=nl+1;
    if(!Number.isSafeInteger(size)||size<0||start+size>b.stdout.length)throw new Error('corrupt git blob length');
    scan(o.path,b.stdout.subarray(start,start+size).toString('utf8'),'HISTORY');
    stats.history_blobs++;
    offset=start+size+1;
  }
}
const order={credential_private_key:0,credential_supabase_secret:1,credential_github_token:2,credential_openai:3,credential_cloud_key:4,credential_google_service_private_key:5,credential_database_url:6,credential_slack_token:7,person_email:8,possible_phone:9};
findings.sort((a,b)=>order[a.kind]-order[b.kind]||a.path.localeCompare(b.path)||a.line-b.line);
const summary={mode:history?'head_and_history':'head_only',scanned:stats,counts:{},sample_paths:{}};
for(const f of findings) {
  summary.counts[f.kind]=(summary.counts[f.kind]||0)+f.count;
  const k=f.kind+'_paths';
  if(!summary.sample_paths[k])summary.sample_paths[k]=[];
  if(summary.sample_paths[k].length<15&&!summary.sample_paths[k].includes(f.path))
    summary.sample_paths[k].push(f.path);
}
writeFileSync('security-inventory-summary.json',JSON.stringify(summary,null,2)+'\n');
process.stdout.write('SECURITY_INVENTORY_SUMMARY '+JSON.stringify({mode:summary.mode,scanned:stats,counts:summary.counts})+'\n');
process.stdout.write('NOTE: matches are detection candidates, not verified exposures; no values or private data emitted.\n');
if(enforce && Object.entries(summary.counts).some(([key,n])=>key.startsWith('credential_')&&n>0)){
  process.stderr.write('SEC_S15_CREDENTIAL_CANDIDATES_REQUIRE_OWNER_TRIAGE (counts only; no matched content)\n');
  process.exitCode=1;
}
