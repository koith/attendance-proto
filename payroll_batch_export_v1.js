/* PAY-02: directly usable per-employee A4 PDF + monthly XLSX ZIP from the
 * existing authenticated server payroll result in the manager's payroll UI.
 * No external PDF or ZIP library; Korean glyphs are rasterized in the browser.
 * No network requests, session keys, operational writes, or automatic email.
 * Preview is NEVER labelled a legal final payslip. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.BaekeokPayrollBatchExport=api;
})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 const utf8=s=>new TextEncoder().encode(String(s));
 const err=s=>{throw Error('PAY_BATCH_'+s);};
 const money=n=>n!==null&&n!==undefined&&n!==''&&Number.isSafeInteger(Number(n))&&Number(n)>=0&&Number(n)<=9e12;
 const won=n=>Number(n).toLocaleString('ko-KR')+'원';
 const bytes=b=>b instanceof Uint8Array?b:(b instanceof ArrayBuffer?new Uint8Array(b):utf8(b));
 function join(parts){
  const total=parts.reduce((a,b)=>a+bytes(b).length,0);
  if(total>60*1024*1024)err('ZIP_TOTAL_LIMIT');
  const out=new Uint8Array(total);let at=0;
  parts.forEach(p=>{const b=bytes(p);out.set(b,at);at+=b.length;});
  return out;
 }
 function u16(a,n,o=0){a[o]=n&255;a[o+1]=(n>>>8)&255;}
 function u32(a,n,o=0){a[o]=n&255;a[o+1]=(n>>>8)&255;a[o+2]=(n>>>16)&255;a[o+3]=(n>>>24)&255;}
 const crcTable=Uint32Array.from({length:256},(_,n)=>{
  for(let j=0;j<8;j++)n=(n&1)?0xedb88320^(n>>>1):(n>>>1);
  return n>>>0;
 });
 function crc32(b){let c=0xffffffff;for(const n of b)c=crcTable[(c^n)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
 function makeZip(files){
  if(!Array.isArray(files)||files.length<2||files.length>101)err('ZIP_FILES_INVALID');
  const chunks=[],directory=[],names=new Set();let offset=0;
  for(const file of files){
   const name=String(file.name||''),data=bytes(file.bytes);
   if(!name||name.length>180||name.includes('/')||name.includes('\\')||name.includes('..')||/[\x00-\x1f]/.test(name))
    err('ZIP_FILENAME_UNSAFE');
   if(names.has(name.toLowerCase()))err('ZIP_FILENAME_COLLISION');
   names.add(name.toLowerCase());
   if(data.length<20||data.length>25*1024*1024)err('ZIP_FILE_SIZE_INVALID');
   const label=utf8(name),checksum=crc32(data),len=data.length;
   const h=new Uint8Array(30);u32(h,0x04034b50);u16(h,20,4);u16(h,0x0800,6);
   u32(h,checksum,14);u32(h,len,18);u32(h,len,22);u16(h,label.length,26);
   chunks.push(h,label,data);
   const d=new Uint8Array(46);u32(d,0x02014b50);u16(d,20,4);u16(d,20,6);u16(d,0x0800,8);
   u32(d,checksum,16);u32(d,len,20);u32(d,len,24);u16(d,label.length,28);u32(d,offset,42);
   directory.push(d,label);
   offset+=30+label.length+len;
   if(offset>55*1024*1024)err('ZIP_TOTAL_LIMIT');
  }
  const listing=join(directory);
  const end=new Uint8Array(22);u32(end,0x06054b50);
  u16(end,files.length,8);u16(end,files.length,10);u32(end,listing.length,12);u32(end,offset,16);
  return join([...chunks,listing,end]);
 }
 function makePdfFromJpeg(jpeg,width=1240,height=1754){
  const data=bytes(jpeg);
  if(data.length<4||data[0]!==255||data[1]!==216||data[data.length-2]!==255||data[data.length-1]!==217)
   err('JPEG_INVALID');
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<100||height<100)err('PDF_DIMENSIONS');
  const pieces=[],objectOffsets=[0];let length=0;
  const add=v=>{const a=bytes(v);pieces.push(a);length+=a.length;};
  const obj=(number,content)=>{objectOffsets[number]=length;add(number+' 0 obj\n'+content+'\nendobj\n');};
  add('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
  obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>');
  objectOffsets[4]=length;
  add('4 0 obj\n<< /Type /XObject /Subtype /Image /Width '+width+' /Height '+height+
   ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+data.length+' >>\nstream\n');
  add(data);add('\nendstream\nendobj\n');
  const stream='q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ\n';
  objectOffsets[5]=length;
  add('5 0 obj\n<< /Length '+utf8(stream).length+' >>\nstream\n'+stream+'endstream\nendobj\n');
  const startxref=length;
  add('xref\n0 6\n0000000000 65535 f \n');
  for(let i=1;i<=5;i++)add(String(objectOffsets[i]).padStart(10,'0')+' 00000 n \n');
  add('trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+startxref+'\n%%EOF\n');
  return join(pieces);
 }
 function cleanName(s){return String(s||'').normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').trim().slice(0,50);}
 function prepare(rows,{ym,storeId,closed=false,totalGross}={}){
  if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(ym))||!Number.isSafeInteger(Number(storeId))||Number(storeId)<1)
   err('SCOPE_INVALID');
  if(!Array.isArray(rows)||!rows.length||rows.length>100)err('EMPLOYEE_COUNT_INVALID');
  const seen=new Set(),out=[];
  for(const rec of rows){
   if(!rec||!Number.isSafeInteger(Number(rec.employee_id))||Number(rec.employee_id)<1||
       !String(rec.employee_name||'').trim()||!/^\S/.test(String(rec.employee_name)))err('EMPLOYEE_INVALID');
   if(rec.store_id!=null&&Number(rec.store_id)!==Number(storeId))err('CROSS_STORE_DENIED');
   if(rec.emp?.store_id!=null&&Number(rec.emp.store_id)!==Number(storeId))err('CROSS_STORE_DENIED');
   const id=Number(rec.employee_id);
   if(seen.has(id))err('DUPLICATE_EMPLOYEE');seen.add(id);
   const pay=rec.pay||{};
   if(!['gross','base','juhyu','net'].every(k=>money(pay[k])))err('PAYROLL_MISSING_OR_UNVERIFIED');
   const gross=Number(pay.gross),net=Number(pay.net);
   if(net>gross)err('NET_EXCEEDS_GROSS');
   const adj=Number(pay.adjust||0),night=Number(pay.nightAllowance||0),breakPay=Number(pay.breakCompPay||0),sub=Number(pay.substitutePay||0);
   if(![adj,night,breakPay,sub].every(Number.isSafeInteger))err('PAYROLL_COMPONENT_INVALID');
   const sum=Number(pay.base)+Number(pay.juhyu)+adj+night+breakPay+sub;
   const delta=gross-sum;
   if(closed&&(delta!==0||Number(rec.issues||0)>0||
    (rec.sessions||[]).some(x=>x.status!=='COMPLETE')))err('FINAL_PAYROLL_NOT_RECONCILED');
   const detail=rec.verifiedDeductions||null;
   let deductions=null;
   if(detail){
    const fields=['pension','health','longtermCare','employment','incomeTax','localIncomeTax','other'];
    if(!fields.every(k=>money(detail[k]))||fields.reduce((a,k)=>a+Number(detail[k]),0)!==gross-net)
     err('DEDUCTION_ITEMIZATION_MISMATCH');
    deductions=Object.fromEntries(fields.map(k=>[k,Number(detail[k])]));
   }
   // Legally final output requires independently approved statutory breakdown.
   if(closed&&!deductions)err('FINAL_DEDUCTIONS_NOT_VERIFIED');
   out.push({id,name:cleanName(rec.employee_name),ym,storeId:Number(storeId),
    gross,net,base:Number(pay.base),juhyu:Number(pay.juhyu),night,breakPay,sub,adj,delta,
    hours:Number(rec.hours||0),issues:Number(rec.issues||0),deductions,
    final:!!closed,reviewRequired:!closed||delta!==0||Number(rec.issues||0)>0});
  }
  const sum=out.reduce((n,r)=>n+r.gross,0);
  if(!money(sum)||!money(totalGross)||sum!==Number(totalGross))err('MONTHLY_TOTAL_MISMATCH');
  return {ym,storeId:Number(storeId),final:!!closed,rows:out,gross:sum};
 }
 function renderPage(item,canvas){
  canvas.width=1240;canvas.height=1754;
  const c=canvas.getContext('2d',{alpha:false});
  if(!c)err('PDF_CANVAS_UNAVAILABLE');
  const navy='#18344e',black='#182432';
  c.fillStyle='#ffffff';c.fillRect(0,0,1240,1754);
  c.fillStyle=navy;c.fillRect(0,0,1240,18);
  const text=(s,x,y,font='30px sans-serif',color=black)=>{
   c.font=font;c.textBaseline='top';c.fillStyle=color;c.fillText(String(s),x,y,1080);
  };
  text('백억커피 · 직원별 급여 명세',88,92,'bold 48px sans-serif');
  const tag=item.final?'마감 검증본':'검토용 · 미마감 · 확정 지급명세서 아님';
  text(tag,90,161,'bold 26px sans-serif',item.final?'#166534':'#b45309');
  c.fillStyle='#e2e8f0';c.fillRect(88,220,1064,2);
  text('대상 월',92,256,'24px sans-serif','#64748b');
  text(item.ym,92,294,'bold 32px sans-serif');
  text('지점 번호',504,256,'24px sans-serif','#64748b');
  text('#'+item.storeId,504,294,'bold 32px sans-serif');
  text('직원',800,256,'24px sans-serif','#64748b');
  text(item.name+' (#'+item.id+')',800,294,'bold 30px sans-serif');
  const fields=[
   ['기본급',item.base],['주휴수당',item.juhyu],['야간수당',item.night],
   ['휴게 관련 수당',item.breakPay],['대타수당',item.sub],['급여 조정액',item.adj]
  ];
  let y=402;
  for(let i=0;i<fields.length;i++){
   c.fillStyle=i%2?'#ffffff':'#f3f7fa';c.fillRect(88,y,1064,70);
   text(fields[i][0],112,y+20,'27px sans-serif');
   text((fields[i][1]<0?'-':'')+won(Math.abs(fields[i][1])),830,y+18,'bold 29px sans-serif');
   y+=70;
  }
  c.fillStyle=navy;c.fillRect(88,y+12,1064,82);
  text('세전 급여 합계',116,y+31,'bold 29px sans-serif','#ffffff');
  text(won(item.gross),822,y+26,'bold 35px sans-serif','#ffffff');
  y+=134;
  if(item.deductions){
   text('검증된 공제 내역',95,y+5,'bold 29px sans-serif');
   y+=60;
   const deductions=[
    ['국민연금',item.deductions.pension],['건강보험',item.deductions.health],
    ['장기요양보험',item.deductions.longtermCare],['고용보험',item.deductions.employment],
    ['소득세',item.deductions.incomeTax],['지방소득세',item.deductions.localIncomeTax],
    ['기타 확정 공제',item.deductions.other]
   ];
   deductions.forEach((row,i)=>{text(row[0],116,y+i*43,'23px sans-serif');text(won(row[1]),838,y+i*43,'23px sans-serif');});
   y+=deductions.length*43+16;
   text('검증된 공제 후 지급액: '+won(item.net),108,y,'bold 30px sans-serif');
  }else{
   text('공제·4대보험·간이세액표 적용 여부: 확인 전',102,y+5,'bold 27px sans-serif','#92400e');
   text('참고 세후액: '+won(item.net)+' (확정 지급액 아님)',102,y+62,'25px sans-serif');
   text('개인별 보험자격·원천세액이 검증되기 전에는 지급에 사용하지 마세요.',102,y+118,'22px sans-serif','#b45309');
  }
  if(item.delta!==0)text('미분류 급여 구성액 '+won(Math.abs(item.delta))+' · 검토 필요',102,1490,'23px sans-serif','#b45309');
  c.fillStyle='#e2e8f0';c.fillRect(88,1592,1064,2);
  text('기존 백억커피 서버 급여 산출값 사용 · 원천 근태/계약/지점 데이터 변경 없음',90,1622,'20px sans-serif','#64748b');
  text(item.final?'검증된 공제 내역이 포함된 출력본':'[미마감 검토본] 직원 지급·원천세 신고의 확정 증빙으로 사용 불가',90,1665,'bold 20px sans-serif',item.final?'#166534':'#92400e');
  return canvas;
 }
 function jpegFromCanvas(canvas){
  const url=canvas.toDataURL('image/jpeg',0.85);
  if(!url.startsWith('data:image/jpeg;base64,'))err('CANVAS_JPEG_INVALID');
  const raw=atob(url.slice(url.indexOf(',')+1)),a=new Uint8Array(raw.length);
  for(let i=0;i<raw.length;i++)a[i]=raw.charCodeAt(i);
  return a;
 }
 function workbook(xlsx,plan){
  if(!xlsx?.utils?.book_new||!xlsx.utils.aoa_to_sheet||!xlsx.write)err('XLSX_LIBRARY_UNAVAILABLE');
  const table=[['백억커피 '+(plan.final?'검증된 마감':'미마감 검토용')+' 급여 요약'],['지점 번호',plan.storeId,'월',plan.ym],
   ['직원 ID','직원명','기본급','주휴','야간','휴게','대타','조정','세전 합계','참고 세후액','공제 검증']];
  plan.rows.forEach(r=>table.push([r.id,r.name,r.base,r.juhyu,r.night,r.breakPay,r.sub,r.adj,r.gross,r.net,
   r.deductions?'검증':'미확정']));
  table.push(['총합',...Array(7).fill(''),plan.gross]);
  const book=xlsx.utils.book_new(),sheet=xlsx.utils.aoa_to_sheet(table);
  sheet['!cols']=[{wch:14},{wch:22},...Array(9).fill({wch:16})];
  xlsx.utils.book_append_sheet(book,sheet,'월별 급여');
  return bytes(xlsx.write(book,{bookType:'xlsx',type:'array'}));
 }
 async function exportPayroll(rows,context){
  const plan=prepare(rows,context);
  const fileName='백억커피_지점'+plan.storeId+'_'+plan.ym+'_'+(plan.final?'검증된마감':'미마감검토')+'_급여명세서.zip';
  let handle=null;
  if(typeof window!=='undefined'&&typeof window.showSaveFilePicker==='function'){
   try{handle=await window.showSaveFilePicker({suggestedName:fileName,
    types:[{description:'ZIP',accept:{'application/zip':['.zip']}}]});}
   catch(e){if(e?.name==='AbortError')return {cancelled:true};throw e;}
  }
  const files=[{name:'월별급여집계_'+plan.ym+'.xlsx',bytes:workbook(context.xlsx,plan)}];
  const canvas=document.createElement('canvas');
  for(const item of plan.rows){
   renderPage(item,canvas);
   const jpeg=jpegFromCanvas(canvas);
   files.push({name:plan.ym+'_'+item.id+'_'+item.name+'_'+(plan.final?'마감':'검토')+'.pdf',
    bytes:makePdfFromJpeg(jpeg,canvas.width,canvas.height)});
   // Large employee batches should not freeze iPhone Safari's UI event loop.
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  const zip=makeZip(files),blob=new Blob([zip],{type:'application/zip'});
  if(handle){
   const out=await handle.createWritable();
   try{await out.write(blob);await out.close();}
   catch(e){try{await out.abort();}catch(_){}throw e;}
  }else{
   const url=URL.createObjectURL(blob),link=document.createElement('a');
   link.href=url;link.download=fileName;document.body.appendChild(link);link.click();link.remove();
   setTimeout(()=>URL.revokeObjectURL(url),60000);
  }
  return {status:'DOWNLOADED',pdfCount:plan.rows.length,monthlyXlsx:1,
    final:plan.final,gross:plan.gross,size:zip.length};
 }
 return {prepare,makePdfFromJpeg,makeZip,exportPayroll,renderPage};
});
