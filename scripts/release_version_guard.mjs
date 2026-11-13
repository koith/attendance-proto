// #959: Protect EVERY published UI change, not only a handful of root files.
// Gate only public app assets; operational SQL, security QA and documentation are
// not user-visible releases. This runs without production API credentials.
import {readFileSync} from 'node:fs';

const publishedRoots=new Set(['assets','public','images','css','js','static']);
export function isPublishedUiAsset(path){
 if(typeof path!=='string'||!path||path.includes('\\'))return false;
 const parts=path.split('/');
 if(parts.some(x=>x==='..'||x==='.'||!x))return false;
 if(parts.length>1&&!publishedRoots.has(parts[0]))return false;
 return /\.(?:html?|css|js|svg|png|jpe?g|webp|gif|ico|woff2?)$/i.test(parts.at(-1));
}
export function parseAppVersion(source){
 const found=String(source).match(/(?:^|\n)const APP_VERSION="v(\d+)\.(\d+)";/);
 if(!found)throw Error('APP_VERSION_MISSING_OR_MALFORMED');
 const major=Number(found[1]),minor=Number(found[2]);
 if(!Number.isSafeInteger(major)||!Number.isSafeInteger(minor))throw Error('APP_VERSION_INVALID');
 return {major,minor,label:'v'+major+'.'+minor};
}
export function assertVisibleVersion(source,label){
 const html=String(source);
 const match=html.match(/<button\b[^>]*\bid="appVersion"[^>]*\baria-label="현재 앱 버전 (v\d+\.\d+)"[^>]*>\s*(v\d+\.\d+)\s*<\/button>/);
 if(!match||match[1]!==label||match[2]!==label)
   throw Error('VISIBLE_VERSION_BADGE_MISMATCH: expected '+label);
}
export function checkReleaseVersion({before,after,changedPaths}){
 if(!Array.isArray(changedPaths))throw Error('CHANGED_PATHS_REQUIRED');
 const published=[...new Set(changedPaths.filter(isPublishedUiAsset))];
 if(!published.length)return {skipped:true,published:[]};
 const prev=parseAppVersion(before),next=parseAppVersion(after);
 if(next.major<prev.major||(next.major===prev.major&&next.minor<=prev.minor))
   throw Error('APP_VERSION_NOT_INCREMENTED: '+prev.label+' -> '+next.label+' for '+published.join(', '));
 assertVisibleVersion(after,next.label);
 return {skipped:false,previous:prev.label,current:next.label,published};
}
if(process.argv[1]?.endsWith('/release_version_guard.mjs')){
 const [basePath,indexPath,changedPath]=process.argv.slice(2);
 if(!basePath||!indexPath||!changedPath)throw Error('ARGS_REQUIRED: base index changed-list');
 const res=checkReleaseVersion({
  before:readFileSync(basePath,'utf8'),
  after:readFileSync(indexPath,'utf8'),
  changedPaths:readFileSync(changedPath,'utf8').split(/\r?\n/).filter(Boolean)
 });
 console.log(res.skipped?'RELEASE_VERSION_SKIP_NO_PUBLIC_ASSETS':'RELEASE_VERSION_PASS '+res.previous+' -> '+res.current+' ('+res.published.length+' assets)');
}
