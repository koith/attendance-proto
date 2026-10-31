/**
 * #1435: 월말 검토용 → 마감 후 확정본 메일 (독립 Apps Script 프로젝트).
 * 수신자: 매 발송 직전 Supabase store_primary_owners → admin_users → auth.users 에서 조회.
 * 이 스크립트에는 수신 이메일 주소를 저장하지 않습니다.
 *
 * 기본 OFF. 실점주 발송은 수신/발신 OAuth 승인, 격리 QA, 시트 매핑 검증 후 활성화.
 * Script Properties:
 * MONTHLY_OWNER_ENABLED: "true"
 * MONTHLY_OWNER_REPORT_TOKEN: 64+ characters, Edge secret와 일치
 * MONTHLY_OWNER_START_YM: "2026-10", 과거월 자동 발송 방지
 * MONTHLY_OWNER_WORKBOOKS_JSON: {"1":{"bookId":"<verified annual spreadsheet ID>"}}
 * 수신주소/급여액/비밀키를 소스·로그에 작성하지 않습니다.
 */
var MONTHLY_REPORT_URL='https://waluhdgqhwjjwmflhrle.supabase.co/functions/v1/monthly-owner-report';
var MONTHLY_TZ='Asia/Seoul';
function _monthlyProps_(){return PropertiesService.getScriptProperties();}
function _monthlyNowParts_(now){
  var stamp=Utilities.formatDate(now||new Date(),MONTHLY_TZ,'yyyy-MM-dd HH:mm');
  var p=stamp.slice(0,10).split('-').map(Number);
  return {year:p[0],month:p[1],day:p[2],ym:stamp.slice(0,7),hour:Number(stamp.slice(11,13)),minute:Number(stamp.slice(14,16))};
}
function _monthlyMonthBefore_(year,month){return month===1?(year-1)+'-12':year+'-'+('0'+(month-1)).slice(-2);}
function _monthlyIsLast_(parts){return new Date(Date.UTC(parts.year,parts.month-1,parts.day+1)).getUTCMonth()!==parts.month-1;}
function _monthlyCandidates_(now){
  var p=_monthlyNowParts_(now);
  var previous=_monthlyMonthBefore_(p.year,p.month);
  var result=[{ym:previous,kind:'FINAL'},{ym:previous,kind:'PREVIEW'}];
  if(_monthlyIsLast_(p)&&p.hour===23&&p.minute>=30)
    result.unshift({ym:p.ym,kind:'PREVIEW'});
  return result;
}
function _monthlyName_(value){
  return String(value||'').replace(/[\r\n\t\\\/:*?"<>|]/g,' ').replace(/\s+/g,' ').trim().slice(0,80);
}

function _monthlyBooks_(){
  var raw=_monthlyProps_().getProperty('MONTHLY_OWNER_WORKBOOKS_JSON')||'{}';
  var books;
  try{books=JSON.parse(raw);}catch(e){throw Error('WORKBOOK_MAPPING_INVALID');}
  if(!books||typeof books!=='object'||Array.isArray(books))throw Error('WORKBOOK_MAPPING_INVALID');
  return books;
}
function _monthlyConfig_(storeId,store){
  if(!/^[1-9][0-9]{0,8}$/.test(String(storeId)))throw Error('STORE_SCOPE_INVALID');
  if(!store||store.enabled===false||!/^[A-Za-z0-9_-]{25,160}$/.test(String(store.bookId||'')))
    throw Error('BOOK_NOT_CONFIGURED');
  return {storeId:Number(storeId),bookId:store.bookId};
}
function _monthlyPost_(body){
  var secret=_monthlyProps_().getProperty('MONTHLY_OWNER_REPORT_TOKEN')||'';
  if(secret.length<64)throw Error('REPORT_TOKEN_NOT_CONFIGURED');
  var res=UrlFetchApp.fetch(MONTHLY_REPORT_URL,{
    method:'post',contentType:'application/json',
    headers:{'x-monthly-report-token':secret},
    payload:JSON.stringify(body),muteHttpExceptions:true,followRedirects:false
  });
  var data={};try{data=JSON.parse(res.getContentText());}catch(e){throw Error('REPORT_RESPONSE_INVALID');}
  return {code:res.getResponseCode(),data:data};
}
function _monthlyVerifiedOwner_(owner){
  if(!owner||!/^[-a-f0-9]{36}$/i.test(String(owner.user_id||''))||
     !/^[A-Za-z0-9._%+-]+@(gmail\.com|googlemail\.com)$/i.test(String(owner.email||'')))
    throw Error('PRIMARY_OWNER_NOT_VERIFIED');
  return {user_id:owner.user_id,email:String(owner.email).toLowerCase()};
}
function _monthlyFetchReport_(cfg,ym,kind){
  if(!/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(ym))throw Error('BAD_MONTH');
  var result=_monthlyPost_({store_id:cfg.storeId,ym:ym,mode:kind==='FINAL'?'final':'preview'});
  var data=result.data;
  if(result.code===409){
    // Not closed: try PREVIEW; already closed: FINAL will be attempted independently.
    return {skipped:true,reason:String(data.error||'NOT_READY')};
  }
  if(result.code!==200||data.ok!==true)throw Error('REPORT_UNAVAILABLE');
  if(data.store_id!==cfg.storeId||data.ym!==ym||data.mode!==kind||
     (kind==='FINAL'?data.status!=='CLOSED':data.status!=='OPEN')||
     !Array.isArray(data.rows)||!data.rows.length||data.rows.length!==data.count||
     !/^[0-9a-f]{64}$/.test(String(data.source_fingerprint||''))||
     !data.totals||!Number.isSafeInteger(data.totals.gross)||
     !Number.isSafeInteger(data.totals.net))throw Error('REPORT_SCOPE_MISMATCH');
  _monthlyVerifiedOwner_(data.owner);
  if(typeof data.store_name!=='string'||!data.store_name.trim())throw Error('STORE_NAME_MISSING');
  return data;
}
function _monthlyCheckOwner_(cfg,ym,expected){
  var result=_monthlyPost_({store_id:cfg.storeId,ym:ym,mode:'owner_check'});
  if(result.code!==200||result.data?.ok!==true||
     result.data.store_id!==cfg.storeId||result.data.ym!==ym)throw Error('OWNER_REFRESH_FAILED');
  var current=_monthlyVerifiedOwner_(result.data.owner);
  if(current.user_id!==expected.user_id||current.email!==expected.email)
    throw Error('PRIMARY_OWNER_CHANGED_RETRY');
  return current;
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

function _monthlySheet_(cfg,ym,report){
  var book=SpreadsheetApp.openById(cfg.bookId);
  if(book.getName()!==ym.slice(0,4)+' 근태')throw Error('BOOK_YEAR_MISMATCH');
  var month=Number(ym.slice(5,7)),sheet=book.getSheetByName(month+'월');
  if(!sheet)throw Error('MONTH_TAB_MISSING');
  var rows=sheet.getDataRange().getDisplayValues();
  if(rows.length<5||String(rows[0][0]||'').indexOf(ym.slice(0,4)+'년')<0||
     String(rows[0][0]||'').indexOf(month+'월')<0)throw Error('MONTH_TAB_SCOPE_MISMATCH');
  var meta=String(rows[1][0]||'');
  if(report.mode==='FINAL'?!meta.includes('상태: 마감완료'):!meta.includes('상태: 예상 · 미마감'))
    throw Error('SHEET_STATE_MISMATCH');
  var title=rows.findIndex(r=>String(r[0]||'').trim()==='급여 집계');
  if(title<0)throw Error('SHEET_NO_PAYROLL');
  var header=(rows[title+1]||[]).map(x=>String(x||'').trim()),
      employeeColumn=header.indexOf('직원명'),
      amountColumn=header.indexOf(report.mode==='FINAL'?'확정 세전급여':'예상 세전급여');
  if(employeeColumn<0||amountColumn<0)throw Error('SHEET_GROSS_HEADER_MISSING');
  var sheetByName={},total=0,count=0;
  for(var i=title+2;i<rows.length;i++){
    var row=rows[i],name=String(row[employeeColumn]||'').trim();
    if(!name)break;
    if(name.toUpperCase()==='TEST'||sheetByName[name]!==undefined)
      throw Error('SHEET_EMPLOYEE_AMBIGUOUS');
    var value=_monthlyNumericCell_(row[amountColumn]);
    sheetByName[name]=value;total+=value;count++;
  }
  var complete=report.mode==='FINAL'?report.rows:report.rows.filter(r=>r.complete_pay===true);
  if(count!==complete.length||total!==report.totals.gross)throw Error('SHEET_PAYROLL_STALE');
  complete.forEach(function(r){
    if(sheetByName[String(r.employee_name||'').trim()]!==r.gross_pay)
      throw Error('SHEET_EMPLOYEE_SALARY_MISMATCH');
  });
  return sheet;
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

function _monthlyStatement_(row,cfg,ym,report){
  var name=_monthlyName_(row.employee_name);
  if(!name||name.toUpperCase()==='TEST'||!Number.isSafeInteger(row.employee_id))
    throw Error('EMPLOYEE_INVALID');
  var final=report.mode==='FINAL',complete=final||row.complete_pay===true;
  var document=DocumentApp.create('TEMP_OWNER_REPORT_'+cfg.storeId+'_'+ym+'_'+row.employee_id);
  try{
    var body=document.getBody();
    body.appendParagraph('백억커피  |  '+(final?'확정 급여명세서':'급여 검토용 명세서'))
      .setHeading(DocumentApp.ParagraphHeading.HEADING1);
    body.appendParagraph('지점: '+report.store_name+'  |  대상월: '+ym);
    body.appendParagraph('직원: '+name+'  |  직원 ID: '+row.employee_id);
    body.appendParagraph('상태: '+(final?'급여 마감 완료':'미마감 · 검토용 · 확정액 아님'));
    if(!final){
      body.appendParagraph('자료 생성 기준: '+String(report.as_of||'').slice(0,19)+' UTC');
      body.appendParagraph('말일 이후 근무·정정·수당 승인에 따라 금액이 변경될 수 있습니다.');
    }
    var flags=Array.isArray(row.review_flags)?row.review_flags:[];
    if(flags.length)body.appendParagraph('확인 필요: '+flags.join(' / '));
    if(complete){
      var lines=[
        ['항목','금액 또는 내용'],
        ['기본급',_monthlyWon_(row.base_pay)],
        ['주휴수당',_monthlyWon_(row.juhyu_pay)],
        ['야간수당',row.night_allowance_won==null?'내역 확인 필요':_monthlyWon_(row.night_allowance_won)],
        ['휴게수당',row.break_compensation_won==null?'내역 확인 필요':_monthlyWon_(row.break_compensation_won)],
        ['대타수당',row.substitution_pay_won==null?'내역 확인 필요':_monthlyWon_(row.substitution_pay_won)],
        ['조정액',_monthlyWon_(row.adjust)],
        ['세전 총액',_monthlyWon_(row.gross_pay)],
        ['공제 총액',_monthlyWon_(row.gross_pay-row.net_pay)],
        ['세후 지급예정',_monthlyWon_(row.net_pay)],
        ['근무시간',String(row.hours)+'시간']
      ];
      var table=body.appendTable(lines);
      table.getRow(0).getCell(0).editAsText().setBold(true);
      table.getRow(0).getCell(1).editAsText().setBold(true);
    }else{
      body.appendParagraph('급여 산정 확인 필요: 미확정 금액을 임의로 0원으로 표시하지 않습니다.');
    }
    body.appendParagraph('급여 계산 검토 자료입니다. 공제 상세 항목 및 실제 급여 지급일은 별도 확인해야 하며, 송금 완료 증빙이 아닙니다.');
    document.saveAndClose();
    return DriveApp.getFileById(document.getId()).getAs(MimeType.PDF).setName(
      _monthlyName_(ym+'_'+(final?'확정':'검토용')+'_급여명세서_'+name+'_'+row.employee_id)+'.pdf');
  }finally{DriveApp.getFileById(document.getId()).setTrashed(true);}
}
function _monthlyDispatchKey_(cfg,ym,kind){return 'MONTHLY_SENT_'+kind+'_'+cfg.storeId+'_'+ym.replace('-','');}
function _monthlySendOne_(storeId,ym,kind,store,previewOnly){
  var props=_monthlyProps_(),start=props.getProperty('MONTHLY_OWNER_START_YM')||'';
  if(!/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(start))throw Error('START_MONTH_REQUIRED');
  if(ym<start)return {storeId:Number(storeId),ym:ym,kind:kind,status:'BEFORE_START'};
  var cfg=_monthlyConfig_(storeId,store);
  var key=_monthlyDispatchKey_(cfg,ym,kind),sent=props.getProperty(key)||'';
  if(sent)return {storeId:cfg.storeId,ym,kind,status:sent==='SENT'?'SENT':'REVIEW_REQUIRED'};
  var report=_monthlyFetchReport_(cfg,ym,kind);
  if(report.skipped)return {storeId:cfg.storeId,ym,kind,status:'PENDING',reason:report.reason};
  var sheet=_monthlySheet_(cfg,ym,report);
  if(previewOnly)return {storeId:cfg.storeId,ym,kind,status:'PREVIEW_OK',
    employee_count:report.rows.length,attachment_count:report.rows.length+1};
  var attachments=[_monthlyExcel_(sheet,cfg,ym)];
  report.rows.forEach(function(row){attachments.push(_monthlyStatement_(row,cfg,ym,report));});
  var bytes=attachments.reduce(function(sum,b){return sum+b.getBytes().length;},0);
  if(bytes>18*1024*1024||attachments.length>101)throw Error('ATTACHMENTS_LIMIT_EXCEEDED');
  if(MailApp.getRemainingDailyQuota()<1)throw Error('MAIL_QUOTA_EXHAUSTED');
  // Current actual primary owner must be checked immediately before sending.
  var owner=_monthlyCheckOwner_(cfg,ym,_monthlyVerifiedOwner_(report.owner));
  var title=kind==='FINAL'?'[확정본]':'[검토용·미마감]';
  var subject='[백억커피] '+title+' '+report.store_name+' '+ym+' 근태·급여 자료';
  var message=report.store_name+' '+ym+' 자료를 전달합니다.\n\n'+
    (kind==='FINAL'?'급여 마감이 완료된 확정본입니다.':'미마감 검토용입니다. 출퇴근 누락·근무중·계약·수당 등의 확인이 필요하며 마감 전에 앱에서 수정할 수 있습니다.')+
    '\n\n첨부: 해당월 근태·급여 엑셀 1개 / 직원별 PDF '+report.rows.length+'개'+
    (report.review_count?'\n확인 필요 직원 수: '+report.review_count+'명':'')+
    '\n\n급여 정보가 담긴 파일이므로 외부 공유에 주의해 주세요.';
  props.setProperty(key,'SENDING');
  try{
    MailApp.sendEmail({to:owner.email,subject:subject,body:message,
      attachments:attachments,name:'백억커피 운영'});
    props.setProperty(key,'SENT');
    return {storeId:cfg.storeId,ym,kind,status:'SENT',employee_count:report.rows.length};
  }catch(e){
    // Never resend automatically if MailApp may have accepted the message.
    props.setProperty(key,'UNCERTAIN');
    throw Error('MAIL_SEND_UNCERTAIN');
  }
}
function monthlyOwnerDigestTick(){
  var props=_monthlyProps_();
  if(props.getProperty('MONTHLY_OWNER_ENABLED')!=='true')return [{status:'DISABLED'}];
  var candidates=_monthlyCandidates_(new Date()),books=_monthlyBooks_(),ids=Object.keys(books).sort((a,b)=>Number(a)-Number(b));
  if(!ids.length)return [{status:'NO_WORKBOOKS'}];
  var lock=LockService.getScriptLock();
  if(!lock.tryLock(3000))return [{status:'BUSY'}];
  try{
    // Rotating cursor: larger franchise lists do not exceed an Apps Script execution window.
    var cursor=Number(props.getProperty('MONTHLY_OWNER_CURSOR')||'0');
    if(!Number.isSafeInteger(cursor)||cursor<0)cursor=0;
    var cap=Math.min(5,ids.length),results=[];
    for(var i=0;i<cap;i++){
      var id=ids[(cursor+i)%ids.length];
      for(var j=0;j<candidates.length;j++){
        var c=candidates[j];
        try{
          var result=_monthlySendOne_(id,c.ym,c.kind,books[id],false);
          results.push(result);
          if(result.status==='SENT'||result.status==='REVIEW_REQUIRED')break;
        }catch(e){results.push({storeId:Number(id),ym:c.ym,kind:c.kind,status:'ERROR',
          reason:String(e.message||e).slice(0,80)});}
      }
    }
    props.setProperty('MONTHLY_OWNER_CURSOR',String((cursor+cap)%ids.length));
    return results;
  }finally{lock.releaseLock();}
}
function monthlyOwnerPreview(){
  var candidates=_monthlyCandidates_(new Date()),books=_monthlyBooks_(),out=[];
  Object.keys(books).forEach(function(id){
    candidates.forEach(function(c){
      try{out.push(_monthlySendOne_(id,c.ym,c.kind,books[id],true));}
      catch(e){out.push({storeId:Number(id),ym:c.ym,kind:c.kind,status:'ERROR',reason:String(e.message||e).slice(0,80)});}
    });
  });
  return out; // Never send or create temporary files.
}
function installMonthlyOwnerTrigger(){
  if(_monthlyProps_().getProperty('MONTHLY_OWNER_ENABLED')!=='true')
    throw Error('OWNER_DELIVERY_DISABLED');
  if(!_monthlyProps_().getProperty('MONTHLY_OWNER_START_YM'))throw Error('START_MONTH_REQUIRED');
  if(ScriptApp.getProjectTriggers().some(function(t){return t.getHandlerFunction()==='monthlyOwnerDigestTick';}))
    return {status:'ALREADY_INSTALLED'};
  ScriptApp.newTrigger('monthlyOwnerDigestTick').timeBased().everyMinutes(15).create();
  return {status:'INSTALLED'};
}
