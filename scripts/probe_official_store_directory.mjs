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
