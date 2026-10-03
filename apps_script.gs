/**
 * M8.7 백억커피 근태·급여 리포트 — Google Apps Script 웹앱
 *
 * 배포: Apps Script 편집기 → 배포 → 새 배포 → 웹앱
 *   - 실행: 나(스크립트 소유자)
 *   - 액세스: 나만 (Edge Function이 SHARED_SECRET으로 호출하므로 링크 공개 불필요)
 *   → 웹앱 URL을 Supabase Edge Function secret(SHEET_WEBAPP_URL)에 등록
 *
 * 원칙:
 *  - DB→Sheet 단방향. 이 스크립트는 받은 payload를 그대로 기록만 함(계산 안 함).
 *  - 연도별 파일("2026 근태") + 1월~12월 탭. 한 달의 근태/세션/급여를 한 탭에 기록.
 *  - 기존 근태-YYYY-MM/세션-YYYY-MM/급여-YYYY-MM 탭은 연간 구조 초기화 시 제거.
 *  - payload 검증 실패 시 기존 시트를 건드리지 않고 에러 반환.
 */

var SHARED_SECRET = 'REPLACE_WITH_LONG_RANDOM_SECRET'; // Edge Function과 동일 값

function doPost(e){
  try{
    var body = JSON.parse(e.postData.contents);
    if(body.secret !== SHARED_SECRET){
      return _json({ok:false, error:'UNAUTHORIZED'});
    }
    // payload 기본 검증 (반쯤 지우는 사고 방지)
    if(!body.ym || !/^\d{4}-\d{2}$/.test(body.ym)) return _json({ok:false, error:'BAD_YM'});
    if(!body.attendance || !body.sessions || !body.payroll) return _json({ok:false, error:'MISSING_SECTIONS'});
    if(!Array.isArray(body.attendance.rows) || !Array.isArray(body.sessions.rows) || !Array.isArray(body.payroll.rows)){
      return _json({ok:false, error:'BAD_ROWS'});
    }

    var parts = body.ym.split('-');
    var year = Number(parts[0]);
    var month = Number(parts[1]);
    var storeKey = String(body.store_key || 'INHA').replace(/[^A-Za-z0-9_-]/g,'_');
    var ss = _annualBook(storeKey, year);
    var meta = '마지막 동기화: ' + body.synced_at + '   |   상태: ' + body.status_label;

    var writeResult = _writeMonth(ss, month + '월', meta, body.attendance, body.sessions, body.payroll);

    return _json({ok:true, ym:body.ym,
      spreadsheet_id:ss.getId(), spreadsheet_url:ss.getUrl(), spreadsheet_name:ss.getName(),
      counts:{attendance:body.attendance.rows.length, sessions:body.sessions.rows.length, payroll:body.payroll.rows.length},
      sheet_format:writeResult});
  }catch(err){
    return _json({ok:false, error:String(err)});
  }
}

/**
 * 안전한 탭 교체:
 *  1) 대상 시트 확보(없으면 생성)
 *  2) 새 값 2차원 배열 구성 (metadata행 + 헤더 + 데이터)
 *  3) 배열이 유효할 때만 clearContents 후 setValues (부분 실패 최소화)
 */
function _annualBook(storeKey, year){
  var props = PropertiesService.getScriptProperties();
  var propKey = 'ATTENDANCE_BOOK_' + storeKey + '_' + year;
  var known = props.getProperty(propKey);
  var ss = null;
  if(known){
    try{ ss = SpreadsheetApp.openById(known); }catch(openErr){ props.deleteProperty(propKey); }
  }
  if(!ss){
    var active = SpreadsheetApp.getActiveSpreadsheet();
    var all = props.getProperties();
    var activeAlreadyUsed = Object.keys(all).some(function(k){ return k.indexOf('ATTENDANCE_BOOK_')===0 && all[k]===active.getId(); });
    if(!activeAlreadyUsed){
      ss = active;
    }else{
      ss = SpreadsheetApp.create(year + ' 근태');
      try{
        var activeFile = DriveApp.getFileById(active.getId());
        var parents = activeFile.getParents();
        if(parents.hasNext()) DriveApp.getFileById(ss.getId()).moveTo(parents.next());
      }catch(moveErr){ /* 폴더 이동 실패 시 생성 위치 유지 */ }
    }
    props.setProperty(propKey, ss.getId());
  }
  if(ss.getName() !== year + ' 근태') DriveApp.getFileById(ss.getId()).setName(year + ' 근태');
  _ensureMonthTabs(ss);
  return ss;
}

function _ensureMonthTabs(ss){
  var keep = {};
  for(var m=1;m<=12;m++){
    var name=m+'월'; keep[name]=true;
    if(!ss.getSheetByName(name)) ss.insertSheet(name);
  }
  ss.getSheets().forEach(function(sh){
    if(!keep[sh.getName()]) ss.deleteSheet(sh);
  });
  for(var i=1;i<=12;i++){
    var target=ss.getSheetByName(i+'월');
    ss.setActiveSheet(target);
    ss.moveActiveSheet(i);
  }
}

