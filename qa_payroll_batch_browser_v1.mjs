import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({acceptDownloads:true,viewport:{width:412,height:915}});
const page=await context.newPage();
try{
 await page.setContent('<html lang="ko"><head><meta charset="utf-8"></head><body><button id="doExport">급여명세서 파일 일괄 저장</button><div id="result"></div></body></html>');
 await page.addScriptTag({content:readFileSync('node_modules/xlsx/dist/xlsx.full.min.js','utf8')});
 await page.addScriptTag({path:'payroll_batch_export_v1.js'});
 await page.evaluate(()=>{
  Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true});
  const pay={base:100000,juhyu:10000,adjust:2000,nightAllowance:3000,breakCompPay:0,
   substitutePay:5000,gross:120000,net:116000};
  window.payTestRow={employee_id:991,employee_name:'가상직원 하나',store_id:1,
   emp:{store_id:1},issues:0,sessions:[{status:'COMPLETE'}],hours:8,pay};
  document.getElementById('doExport').addEventListener('click',async()=>{
   try{
    const value=await window.BaekeokPayrollBatchExport.exportPayroll([window.payTestRow],{
      ym:'2026-10',storeId:1,closed:false,totalGross:120000,xlsx:window.XLSX
    });
    document.getElementById('result').textContent='DONE '+JSON.stringify(value);
   }catch(e){document.getElementById('result').textContent='FAILED '+String(e?.message||e);}
  });
 });
 const [download]=await Promise.all([page.waitForEvent('download',{timeout:30000}),page.locator('#doExport').click()]);
 assert.match(download.suggestedFilename(),/미마감검토.*\.zip$/);
 await page.locator('#result').waitFor({state:'visible'});
 await page.waitForFunction(()=>document.getElementById('result').textContent.startsWith('DONE'),null,{timeout:15000});
 const zip=await fs.readFile(await download.path());
 assert.equal(zip.readUInt32LE(0),0x04034b50);
 const eocd=zip.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
 assert.ok(eocd>0,'ZIP must contain central directory');
 assert.equal(zip.readUInt16LE(eocd+10),2,'1 PDF + 1 XLSX');
 let off=0;
 const extracted=new Map();
 for(let j=0;j<2;j++){
  assert.equal(zip.readUInt32LE(off),0x04034b50);
  const size=zip.readUInt32LE(off+18),nameLength=zip.readUInt16LE(off+26),extra=zip.readUInt16LE(off+28);
  const name=zip.subarray(off+30,off+30+nameLength).toString('utf8');
  const start=off+30+nameLength+extra;
  extracted.set(name,zip.subarray(start,start+size));
  off=start+size;
 }
 const pdf=Array.from(extracted.entries()).find(([k])=>k.endsWith('.pdf'));
 const xlsx=Array.from(extracted.entries()).find(([k])=>k.endsWith('.xlsx'));
 assert.ok(pdf&&xlsx,'both real exports required');
 assert.ok(pdf[0].includes('가상직원'), 'Korean employee filename');
 assert.ok(pdf[1].subarray(0,9).toString('latin1').startsWith('%PDF-1.4'));
 assert.match(pdf[1].toString('latin1'),/\/DCTDecode/);
 assert.equal(xlsx[1].readUInt16LE(0),0x4b50,'real XLSX is ZIP based');
 assert.ok(xlsx[1].length>1000,'real XLSX must contain XML contents');
 // Verify that the Korean text genuinely rendered on browser canvas (not a blank PDF).
 const stats=await page.evaluate(()=>{
  const item=window.BaekeokPayrollBatchExport.prepare([window.payTestRow],{
   ym:'2026-10',storeId:1,closed:false,totalGross:120000}).rows[0];
  const canvas=document.createElement('canvas');
  window.BaekeokPayrollBatchExport.renderPage(item,canvas);
  const p=canvas.getContext('2d').getImageData(100,100,800,200).data;
  let nonWhite=0;for(let i=0;i<p.length;i+=4)if(p[i]<200)nonWhite++;
  return {width:canvas.width,height:canvas.height,nonWhite};
 });
 assert.equal(stats.width,1240);assert.equal(stats.height,1754);
 assert.ok(stats.nonWhite>1000,'actual Korean payroll letter shapes must render');
 console.log('PAY02_REAL_BROWSER_CHROMIUM_SUCCESS: A4 JPEG PDF + genuine SheetJS XLSX + ZIP download + Hangul ink (one employee)');
}finally{await browser.close();}
