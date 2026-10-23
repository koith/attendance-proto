import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
// File descriptors work both in Actions and restricted runtimes without pipe IPC.
export function capture(command,args,{input='',timeout=60000,maxBytes=1048576}={}) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ai-dev-process-')),fds=[];
 try{
  fs.writeFileSync(path.join(dir,'in'),input);
  for(const [name,mode] of [['in','r'],['out','w'],['err','w']])fds.push(fs.openSync(path.join(dir,name),mode));
  execFileSync(command,args,{stdio:fds,timeout});
  if(fs.statSync(path.join(dir,'out')).size>maxBytes)throw Error('PROCESS_OUTPUT_LIMIT');
  return fs.readFileSync(path.join(dir,'out'),'utf8');
 }finally{for(const fd of fds)fs.closeSync(fd);fs.rmSync(dir,{recursive:true,force:true});}
}
