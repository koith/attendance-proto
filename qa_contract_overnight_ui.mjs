import fs from 'node:fs';
const ui=fs.readFileSync('employment_contract_overnight_ui.js','utf8');
const html=fs.readFileSync('employment_contracts.html','utf8');
const core=fs.readFileSync('employment_contracts_v3.js','utf8');
function t(name,fn){try{fn();console.log('PASS',name)}catch(e){console.error('FAIL',name,e.message);process.exitCode=1}}
function a(x,m){if(!x)throw new Error(m)}
t('contract page loads overnight helper',()=>a(html.includes('employment_contract_overnight_ui.js'),'helper missing'));
t('core treats end-before-start as next day',()=>a(core.includes('if(n<0)n+=1440'),'overnight minute calculation missing'));
t('UI marks end-before-start as 익일',()=>{a(ui.includes('b<a'),'overnight comparison missing');a(ui.includes("badge.textContent='익일'"),'익일 badge missing')});
t('workday payload remains unchanged',()=>a(core.includes('out.push({weekday,start:x.start,end:x.end})'),'workday payload changed'));
