// Import candidate discovery only: read the official public sitemap and JSON-LD.
// No database, credentials, or private endpoint is accessed by this action.
const host='https://10billioncoffee.co.kr';
const prefix=host+'/store/';
const response=await fetch(host+'/sitemap.xml',{signal:AbortSignal.timeout(20000)});
if(!response.ok)throw Error('OFFICIAL_SITEMAP_HTTP_'+response.status);
const xml=await response.text();
const urls=[...new Set([...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1].replaceAll('&amp;','&')).filter(u=>u.startsWith(prefix)))];
console.log('OFFICIAL_SOURCE_URLS',urls.length);
if(urls.length<100)throw Error('OFFICIAL_SITEMAP_TOO_SMALL');

const aliases={'서울':'서울특별시','서울특별시':'서울특별시','경기':'경기도','경기도':'경기도','인천':'인천광역시','인천광역시':'인천광역시','부산':'부산광역시','부산광역시':'부산광역시','대구':'대구광역시','대구광역시':'대구광역시','광주':'광주광역시','광주광역시':'광주광역시','대전':'대전광역시','대전광역시':'대전광역시','울산':'울산광역시','울산광역시':'울산광역시','세종':'세종특별자치시','세종특별자치시':'세종특별자치시','강원':'강원특별자치도','강원도':'강원특별자치도','강원특별자치도':'강원특별자치도','충북':'충청북도','충청북도':'충청북도','충남':'충청남도','충청남도':'충청남도','전북':'전북특별자치도','전라북도':'전북특별자치도','전북특별자치도':'전북특별자치도','전남':'전라남도','전라남도':'전라남도','경북':'경상북도','경상북도':'경상북도','경남':'경상남도','경상남도':'경상남도','제주':'제주특별자치도','제주도':'제주특별자치도','제주특별자치도':'제주특별자치도'};
function classify(address){
 const tokens=address.trim().split(/\s+/);
 const province=aliases[tokens[0]];
 if(!province)return null;
 let district='',subdistrict='';
 if(province!=='세종특별자치시'){
   if(/(?:시|군|구)$/.test(tokens[1]||''))district=tokens[1];
   if(district.endsWith('시')&&/구$/.test(tokens[2]||''))subdistrict=tokens[2];
 }
 return {province,district,subdistrict};
}
async function extract(url){
 for(let attempt=1;attempt<=3;attempt++){
  try{
   const r=await fetch(url,{signal:AbortSignal.timeout(20000)});
   if(!r.ok)throw Error('HTTP_'+r.status);
   const html=await r.text();
   const blocks=[...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]);
   for(const block of blocks){
    let data;try{data=JSON.parse(block)}catch{continue}
    const objects=Array.isArray(data)?data:[data];
    for(const obj of objects){
     if(!obj||!String(obj['@type']||'').includes('Restaurant'))continue;
     const name=String(obj.name||'').trim(),address=String(obj.address?.streetAddress||'').trim();
     if(!name.endsWith('점')||address.length<8)continue;
     const geo=classify(address);
     if(!geo)continue;
     return {name,address,...geo,source_url:url};
    }
   }
   return {error:'NO_VALID_JSON_LD',url};
  }catch(e){
   if(attempt===3)return {error:String(e?.message||e),url};
   await new Promise(resolve=>setTimeout(resolve,attempt*750));
  }
 }
}
const result=Array(urls.length);let next=0;
await Promise.all(Array.from({length:6},async()=>{
 while(next<urls.length){
  const i=next++;
  result[i]=await extract(urls[i]);
 }
}));
const rows=result.filter(x=>x?.name&&x.address),failed=result.filter(x=>!x?.name);
const names=new Map();
for(const row of rows)names.set(row.name,(names.get(row.name)||0)+1);
const safe=rows.filter(x=>names.get(x.name)===1);
for(const row of safe)console.log('OFFICIAL_ROW '+JSON.stringify(row));
console.log('OFFICIAL_SUMMARY '+JSON.stringify({sitemap:urls.length,valid:rows.length,unique:safe.length,duplicates:rows.length-safe.length,failed:failed.length,errors:failed.slice(0,12)}));
if(rows.length<100)throw Error('OFFICIAL_VALID_ROWS_TOO_FEW');
