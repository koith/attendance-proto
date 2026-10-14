import fs from 'node:fs';
import {parseOfficialDetail} from './official_store_location_parser.mjs';
const host='https://10billioncoffee.co.kr';
const sitemap=await fetch(host+'/sitemap.xml',{signal:AbortSignal.timeout(16000)}).then(async r=>{if(!r.ok)throw Error('sitemap HTTP '+r.status);return r.text();});
const urls=[...new Set(sitemap.split('<loc>').slice(1).map(v=>v.split('</loc>')[0]).filter(v=>{try{const u=new URL(v);return u.hostname==='10billioncoffee.co.kr'&&u.pathname.startsWith('/store/');}catch{return false;}}))];
if(urls.length<200)throw Error('Unexpected official sitemap store count '+urls.length);
const entries=[],failed=[];let cursor=0;
async function worker(){
 for(;;){
  const i=cursor++;if(i>=urls.length)return;
  const url=urls[i];let location=null,reason='unknown';
  for(let attempt=0;attempt<3;attempt++){
   try{
    const response=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; BrandDirectoryIntegrity/1.0)'},signal:AbortSignal.timeout(16000)});
    if(response.ok){location=parseOfficialDetail(await response.text(),url);if(location)break;reason='UNPARSABLE_OFFICIAL_LOCATION';}
    else{reason='HTTP_'+response.status;if(response.status===404)break;}
   }catch(error){reason=String(error).slice(0,120);}
   if(attempt<2)await new Promise(resolve=>setTimeout(resolve,600*(attempt+1)));
  }
  if(location) entries.push(location);
  else failed.push({url,reason});
  await new Promise(resolve=>setTimeout(resolve,350));
 }
}
await Promise.all(Array.from({length:3},worker));
const counts=new Map();
for(const e of entries)counts.set(e.name,(counts.get(e.name)||0)+1);
const unique=entries.filter(e=>counts.get(e.name)===1).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
const result={fetched:urls.length,parsed:entries.length,unique:unique.length,duplicates:entries.length-unique.length,failed:failed.length,rows:unique};
fs.writeFileSync('official-store-locations.json',JSON.stringify(result,null,2));
for(const row of unique)console.log('OFFICIAL_ROW_JSON '+JSON.stringify(row));
console.log('OFFICIAL_CRAWL_SUMMARY '+JSON.stringify({fetched:urls.length,parsed:entries.length,unique:unique.length,duplicates:entries.length-unique.length,failed:failed.length}));
if(failed.length)console.log('OFFICIAL_CRAWL_FAILURE_SAMPLE '+JSON.stringify(failed.slice(0,15)));
if(unique.length<200)process.exitCode=1;