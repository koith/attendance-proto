import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

const checks = [
  ['앱 버전 v0.01', html.includes('const APP_VERSION="v0.01"')],
  ['세로 오버스크롤 허용', html.includes('overscroll-behavior-x:none; overscroll-behavior-y:auto;')],
  ['모바일 POS 본문 높이 자동', html.includes('body:has(.pos-screen){height:auto;min-height:100%;overflow-y:visible;overscroll-behavior-y:auto}')],
  ['모바일 POS 래퍼가 문서 흐름 유지', html.includes('body:has(.pos-screen) .wrap{height:auto;min-height:100dvh;overflow:visible}')],
  ['직원 목록 내부 스크롤 제거', html.includes('.pos-screen #empGrid.employee-scroll-surface{flex:none;max-height:none;overflow-y:visible;overscroll-behavior-y:auto;-webkit-overflow-scrolling:auto}')],
  ['기존 모바일 body 잠금 제거', !html.includes('body:has(.pos-screen),body:has(.pos-screen) .wrap{height:100dvh;min-height:0;overflow:hidden}')],
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  for (const [name] of failed) console.error(`FAIL: ${name}`);
  process.exit(1);
}

for (const [name] of checks) console.log(`PASS: ${name}`);
