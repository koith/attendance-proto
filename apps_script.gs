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

  var sections = [
    {title:'근태',data:attendance},
    {title:'세션 상세',data:sessions},
    {title:'급여',data:payroll}
  ];
  var width = 1;
  sections.forEach(function(s){ width=Math.max(width,s.data.header.length); });
  var out = [];
  var headerRows=[];
  out.push([meta]); out.push([]);
  sections.forEach(function(section){
    out.push([section.title]);
    headerRows.push(out.length+1);
    out.push(section.data.header);
    for(var i=0;i<section.data.rows.length;i++) out.push(section.data.rows[i]);
    out.push([]);
  });
  for(var r=0;r<out.length;r++){
    while(out[r].length < width) out[r].push('');
    if(out[r].length > width) out[r] = out[r].slice(0, width);
  }

  // 교체: 기존 내용 지우고 한 번에 쓰기
  sh.clearContents();
  sh.getRange(1, 1, out.length, width).setValues(out);

  sh.getRange(1,1,1,width).setFontColor('#666').setFontSize(10);
    sections.forEach(function(section,idx){
      var titleRow=headerRows[idx]-1;
      sh.getRange(titleRow,1,1,width).setFontWeight('bold').setBackground('#dfeee4');
      sh.getRange(headerRows[idx],1,1,width).setFontWeight('bold').setBackground('#f1f3f5');
    });
  sh.setFrozenRows(1);

  // Commit values/styles before measuring the rendered cell contents.
  // Re-measure every used column on every sync; never use fixed/type-based widths.
  SpreadsheetApp.flush();
  sh.autoResizeColumns(1, width);
  SpreadsheetApp.flush();

  return {
    column_resize_applied: true,
    resize_scope: 'all_used_columns_after_write',
    width_source: 'actual_cell_contents',
    resized_columns: width
  };
}

function _json(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
