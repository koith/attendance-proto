import fs from 'node:fs';
const html=fs.readFileSync('employment_contracts.html','utf8');
const core=fs.readFileSync('employment_contracts_v3.js','utf8');
function t(name,fn){try{fn();console.log('PASS',name)}catch(e){console.error('FAIL',name,e.message);process.exitCode=1}}
function a(x,m){if(!x)throw new Error(m)}
t('contract page does not load overnight badge helper',()=>a(!html.includes('employment_contract_overnight_ui.js'),'legacy helper still loaded'));
t('core treats end-before-start as next day',()=>a(core.includes('if(n<0)n+=1440'),'overnight minute calculation missing'));
t('no redundant day-end labels are injected',()=>a(!html.includes('employment_contract_overnight_v1.js'),'legacy day-end helper still loaded'));
t('workday payload remains unchanged',()=>a(core.includes('out.push({weekday,start:x.start,end:x.end})'),'workday payload changed'));
