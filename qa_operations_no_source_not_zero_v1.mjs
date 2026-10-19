// #1184 MTG-05/06 — exercise shipped inquiry renderPage, not a helper copy.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync('operations_v1.js','utf8');
const begin=source.indexOf(' const renderPage=data=>{');
const end=source.indexOf(' const refresh=async(',begin);
assert.ok(begin>0&&end>begin,'production inquiry renderer must exist');
const fragment=source.slice(begin,end);
function runPage(data,mode='actual'){
 const nodes=new Map(['.ops-summary','.ops-table tbody'].map(k=>[k,{innerHTML:''}]));
 const body={querySelector:k=>nodes.get(k)||null};
 const q={mode,size:100,page:1};
 const pager={textContent:''},prev={disabled:false},next={disabled:false};
 const render=new Function('body','q','pager','prev','next','esc','num','won','empty',
   fragment+'\nreturn renderPage;')(
   body,q,pager,prev,next,
   v=>String(v??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])),
   n=>String(n),n=>Number(n||0)+'원',t=>'<div>'+t+'</div>');
 render(data);
 return {summary:nodes.get('.ops-summary').innerHTML,table:nodes.get('.ops-table tbody').innerHTML,pager:pager.textContent,next:next.disabled};
}
const missing=runPage({rows:[],total_count:0,totals:{net:0,vat:0,total:0}});
assert.match(missing.summary,/실거래 합계 미확인/);
assert.match(missing.summary,/실제 매출 0원으로 확정한 것은 아닙니다/);
assert.doesNotMatch(missing.summary,/전체 합계 <b>0원<\/b>/,
 'Empty ingestion may not be reported as proven zero revenue');
assert.match(missing.summary,/표시 0 \/ 전체 0건/);
assert.match(missing.table,/해당 조건의 기록이 없습니다/);
assert.equal(missing.next,true);
const sample={id:1,business_date:'2026-10-18',transaction_type:'SALE',channel:'POS',
 net_amount:0,vat_amount:0,total_amount:0,status:'CONFIRMED',counterparty:'실제 0원 거래',is_demo:false};
const validZero=runPage({rows:[sample],total_count:1,totals:{net:0,vat:0,total:0}});
assert.match(validZero.summary,/전체 공급가액 <b>0원<\/b>/);
assert.match(validZero.summary,/전체 합계 <b>0원<\/b>/,
 'Legitimate nonempty zero amount retains valid numeric result');
assert.doesNotMatch(validZero.summary,/실거래 합계 미확인/);
const validPositive=runPage({rows:[sample],total_count:1,totals:{net:'12000',vat:'1200',total:'13200'}});
assert.match(validPositive.summary,/전체 합계 <b>13200원<\/b>/,
 'Valid server numeric strings preserve genuine sales totals');
for(const totals of [{},{net:null,vat:0,total:0},{net:'',vat:0,total:0},{net:NaN,vat:0,total:0},
 {net:'abc',vat:0,total:0},{net:0,vat:0,total:Number.MAX_SAFE_INTEGER+1}]){
 const result=runPage({rows:[sample],total_count:1,totals});
 assert.match(result.summary,/실거래 합계 미확인/,
  'A missing or unsafe aggregate cannot become 0 by currency formatter');
 assert.doesNotMatch(result.summary,/전체 합계 <b>0원<\/b>/);
}
const noDemo=runPage({rows:[],total_count:0,totals:{net:0,vat:0,total:0}},'demo');
assert.match(noDemo.summary,/시연 예시 · 실제 실적에서 제외/);
assert.match(noDemo.summary,/실거래 합계 미확인/);
const css=fs.readFileSync('operations_v1.css','utf8');
assert.match(css,/\.ops-financial-unverified/);
assert.match(source,/실거래 원천|실거래 합계 미확인/);
console.log('PASS MTG-05/06 shipped inquiry renderer: no records != zero real revenue, invalid totals fail closed, valid 0 kept');
