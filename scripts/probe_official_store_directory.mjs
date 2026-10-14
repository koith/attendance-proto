// Read-only reconnaissance of the official public store directory.
// No secrets, auth, writes, or production data changes.
const url='https://10billioncoffee.co.kr/store';
const response=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; VerifiedStoreDirectoryBot/1.0)','accept':'text/html'},signal:AbortSignal.timeout(20000)});
const html=await response.text();
console.log('DIRECTORY_HTTP',response.status,'bytes',html.length);
for(const term of ['인하대학교점','부산동래점','매장찾기','매장 찾기','store-list','store_list','store-item','제주연동점']){
 const i=html.indexOf(term);console.log('DIRECTORY_SAMPLE',term,i,i<0?'not-found':html.slice(Math.max(0,i-350),i+750).replace(/\s+/g,' ').slice(0,1050));
}
const links=[...html.matchAll(/(?:href|action)=["']([^"']*(?:\/store|\/api|\/ajax)[^"']*)["']/gi)].map(m=>m[1]);
console.log('DIRECTORY_LINKS',JSON.stringify([...new Set(links)].slice(0,35)));
const scripts=[...html.matchAll(/<script[^>]*src=["']([^"']+)["']/gi)].map(m=>m[1]);
console.log('DIRECTORY_SCRIPTS',JSON.stringify(scripts.slice(-25)));
if(!response.ok)process.exitCode=1;

for(const asset of ['https://10billioncoffee.co.kr/assets/js/store.js?1783647174636.8','https://10billioncoffee.co.kr/sitemap.xml']){
 try {
  const res=await fetch(asset,{signal:AbortSignal.timeout(15000)});
  const body=await res.text();
  console.log('OFFICIAL_ASSET',asset,res.status,body.length);
  if(asset.includes('store.js')){
    for(const term of ['ajax','fetch(','api/','/store','/place','search','URL','url:','request','dataType','getJSON','place']){
      let offset=0,found=0;while(found<4){let at=body.toLowerCase().indexOf(term.toLowerCase(),offset);if(at<0)break;console.log('OFFICIAL_JS_CONTEXT',term,body.slice(Math.max(0,at-220),at+380).replace(/\s+/g,' '));offset=at+term.length;found++;}
    }
  }else{
    console.log('SITEMAP_START',body.slice(0,1000));
    console.log('SITEMAP_STORE_URLS',JSON.stringify([...body.matchAll(new RegExp('<loc>([^<]*store[^<]+)</loc>','g'))].map(m=>m[1]).slice(0,15)));
  }
 }catch(e){console.log('OFFICIAL_ASSET_FAILED',asset,String(e));}
}
