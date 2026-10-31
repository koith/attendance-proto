/**
 * 백억커피 월말 점주 Gmail (독립 GAS 프로젝트).
 *
 * 운영 시트/연결된 Apps Script 원본을 변경하지 않습니다.
 * 월별 시트를 XLSX로 내보내고 서버의 CLOSED 급여 스냅샷을 직원별 PDF로 만듭니다.
 * 설치 시점 기본 비활성: MONTHLY_OWNER_ENABLED=true와 검증된 점주 주소가 모두 필요.
 *
 * Script Properties:
 *   MONTHLY_OWNER_ENABLED: true (수신자 승인·격리 수신 QA 후에만)
 *   MONTHLY_OWNER_REPORT_TOKEN: 64+ random chars, Edge MONTHLY_OWNER_REPORT_TOKEN과 일치
 *   MONTHLY_OWNER_STORES_JSON: {"1":{"name":"인하대학교점","gmail":"verified@gmail.com",
 *                           "bookId":"verified_Google_spreadsheet_ID","verified":true,"enabled":true}}
 * 수신 주소·비밀값은 코드에 커밋하지 마세요.
 */
var MONTHLY_REPORT_URL='https://waluhdgqhwjjwmflhrle.supabase.co/functions/v1/monthly-owner-report';
var MONTHLY_TZ='Asia/Seoul';
function _monthlyProps_(){return PropertiesService.getScriptProperties();}
function _monthlyNowParts_(now){
  var stamp=Utilities.formatDate(now||new Date(),MONTHLY_TZ,'yyyy-MM-dd');
  var p=stamp.split('-').map(Number);
  return {year:p[0],month:p[1],day:p[2],ym:stamp.slice(0,7)};
}
function _monthlyMonthBefore_(year,month){return month===1?(year-1)+'-12':year+'-'+('0'+(month-1)).slice(-2);}
function _monthlyIsLast_(parts){return new Date(Date.UTC(parts.year,parts.month-1,parts.day+1)).getUTCMonth()!==parts.month-1;}
function _monthlyEligiblePeriods_(now){
  var p=_monthlyNowParts_(now);
  var result=[_monthlyMonthBefore_(p.year,p.month)];
  if(_monthlyIsLast_(p))result.push(p.ym);
  return result; // Previous month remains eligible after a late payroll close.
}
function _monthlyName_(value){
  return String(value||'').replace(/[\r\n\t\\\/:*?"<>|]/g,' ').replace(/\s+/g,' ').trim().slice(0,80);
}
function _monthlyStores_(){
  var raw=_monthlyProps_().getProperty('MONTHLY_OWNER_STORES_JSON');
  var data={};try{data=JSON.parse(raw||'{}');}catch(e){throw Error('STORE_CONFIG_MALFORMED');}
  if(!data||typeof data!=='object'||Array.isArray(data))throw Error('STORE_CONFIG_MALFORMED');
  return data;
}
function _monthlyConfig_(storeId,store){
  if(!/^[1-9][0-9]{0,8}$/.test(String(storeId)))throw Error('STORE_SCOPE_INVALID');
  if(!store||store.enabled!==true||store.verified!==true)throw Error('OWNER_NOT_VERIFIED');
  if(!/^[A-Za-z0-9._%+-]+@(?:gmail\.com|googlemail\.com)$/i.test(String(store.gmail||'')))
    throw Error('OWNER_GMAIL_NOT_VERIFIED');
  if(!/^[A-Za-z0-9_-]{25,160}$/.test(String(store.bookId||'')))throw Error('BOOK_NOT_CONFIGURED');
  if(!_monthlyName_(store.name))throw Error('STORE_NAME_MISSING');
  return {storeId:Number(storeId),gmail:String(store.gmail).toLowerCase(),bookId:store.bookId,name:_monthlyName_(store.name)};
}
function _monthlyFetchSnapshot_(cfg,ym){
  var secret=_monthlyProps_().getProperty('MONTHLY_OWNER_REPORT_TOKEN')||'';
  if(secret.length<64)throw Error('REPORT_TOKEN_MISSING');
  if(!/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(ym))throw Error('BAD_PERIOD');
  var response=UrlFetchApp.fetch(MONTHLY_REPORT_URL,{
    method:'post',contentType:'application/json',
    headers:{'x-monthly-report-token':secret},
    payload:JSON.stringify({store_id:cfg.storeId,ym:ym}),
    muteHttpExceptions:true,followRedirects:false
  });
  var status=response.getResponseCode(),data={};
  try{data=JSON.parse(response.getContentText());}catch(e){throw Error('REPORT_RESPONSE_INVALID');}
  if(status!==200||data.ok!==true){
    if(status===409)return {skipped:true,reason:String(data.error||'NOT_FINAL')};
    throw Error('REPORT_SERVICE_UNAVAILABLE');
  }
  if(data.store_id!==cfg.storeId||data.ym!==ym||data.status!=='CLOSED'||
     data.store_name!==cfg.name||!Array.isArray(data.rows)||
     data.rows.length!==data.count||data.rows.length===0||
     !/^[0-9a-f]{64}$/.test(String(data.source_fingerprint||'')))
    throw Error('REPORT_SCOPE_MISMATCH');
  return data;
}
function _monthlyWon_(v){
  if(typeof v!=='number'||!isFinite(v)||Math.floor(v)!==v||Math.abs(v)>9000000000000)
    throw Error('INVALID_MONEY');
  return v.toLocaleString('ko-KR')+'원';
}
function _monthlyNumericCell_(s){
  var t=String(s==null?'':s).trim().replace(/,/g,'').replace(/원$/,'').trim();
  if(!/^-?\d+$/.test(t))throw Error('SHEET_GROSS_INVALID');
  var n=Number(t);
  if(!Number.isSafeInteger(n))throw Error('SHEET_GROSS_INVALID');
  return n;
}
function _monthlySheet_(cfg,ym,snapshot){
  var ss=SpreadsheetApp.openById(cfg.bookId);
  var expectedYear=ym.slice(0,4);
  if(ss.getName()!==expectedYear+' 근태')throw Error('BOOK_YEAR_MISMATCH');
  var sh=ss.getSheetByName(String(Number(ym.slice(5,7)))+'월');
  if(!sh)throw Error('MONTH_TAB_MISSING');
  var rows=sh.getDataRange().getDisplayValues();
  if(rows.length<6||String(rows[0][0]||'').indexOf(expectedYear+'년')<0||
     String(rows[0][0]||'').indexOf(Number(ym.slice(5,7))+'월')<0)
     throw Error('MONTH_TAB_WRONG');
  if(!String(rows[1][0]||'').includes('상태: 마감완료'))throw Error('SHEET_NOT_SYNCED_CLOSED');
  var heading=rows.findIndex(r=>String(r[0]||'').trim()==='급여 집계');
  if(heading<0||heading+1>=rows.length)throw Error('SHEET_PAYROLL_MISSING');
  var header=rows[heading+1].map(v=>String(v).trim());
  var nameIndex=header.indexOf('직원명'),grossIndex=header.indexOf('확정 세전급여');
  if(nameIndex<0||grossIndex<0)throw Error('SHEET_PAYROLL_UNFINALIZED');
  var byName={},gross=0,count=0;
  for(var i=heading+2;i<rows.length;i++){
    var row=rows[i];
    if(!String(row[nameIndex]||'').trim())break;
    var name=String(row[nameIndex]).trim();
    if(name.toUpperCase()==='TEST'||byName[name])throw Error('SHEET_EMPLOYEE_NAME_AMBIGUOUS');
    byName[name]=true;gross+=_monthlyNumericCell_(row[grossIndex]);count++;
  }
  if(count!==snapshot.rows.length||gross!==snapshot.totals.gross)throw Error('SHEET_SNAPSHOT_TOTAL_MISMATCH');
  for(var j=0;j<snapshot.rows.length;j++){
    var r=snapshot.rows[j];
    if(!byName[String(r.employee_name||'').trim()])throw Error('SHEET_SNAPSHOT_EMPLOYEE_MISMATCH');
  }
  return sh;
}
function _monthlyExcel_(sheet,cfg,ym){
  // Never alter the original yearly workbook: clone only the matching month.
  var temp=SpreadsheetApp.create('TEMP_MONTH_EXPORT_'+cfg.storeId+'_'+ym);
  try{
    var copy=sheet.copyTo(temp);
    temp.getSheets().forEach(function(tab){if(tab.getSheetId()!==copy.getSheetId())temp.deleteSheet(tab);});
    copy.setName(String(Number(ym.slice(5,7)))+'월');
    SpreadsheetApp.flush();
    var mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    var url='https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(temp.getId())+'/export?mimeType='+encodeURIComponent(mime);
    var res=UrlFetchApp.fetch(url,{headers:{Authorization:'Bearer '+ScriptApp.getOAuthToken()},muteHttpExceptions:true});
    if(res.getResponseCode()!==200)throw Error('EXCEL_EXPORT_FAILED');
    var blob=res.getBlob().setName(_monthlyName_(ym+'_'+cfg.name+'_근태급여')+'.xlsx').setContentType(mime);
    if(blob.getBytes().length<100)throw Error('EXCEL_EMPTY');
    return blob;
  }finally{DriveApp.getFileById(temp.getId()).setTrashed(true);}
}
function _monthlyStatement_(item,cfg,ym){
  var name=_monthlyName_(item.employee_name);
  if(!name||name.toUpperCase()==='TEST'||!Number.isSafeInteger(item.employee_id))throw Error('EMPLOYEE_INVALID');
  var base=item.base_pay,weekly=item.juhyu_pay,night=item.night_allowance_won,
      rest=item.break_compensation_won,sub=item.substitution_pay_won,adjust=item.adjust;
  // Historical snapshot component fields may be NULL: do not invent a zero allowance.
  if([night,rest,sub].some(function(x){return x===null||x===undefined;}))throw Error('ALLOWANCE_COMPONENT_MISSING');
  var components=[base,weekly,night,rest,sub,adjust];
  components.forEach(function(v){_monthlyWon_(v);});
  var gross=item.gross_pay,net=item.net_pay;_monthlyWon_(gross);_monthlyWon_(net);
  if(net<0||gross<net||components.reduce(function(a,b){return a+b;},0)!==gross)
    throw Error('PAYROLL_COMPONENT_RECONCILIATION_FAILED');
  var doc=DocumentApp.create('TEMP_PAYSLIP_'+cfg.storeId+'_'+ym+'_'+item.employee_id);
  try{
    var body=doc.getBody();
    body.appendParagraph('백억커피  |  급여명세서').setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph('해당 월: '+ym+'   ·   지점: '+cfg.name);
    body.appendParagraph('직원명: '+name+'   ·   직원번호: '+item.employee_id);
    body.appendParagraph('확정 급여 산정 근거  |  해당 지점 마감 스냅샷');
    var lines=[
      ['항목','금액/내용'],
      ['기본급',_monthlyWon_(base)],
      ['주휴수당',_monthlyWon_(weekly)],
      ['야간수당',_monthlyWon_(night)],
      ['휴게 미제공 보상',_monthlyWon_(rest)],
      ['대타수당',_monthlyWon_(sub)],
      ['조정액',_monthlyWon_(adjust)],
      ['세전 총액',_monthlyWon_(gross)],
      ['공제 총액 (세전-지급예정)',_monthlyWon_(gross-net)],
      ['지급 예정액',_monthlyWon_(net)],
      ['시급',_monthlyWon_(item.wage)],
      ['근무시간',String(item.hours)+'시간']
    ];
    var table=body.appendTable(lines);
    table.getRow(0).editAsText().setBold(true);
    body.appendParagraph('안내: 공제 세부항목·실제 지급일은 별도 급여대장과 확인하세요. 본 자료는 확정 계산 내역을 안내하며 송금 완료 증빙은 아닙니다.');
    doc.saveAndClose();
    var blob=DriveApp.getFileById(doc.getId()).getAs(MimeType.PDF);
    return blob.setName(_monthlyName_(ym+'_급여명세서_'+name+'_'+item.employee_id)+'.pdf');
  }finally{DriveApp.getFileById(doc.getId()).setTrashed(true);}
}
function _monthlySendOne_(storeId,ym,store,preview){
  var cfg=_monthlyConfig_(storeId,store);
  var snapshot=_monthlyFetchSnapshot_(cfg,ym);
  if(snapshot.skipped)return {storeId:cfg.storeId,ym:ym,status:'PENDING',reason:snapshot.reason};
  var sh=_monthlySheet_(cfg,ym,snapshot);
  var key='MONTHLY_SENT_'+cfg.storeId+'_'+ym.replace('-','');
  var props=_monthlyProps_(),was=props.getProperty(key)||'';
  if(was)return {storeId:cfg.storeId,ym:ym,status:was==='SENT'?'SENT':'REVIEW_REQUIRED'};
  if(preview)return {storeId:cfg.storeId,ym:ym,status:'PREVIEW_OK',employee_count:snapshot.rows.length,attachment_count:snapshot.rows.length+1,estimated_gross:snapshot.totals.gross};
  var blobs=[_monthlyExcel_(sh,cfg,ym)];
  snapshot.rows.forEach(function(r){blobs.push(_monthlyStatement_(r,cfg,ym));});
  var bytes=blobs.reduce(function(n,b){return n+b.getBytes().length;},0);
  if(blobs.length>101||bytes>18*1024*1024)throw Error('MAIL_ATTACHMENT_TOO_LARGE');
  if(MailApp.getRemainingDailyQuota()<1)throw Error('MAIL_QUOTA_EXCEEDED');
  var subject='[백억커피] '+cfg.name+' '+ym+' 근태·급여 자료';
  var body=cfg.name+' '+ym+'월 마감 자료입니다.\n\n첨부: 해당 월 근태·급여 Excel 1개, 직원별 급여명세서 PDF '+snapshot.rows.length+'개.\n\n첨부 파일에 직원별 급여 정보가 있으니 안전하게 보관해 주세요.';
  // A crash or ambiguous API error cannot prove that Gmail did NOT accept the message.
  // Do not automatically retry after entering SENDING: the owner must reconcile it.
  props.setProperty(key,'SENDING');
  try{
    MailApp.sendEmail({to:cfg.gmail,subject:subject,body:body,attachments:blobs,name:'백억커피 운영'});
    props.setProperty(key,'SENT');
    return {storeId:cfg.storeId,ym:ym,status:'SENT',employee_count:snapshot.rows.length};
  }catch(e){props.setProperty(key,'UNCERTAIN');throw Error('MAIL_SEND_UNCERTAIN');}
}
function monthlyOwnerDigestTick(){
  if(_monthlyProps_().getProperty('MONTHLY_OWNER_ENABLED')!=='true')return [{status:'DISABLED'}];
  var months=_monthlyEligiblePeriods_(new Date()),stores=_monthlyStores_();
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(5000))return [{status:'BUSY'}];
  try{
    var results=[];
    Object.keys(stores).forEach(function(id){
      if(stores[id].enabled!==true)return;
      months.forEach(function(ym){
        try{results.push(_monthlySendOne_(id,ym,stores[id],false));}
        catch(e){results.push({storeId:Number(id),ym:ym,status:'ERROR',reason:String(e.message).slice(0,80)});}
      });
    });
    return results;
  }finally{lock.releaseLock();}
}
function monthlyOwnerPreview(){
  var months=_monthlyEligiblePeriods_(new Date()),stores=_monthlyStores_(),out=[];
  Object.keys(stores).forEach(function(id){
    if(stores[id].enabled!==true)return;
    months.forEach(function(ym){
      try{out.push(_monthlySendOne_(id,ym,stores[id],true));}
      catch(e){out.push({storeId:Number(id),ym:ym,status:'ERROR',reason:String(e.message).slice(0,80)});}
    });
  });
  return out; // Never sends email or creates a temporary Drive document.
}
function installMonthlyOwnerDailyTrigger(){
  if(_monthlyProps_().getProperty('MONTHLY_OWNER_ENABLED')!=='true')throw Error('MONTHLY_OWNER_NOT_ENABLED');
  var existing=ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='monthlyOwnerDigestTick';});
  if(existing)return {status:'ALREADY_INSTALLED'};
  ScriptApp.newTrigger('monthlyOwnerDigestTick').timeBased().atHour(23).nearMinute(45).everyDays(1).inTimezone(MONTHLY_TZ).create();
  return {status:'INSTALLED'};
}
