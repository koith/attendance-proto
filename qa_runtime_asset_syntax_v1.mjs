import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const pages=['index.html','actual_attendance.html','employment_contracts.html'];
const scripts=new Set();
for(const page of pages){
  const html=fs.readFileSync(page,'utf8');
  for(const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)/g)){
    const url=match[1].split('?')[0];
    if(/^(?:https?:)?\/\//.test(url))continue;
    const script=path.normalize(url.replace(/^\.\//,''));
    if(!fs.existsSync(script))throw new Error('SCRIPT_NOT_FOUND '+page+' '+script);
    scripts.add(script);
  }
}
for(const script of scripts){
  try{execFileSync(process.execPath,['--check',script],{encoding:'utf8',stdio:'pipe'})}
  catch(error){throw new Error('SCRIPT_SYNTAX_INVALID '+script+': '+String(error.stderr||error.message).slice(0,1200))}
}
console.log('PASS '+scripts.size+' locally referenced JS assets have valid syntax');
