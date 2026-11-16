import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const api=require('./payroll_batch_export_v1.js');
const id=1,month='2026-10',storeId=1;
const sample=(id=1,store_id=1)=>{
 const pay={base:100000,juhyu:10000,adjust:2000,nightAllowance:3000,
  breakCompPay:0,substitutePay:5000,gross:120000,net:116000};
 return {employee_id:id,employee_name:id===1?'가상직원 A':'가상직원 B',
  store_id,emp:{store_id},hours:8,pay,issues:0,sessions:[{status:'COMPLETE'}]};
};
const fakeXlsx={
 utils:{book_new:()=>({}),aoa_to_sheet:rows=>({rows}),book_append_sheet:(book,sheet)=>{book.sheet=sheet;}},
 write:()=>new Uint8Array([80,75,...Array(118).fill(0)])
};
const preview=(rows=[sample()],totalGross=120000)=>api.prepare(rows,{
 ym:month,storeId,closed:false,totalGross
});
test('one-row real payroll-object source, strictly preview status and known totals',()=>{
 const p=preview();
 assert.equal(p.gross,120000);assert.equal(p.rows.length,1);
 assert.equal(p.rows[0].final,false);assert.equal(p.rows[0].reviewRequired,true);
 assert.equal(p.rows[0].delta,0);
 assert.equal(p.rows[0].deductions,null);
});
test('fail closed: cross-store, duplicate, missing pay, final mismatch, unverified final tax',()=>{
 assert.throws(()=>preview([sample(1,2)]),/CROSS_STORE_DENIED/);
 assert.throws(()=>preview([sample(1),sample(1)],240000),/DUPLICATE_EMPLOYEE/);
 assert.throws(()=>preview([{...sample(),pay:null}]),/PAYROLL_MISSING_OR_UNVERIFIED/);
 assert.throws(()=>preview([sample()],130000),/MONTHLY_TOTAL_MISMATCH/);
 assert.throws(()=>api.prepare([sample()],{ym:month,storeId,closed:true,totalGross:120000}),
  /FINAL_DEDUCTIONS_NOT_VERIFIED/);
 assert.throws(()=>api.prepare([{...sample(),issues:1}],{
  ym:month,storeId,closed:true,totalGross:120000}),/FINAL_PAYROLL_NOT_RECONCILED/);
 const wrong={...sample(),pay:{...sample().pay,gross:121000}};
 assert.throws(()=>api.prepare([wrong],{ym:month,storeId,closed:true,totalGross:121000}),
  /FINAL_PAYROLL_NOT_RECONCILED/);
 assert.throws(()=>api.prepare([sample()],{ym:'2026-13',storeId,totalGross:120000}),/SCOPE_INVALID/);
 assert.throws(()=>preview([{...sample(),pay:{...sample().pay,net:120001}}]),/NET_EXCEEDS_GROSS/);
});
test('exact itemized deductions are mandatory for a real final record',()=>{
 const base={...sample(),verifiedDeductions:{
  pension:1000,health:1000,longtermCare:100,employment:900,incomeTax:900,localIncomeTax:100,other:0
 }};
 const ok=api.prepare([base],{ym:month,storeId,closed:true,totalGross:120000});
 assert.equal(ok.final,true);assert.equal(ok.rows[0].deductions.pension,1000);
 assert.throws(()=>api.prepare([{...base,verifiedDeductions:{...base.verifiedDeductions,incomeTax:0}}],{
  ym:month,storeId,closed:true,totalGross:120000}),/DEDUCTION_ITEMIZATION_MISMATCH/);
});
test('native one-page JPEG image PDF has correct xref and no font-dependent Korean text',()=>{
 const jpeg=new Uint8Array([0xff,0xd8,...Array(24).fill(123),0xff,0xd9]);
 const pdf=api.makePdfFromJpeg(jpeg,1240,1754);
 const text=Buffer.from(pdf).toString('latin1');
 assert.ok(text.startsWith('%PDF-1.4'));
 assert.match(text,/\/Type \/Catalog \/Pages 2 0 R/);
 assert.match(text,/\/MediaBox \[0 0 595.28 841.89\]/);
 assert.match(text,/\/DCTDecode \/Length 28/);
 assert.match(text,/xref\n0 6\n/);
 assert.match(text,/%%EOF\n$/);
 const ix=Number(text.match(/startxref\n(\d+)\n%%EOF/)[1]);
 assert.equal(text.slice(ix,ix+4),'xref');
 for(let id=1;id<=5;id++){
  const match=text.match(new RegExp('^'+id+' 0 obj','gm'));
  assert.equal(match.length,1);
 }
});
test('ZIP store UTF-8 filenames, CRC and directory offsets are valid, no duplicate names',()=>{
 const jpeg=new Uint8Array([0xff,0xd8,...Array(24).fill(123),0xff,0xd9]);
 const pdf=api.makePdfFromJpeg(jpeg);
 const files=[{name:'2026-10_1_가상직원.pdf',bytes:pdf},
  {name:'월별집계.xlsx',bytes:new Uint8Array([80,75,...Array(118).fill(0)])}];
 const zip=api.makeZip(files),buf=Buffer.from(zip);
 assert.equal(buf.readUInt32LE(0),0x04034b50);
 const loc=buf.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
 assert.ok(loc>0);assert.equal(buf.readUInt16LE(loc+10),2);
 const cdOff=buf.readUInt32LE(loc+16);
 assert.equal(buf.readUInt32LE(cdOff),0x02014b50);
 const utf8Flag=buf.readUInt16LE(cdOff+8);
 assert.equal(utf8Flag&0x0800,0x0800);
 assert.throws(()=>api.makeZip([...files,files[0]]),/ZIP_FILENAME_COLLISION/);
 assert.throws(()=>api.makeZip([{...files[0],name:'../private.pdf'},files[1]]),/ZIP_FILENAME_UNSAFE/);
});
test('visible Korean preview disclaimer and gross/source details render on real canvas API',()=>{
 const txt=[],ctx={
  fillRect:()=>{},fillText:s=>txt.push(String(s)),getImageData:()=>{},
  set fillStyle(v){},set font(v){},set textBaseline(v){}
 };
 const fake={getContext:()=>ctx};
 api.renderPage(preview().rows[0],fake);
 assert.equal(fake.width,1240);assert.equal(fake.height,1754);
 assert.ok(txt.some(x=>x.includes('미마감')));
 assert.ok(txt.some(x=>x.includes('확정 지급액 아님')));
 assert.ok(txt.some(x=>x.includes('120,000원')));
 assert.ok(!txt.some(x=>x.includes('마감 검증본')));
});
test('one user action actually writes ZIP of one XLSX + one PDF using selected save location',async()=>{
 const originalWindow=global.window,originalDocument=global.document;
 const jpeg=Buffer.from([0xff,0xd8,...Array(24).fill(123),0xff,0xd9]);
 let final=null,closed=false;
 const ctx={fillRect:()=>{},fillText:()=>{},set fillStyle(_){},set font(_){},set textBaseline(_){}};
 const canvas={width:0,height:0,getContext:()=>ctx,
  toDataURL:()=> 'data:image/jpeg;base64,'+jpeg.toString('base64')};
 global.window={showSaveFilePicker:async opts=>{
  assert.ok(opts.suggestedName.includes('미마감검토'));
  return {createWritable:async()=>({
   write:async blob=>{final=new Uint8Array(await blob.arrayBuffer());},
   close:async()=>{closed=true;},abort:async()=>{}
  })};
 }};
 global.document={createElement:type=>{assert.equal(type,'canvas');return canvas;}};
 try{
  const result=await api.exportPayroll([sample()],{ym:month,storeId,totalGross:120000,closed:false,xlsx:fakeXlsx});
  assert.equal(result.status,'DOWNLOADED');
  assert.equal(result.pdfCount,1);assert.equal(result.monthlyXlsx,1);
  assert.equal(result.final,false);assert.ok(closed);
  const zip=Buffer.from(final),eo=zip.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
  assert.ok(eo>40);assert.equal(zip.readUInt16LE(eo+10),2);
  assert.ok(final.length>220);
 }finally{
  if(originalWindow===undefined)delete global.window;else global.window=originalWindow;
  if(originalDocument===undefined)delete global.document;else global.document=originalDocument;
 }
});
test('real payroll UI includes the new user-visible button, authenticated handler and shipped module',()=>{
 const html=fs.readFileSync('index.html','utf8');
 assert.match(html,/payroll_batch_export_v1\.js\?v=20261116pay02/);
 assert.match(html,/id="btnExportPayrollBatch"/);
 assert.match(html,/BaekeokPayrollBatchExport\.exportPayroll\(R\.rows/);
 assert.match(html,/!LIVE\|\|!Auth\.token/);
 assert.match(html,/closed:!!closedSnapshot/);
 assert.match(html,/totalGross:R\.totalGross/);
 assert.match(html,/FINAL_DEDUCTIONS_NOT_VERIFIED/);
});
