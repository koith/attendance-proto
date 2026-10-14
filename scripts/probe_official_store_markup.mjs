// Probe official page markup only. No authentication or writes.
const urls=[
'https://10billioncoffee.co.kr/store/546-%EC%9D%BC%EC%82%B0%ED%82%A8%ED%85%8D%EC%8A%A4%EC%A0%90',
'https://10billioncoffee.co.kr/store/539-%EC%84%B8%EC%A2%85%EB%B3%B4%EB%9E%8C%EC%A0%90',
'https://10billioncoffee.co.kr/sitemap.xml'];
for(const url of urls){
 const r=await fetch(url,{signal:AbortSignal.timeout(15000)});
 const html=await r.text();
 console.log('PROBE',url,r.status,html.length);
 for(const q of ['월드고양로','남세종로','주소','"address"','<h1','<title','store/546']){
  const i=html.indexOf(q);
  if(i>=0)console.log('CTX',q,JSON.stringify(html.slice(Math.max(0,i-450),i+800)).slice(0,1500));
 }
 if(url.includes('sitemap')) console.log('SITEMAP_COUNT', [...html.matchAll(/<loc>/g)].length);
}
