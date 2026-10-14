const provinces = {
 '서울':'서울특별시','부산':'부산광역시','대구':'대구광역시','인천':'인천광역시',
 '광주':'광주광역시','전남광주통합특별시':'전남광주통합특별시','전남광주특별시':'전남광주통합특별시','전남광주':'전남광주통합특별시','대전':'대전광역시','울산':'울산광역시','세종':'세종특별자치시',
 '경기':'경기도','강원':'강원특별자치도','강원도':'강원특별자치도',
 '충북':'충청북도','충남':'충청남도','전북':'전북특별자치도','전라북도':'전북특별자치도',
 '전남':'전라남도','경북':'경상북도','경남':'경상남도','제주':'제주특별자치도','제주도':'제주특별자치도'
};
for(const value of Object.values(provinces)) provinces[value] = value;
export function parseLocationAddress(address) {
 const parts = String(address || '').trim().split(/\s+/);
 const province = provinces[parts[0]];
 if (!province) return null;
 if (province === '세종특별자치시') return {province,district:'',subdistrict:''};
 const district=parts[1] || '';
 if (!/[시군구]$/.test(district)) return null;
 const subdistrict=district.endsWith('시') && /구$/.test(parts[2] || '') ? parts[2] : '';
 return {province,district,subdistrict};
}
export function parseOfficialDetail(html,requestedUrl) {
 const source=String(html || '');
 const blocks=[...source.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
 let entry;
 for (const [,raw] of blocks) {
  try { const data=JSON.parse(raw); if (data['@type'] === 'Restaurant') {entry=data;break;} } catch {}
 }
 if (!entry || typeof entry.name !== 'string' || typeof entry.address?.streetAddress !== 'string') return null;
 const canonical=new URL(entry.url || requestedUrl);
 const target=new URL(requestedUrl);
 if (canonical.hostname !== '10billioncoffee.co.kr' || canonical.pathname !== target.pathname || !canonical.pathname.startsWith('/store/')) return null;
 const expectedName=decodeURIComponent(target.pathname.split('/').pop() || '').replace(/^\d+-/,'');
 if (entry.name.trim() !== expectedName.trim()) return null;
 const address=entry.address.streetAddress.trim();
 const admin=parseLocationAddress(address);
 return admin ? {name:entry.name.trim(),address,...admin,source_url:requestedUrl} : null;
}