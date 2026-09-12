import fs from 'node:fs';
const idx=fs.readFileSync('index.html','utf8');
function t(name,fn){try{fn();console.log('PASS',name)}catch(e){console.error('FAIL',name,e.message);process.exitCode=1}}
function a(x,m){if(!x)throw new Error(m)}
t('future month gets zero default juhyu weeks',()=>a(idx.includes('if(ym>currentYm) return 0;'),'future month guard missing'));
t('past month preserves legacy four-week convention',()=>a(idx.includes('if(ym<currentYm) return 4;'),'past month compatibility missing'));
t('current month counts only completed Sundays',()=>{a(idx.includes('for(let d=1; d<now.getDate(); d++)'),'today must be excluded');a(idx.includes('getDay()===0'),'completed week boundary missing')});
t('current month remains capped at legacy four weeks',()=>a(idx.includes('return Math.min(4,completed);'),'four-week cap missing'));
t('weekly allowance amount formula is untouched',()=>a(idx.includes('weekly = (emp.juhyu_round!=null) ? xround(wage*jh, emp.juhyu_round) : Math.round(wage*jh);'),'weekly formula changed'));