function _writeMonth(ss, name, meta, attendance, sessions, payroll){
  var sh = ss.getSheetByName(name);
  if(!sh) sh = ss.insertSheet(name);

  var monthNum = Number(String(name).replace(/[^0-9]/g,'')) || 0;
  var yearMatch = String(ss.getName()).match(/(20\\d{2})/);
  var yearLabel = yearMatch ? yearMatch[1] : '';
  var reportTitle = (yearLabel ? yearLabel + '년 ' : '') + monthNum + '월 근태 · 급여 보고서';
  var sections = [
    {title:'1. 근태 현황',data:attendance},
    {title:'2. 세션 상세',data:sessions},
    {title:'3. 급여 집계',data:payroll}
  ];
  var width = 1;
  sections.forEach(function(s){ width=Math.max(width,s.data.header.length); });

  var out = [[reportTitle],[meta],[]];
  var sectionRows=[], headerRows=[], dataRanges=[];
  sections.forEach(function(section){
    var titleRow = out.length + 1;
    sectionRows.push(titleRow);
    out.push([section.title]);
    var headerRow = out.length + 1;
    headerRows.push(headerRow);
    out.push(section.data.header);
    var firstDataRow = out.length + 1;
    for(var i=0;i<section.data.rows.length;i++) out.push(section.data.rows[i]);
    var lastDataRow = out.length;
    dataRanges.push({first:firstDataRow,last:lastDataRow,count:section.data.rows.length});
    out.push([]);
  });
  for(var r=0;r<out.length;r++){
    while(out[r].length < width) out[r].push('');
    if(out[r].length > width) out[r] = out[r].slice(0,width);
  }

  // A sync owns both values and presentation. Rebuild from a clean visual state so
  // manual/legacy formatting cannot accumulate or shift as row counts change.
  sh.clear();
  sh.getRange(1,1,out.length,width).setValues(out);
  sh.setHiddenGridlines(true);

  var all = sh.getRange(1,1,out.length,width);
  all.setFontFamily('Arial').setFontSize(10).setFontColor('#202622')
    .setBackground('#ffffff').setVerticalAlignment('middle');

  // Report masthead: only values already present in the sync payload are shown.
  sh.getRange(1,1,1,width).merge().setFontSize(18).setFontWeight('bold')
    .setFontColor('#1f6f43').setBackground('#f7faf8').setHorizontalAlignment('left');
  sh.getRange(2,1,1,width).merge().setFontSize(10).setFontColor('#68736c')
    .setBackground('#f7faf8').setHorizontalAlignment('left');
  sh.setRowHeight(1,44); sh.setRowHeight(2,28); sh.setRowHeight(3,14);

  sections.forEach(function(section,idx){
    var titleRow=sectionRows[idx], headerRow=headerRows[idx], dr=dataRanges[idx];
    sh.getRange(titleRow,1,1,width).setBackground('#1f6f43').setFontColor('#ffffff')
      .setFontSize(12).setFontWeight('bold').setHorizontalAlignment('left');
    sh.setRowHeight(titleRow,34);
    sh.getRange(headerRow,1,1,width).setBackground('#dfeee4').setFontColor('#244b34')
      .setFontWeight('bold').setHorizontalAlignment('center');
    sh.setRowHeight(headerRow,30);
    if(dr.count>0){
      var body=sh.getRange(dr.first,1,dr.count,width);
      body.setBackground('#ffffff').setBorder(false,false,true,false,false,false,'#e3e9e5',SpreadsheetApp.BorderStyle.SOLID);
      for(var rr=dr.first;rr<=dr.last;rr++) sh.setRowHeight(rr,28);
    }
    sh.setRowHeight(dr.last+1,16);
  });

  // Semantic emphasis uses only values that actually exist; no synthetic role/store/KPI data.
  var statusCol = attendance.header.indexOf('상태') + 1;
  if(statusCol>0 && dataRanges[0].count>0){
    sh.getRange(dataRanges[0].first,statusCol,dataRanges[0].count,1)
      .setBackground('#edf7f0').setFontColor('#17663b').setFontWeight('bold').setHorizontalAlignment('center');
  }
  var grossCol = payroll.header.indexOf('예상 세전급여') + 1;
  if(grossCol<=0) grossCol = payroll.header.indexOf('확정 세전급여') + 1;
  if(grossCol>0 && dataRanges[2].count>0){
    sh.getRange(dataRanges[2].first,grossCol,dataRanges[2].count,1)
      .setBackground('#edf7f0').setFontColor('#17663b').setFontWeight('bold');
  }
  var payStatusCol = payroll.header.indexOf('상태') + 1;
  if(payStatusCol>0 && dataRanges[2].count>0){
    sh.getRange(dataRanges[2].first,payStatusCol,dataRanges[2].count,1)
      .setBackground('#fff6d8').setFontColor('#755500').setFontWeight('bold').setHorizontalAlignment('center');
  }

  // Keep the report masthead + first section header visible while scrolling.
  sh.setFrozenRows(headerRows[0]);

  // Content-driven sizing is mandatory after all values/styles are committed.
  SpreadsheetApp.flush();
  sh.autoResizeColumns(1,width);
  SpreadsheetApp.flush();

  return {
    column_resize_applied:true,
    resize_scope:'all_used_columns_after_write',
    width_source:'actual_cell_contents',
    resized_columns:width,
    report_design_applied:true,
    report_design_version:'sheet-report-v1'
  };
}

function _json(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
