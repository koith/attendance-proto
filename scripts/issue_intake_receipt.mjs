#!/usr/bin/env node
// Capture GitHub issue/comment source as an append-only receipt before coding.
// This is NOT an interceptor or recovery tool for the ChatGPT app.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
const digest=s=>createHash('sha256').update(s,'utf8').digest('hex');
const secret=/(?:sk-[a-zA-Z0-9_-]{20,}|gh[pousr]_[a-zA-Z0-9]{20,}|-----BEGIN [^-]*PRIVATE KEY-----)/;
export function extractSource(eventName,event){
 const issue=event.issue;let text,kind,author,origin;
 if(eventName==='issues'){
  if(!['opened','edited','reopened','labeled'].includes(event.action))return null;
  text=issue?.body;kind='issue';author=issue?.user?.login;origin='GitHub issue '+event.action;
 }else if(eventName==='issue_comment'){
  if(event.action!=='created'||event.comment?.user?.type==='Bot')return null;
  text=event.comment?.body;kind='comment';author=event.comment?.user?.login;origin='GitHub comment '+event.comment?.id;
 }else if(eventName==='workflow_dispatch'){
  const n=Number(event.inputs?.issue_number);
  if(!Number.isSafeInteger(n)||n<1)throw Error('Invalid approved issue input');
  return {readIssue:n};
 }else throw Error('Unsupported event name');
 const issueNumber=Number(issue?.number);
 if(!Number.isSafeInteger(issueNumber)||issueNumber<1||!author||typeof text!=='string')
    throw Error('Untrusted or incomplete event source');
 return {issueNumber,kind,author,origin,text,title:issue?.title||'',createdAt:kind==='issue'?issue.created_at:event.comment.created_at};
}
export function makeReceipt(s){
 if(!s||!Number.isSafeInteger(s.issueNumber)||s.issueNumber<1||!s.author)throw Error('Invalid source identity');
 if(typeof s.text!=='string'||!s.text.trim()||s.text.length>50000)throw Error('Missing or oversized source; not captured');
 if(secret.test(s.text))throw Error('Sensitive token detected; refusing public duplication');
 const id=digest(JSON.stringify([s.issueNumber,s.kind,s.author,s.title,s.text]));
 const marker='[development-intake:v1:'+id+']';
 const fence=String.fromCharCode(96).repeat(Math.max(3,...[...s.text.matchAll(/\x60+/g)].map(x=>x[0].length+1)));
 const body=[marker,'원문 스냅샷 (GitHub 원천, ChatGPT 대화 자동수집 아님)',
  '출처: '+s.origin,'작성자: '+s.author,'원본 등록: '+(s.createdAt||'확인불가'),
  'SHA-256: '+id,'',fence+'text',s.text,fence].join('\n');
 return {marker,body,id};
}
async function main(){
 const repo=process.env.GITHUB_REPOSITORY,token=process.env.GITHUB_TOKEN;
 if(!/^[-\w.]+\/[-\w.]+$/.test(repo||'')||!token||!process.env.GITHUB_EVENT_PATH)throw Error('GitHub context absent; fail closed');
 const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
 let src=extractSource(process.env.GITHUB_EVENT_NAME,event);
 if(!src){console.log('SOURCE_NOT_APPLICABLE');return;}
 const base=(process.env.GITHUB_API_URL||'https://api.github.com')+'/repos/'+repo;
 const api=async(path,opts={})=>{
  const res=await fetch(base+path,{...opts,headers:{Accept:'application/vnd.github+json',
    Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'}});
  if(!res.ok)throw Error('GitHub intake request failed: '+res.status);
  return {data:await res.json(),link:res.headers.get('link')||''};
 };
 if(src.readIssue){
  const r=await api('/issues/'+src.readIssue),i=r.data;
  src={issueNumber:i.number,kind:'issue',author:i.user?.login,origin:'GitHub issue at agent start',
    text:i.body,title:i.title||'',createdAt:i.created_at};
 }
 const receipt=makeReceipt(src);
 let page=1;
 while(true){
  const r=await api('/issues/'+src.issueNumber+'/comments?per_page=100&page='+page);
  if(!Array.isArray(r.data))throw Error('Cannot verify previous receipts');
  if(r.data.some(c=>c.user?.login==='github-actions[bot]'&&
    (c.body||'').split(/\r?\n/).some(line=>line.trim()===receipt.marker))){
    console.log('ALREADY_CAPTURED '+receipt.id);return;
  }
  if(!r.link.includes('rel="next"'))break;
  if(++page>100)throw Error('Too many pages; receipt not verified');
 }
 const result=await api('/issues/'+src.issueNumber+'/comments',
   {method:'POST',body:JSON.stringify({body:receipt.body})});
 if(!result.data?.id)throw Error('Receipt posting not confirmed');
 console.log('CAPTURED '+receipt.id+' '+result.data.id);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)
 main().catch(e=>{console.error('RECEIPT_FAILED:',e.message);process.exitCode=1;});
