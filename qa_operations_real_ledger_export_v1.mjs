import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const app=fs.readFileSync('index.html','utf8');
const source=fs.readFileSync('operations_v1.js','utf8');
const sql=fs.readFileSync('supabase/migrations/20261012200500_operations_real_ledger_export.sql','utf8');
assert.match(app,/async operationsExportPage\(from,to,type,channel,beforeId=null,pageSize=500\)/);
assert.match(app,/this\.operationsScoped\("admin_operations_export_page","admin_store_operations_export_page"/,
 'Existing HQ/store scope chooser must govern real-only export');
assert.match(source,/id="opsExportActual"/,'Sales screen exposes real-only CSV');
assert.match(source,/opsExportActual"\)\.onclick=exportActualOperations/,'button invokes export action');
assert.match(sql,/IF NOT public\.can_manage_store\(p_store_id\)/);
assert.match(sql,/IF NOT public\.is_hq_admin\(\)/);
assert.equal((sql.match(/t\.is_demo = false/g)||[]).length,2,'both RPCs must exclude demo rows');
assert.equal((sql.match(/t\.status = 'CONFIRMED'/g)||[]).length,2,'only confirmed real ledger entries');
assert.equal((sql.match(/ORDER BY t\.id DESC/g)||[]).length,2,'immutable cursor ordering per page');
assert.match(sql,/FROM PUBLIC,anon/,'anonymous execution must be revoked');
assert.doesNotMatch(sql,/\b(?:INSERT|UPDATE|DELETE|TRUNCATE)\s+(?:INTO\s+|FROM\s+)?public\.operations_transactions\b/i,
 'Export migration must be read-only');

const a=source.indexOf('function operationsCsvCell(');
const b=source.indexOf('function shell(tab){',a);
assert.ok(a>=0&&b>a,'use production CSV and export implementations');
const extraction=source.slice(a,b);
const input=Array.from({length:1007},(_,i)=>({
 id:1007-i,business_date:'2026-10-12',transaction_type:'SALE',
 channel:'KIS_POS',counterparty:i===0?'=HYPERLINK("unsafe")':'정상 거래',
 net_amount:1000,vat_amount:100,total_amount:1100,
 status:'CONFIRMED',source:'KIS_POS',source_record_key:'r'+(1007-i),is_demo:false
}));
function fixture(rows=input,options={}){
 const button={disabled:false,textContent:'실거래 CSV'};
 const elements={opsExportActual:button,opsFrom:{value:'2026-10-01'},opsTo:{value:'2026-10-31'},
  opsType:{value:''},opsChannel:{value:''}};
 const fetched=[],alerts=[],links=[],downloaded=[];
 const sandbox={
  exports:{},range:()=>['2026-10-01','2026-10-31'],
  BE:{async operationsExportPage(from,to,type,channel,beforeId,limit){
    fetched.push({from,to,type,channel,beforeId,limit});
    if(options.failOnPage===fetched.length)throw Error('REMOTE_SERVER_DOWN');
    return rows.filter(r=>beforeId===null||r.id<beforeId).slice(0,limit);
  }},
  document:{
   getElementById:key=>elements[key]||null,
   createElement:()=>{const link={href:'',download:'',click(){links.push(this)},remove(){}};return link;},
   body:{appendChild(){}}
  },
  Blob:class Blob{constructor(parts){this.parts=parts;}},
  URL:{createObjectURL(blob){downloaded.push(blob.parts.join(''));return 'blob:test';},revokeObjectURL(){}},
  setTimeout:callback=>callback(),alert:message=>alerts.push(message),window:{}
 };
 vm.createContext(sandbox);
 vm.runInContext(extraction+'\nthis.exports={operationsCsvCell,operationsCsvRows,exportActualOperations};',sandbox);
 return {button,elements,fetched,alerts,links,downloaded,api:sandbox.exports};
}
const successful=fixture();
await successful.api.exportActualOperations();
assert.equal(successful.fetched.length,3,'1,007 rows use 3 real paged API calls');
assert.equal(successful.fetched[0].beforeId,null);
assert.equal(successful.fetched[1].beforeId,508);
assert.equal(successful.fetched[2].beforeId,8);
assert.equal(successful.fetched[0].limit,500);
assert.equal(successful.links.length,1);
assert.equal(successful.downloaded.length,1);
assert.match(successful.links[0].download,/^baekeok-real-operations-2026-10-01-2026-10-31\.csv$/);
const csv=successful.downloaded[0];
assert.ok(csv.startsWith('\uFEFF'),'Korean Excel receives UTF-8 BOM');
assert.equal(csv.split('\r\n').filter(Boolean).length,1008,'full rows and one header exported');
assert.match(csv,/"'=HYPERLINK\(""unsafe""\)"/,'spreadsheet formula injection must be escaped');
assert.equal(successful.alerts.length,0);
assert.equal(successful.button.disabled,false,'button must recover after success');

const bad=fixture([{...input[0],id:1,is_demo:true}]);
await bad.api.exportActualOperations();
assert.equal(bad.links.length,0,'demo records cannot cause any financial download');
assert.match(bad.alerts[0],/실제 거래가 아닌 자료/);

const err=fixture(input,{failOnPage:2});
await err.api.exportActualOperations();
assert.equal(err.fetched.length,2);
assert.equal(err.links.length,0,'do not produce partial finance CSV on backend failure');
assert.match(err.alerts[0],/REMOTE_SERVER_DOWN/);
assert.equal(err.button.disabled,false);

const empty=fixture([]);
await empty.api.exportActualOperations();
assert.equal(empty.links.length,0,'do not create a misleading empty settlement file');
assert.match(empty.alerts[0],/실제 거래가 없습니다/);
assert.throws(()=>successful.api.operationsCsvRows([{...input[0],net_amount:'=1+1'}]),/형식/);
new Function(source);
console.log('PASS real operations CSV export: 1,007 cursor-paged rows, RBAC wiring, no demo, safe quoting, fail-closed errors');
