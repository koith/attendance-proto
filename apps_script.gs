/**
 * M8.7 백억커피 근태·급여 리포트 — Google Apps Script 웹앱
 * 2026-10-09: redeploy live web app to restore current monthly report layout and sync contract.
 *
 * 배포: Apps Script 편집기 → 배포 → 새 배포 → 웹앱
 *   - 실행: 나(스크립트 소유자)
 *   - 액세스: ANYONE_ANONYMOUS (ANYONE은 로그인 필요; 서버 fetch는 로그인 쿠키가 없음)
 *   - 보안: 요청 본문 SHARED_SECRET 검사 후에만 시트 쓰기 허용
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

function _withoutPayrollStatusColumns(section){
  // Presentation-only: keep the source payroll/snapshot data and closing workflow unchanged.
  var headers=section.header||[];
  var kept=[];
  headers.forEach(function(h,i){if(h!=='상태'&&h!=='마감')kept.push(i);});
  return {
    header:kept.map(function(i){return headers[i];}),
    rows:(section.rows||[]).map(function(row){return kept.map(function(i){return row[i];});})
  };
}

function _seniorPayrollLayout(section){
  var h=section.header||[];
  var keys=['직원명','급여형태','총근무','야간근무','시급','기본급','야근수당적용여부','야근수당','주휴','휴게','휴게수당','조정','예상 세전급여'];
  return {header:keys,rows:(section.rows||[]).map(function(row){
    var get=function(key){var i=h.indexOf(key);return i<0?'':row[i];};
    return [get('직원명'),get('시급')==='0원'?'월급제':'시급제',get('총근무'),get('야간근무'),get('시급'),get('기본급'),get('야근수당적용여부')||'미적용',get('야근수당')||'0원',get('주휴'),get('휴게 제공 여부'),get('휴게수당'),get('조정'),get('예상 세전급여')];
  })};
}
function _seniorAttendanceLayout(section,payroll){
  var payTypeByName={};
  (payroll.rows||[]).forEach(function(r){payTypeByName[String(r[0])]=r[1];});
  var h=section.header||[];
  var keys=['날짜','직원명','급여형태','출근','퇴근','실근무','야간근무','휴게시간제공여부','법정휴게시간','실제휴게시간','급여산정시간','상태','정정','정정사유'];
  return {header:keys,rows:(section.rows||[]).map(function(row){
    var get=function(key){var i=h.indexOf(key);return i<0?'':row[i];};
    var raw=get('실근무');
    var m=String(raw).match(/^([0-9]+):([0-9]{2})/),seconds=m?Number(m[1])*3600+Number(m[2])*60:0;
    
    // Reference-only statutory break duration; never change source payable time.
    var deduct=seconds>=28800?3600:seconds>=14400?1800:0;
    var dur=function(n){var v=Math.floor(n/60);return Math.floor(v/60)+':'+String(v%60).padStart(2,'0');};
    return [get('날짜'),get('직원명'),payTypeByName[String(get('직원명'))]||'미설정',get('출근'),get('퇴근'),raw,get('야간근무'),get('휴게 제공 여부'),dur(deduct),'—',get('급여산정시간')||'0:00',get('상태'),get('정정'),get('정정사유')];
  })};
}
// Keep attendance in chronological order on every refresh, independently of
// the source payload's employee-grouped order. Preserve order within a date.
function _sortAttendanceByDate(section){
  var dateCol=(section.header||[]).indexOf('날짜');
  if(dateCol<0)return section;
  var rows=(section.rows||[]).map(function(row,index){return {row:row,index:index};});
  function dateKey(value){
    if(value instanceof Date)return value.getFullYear()*10000+(value.getMonth()+1)*100+value.getDate();
    if(typeof value==='number'){var d=new Date(Math.round(value*86400000)+Date.UTC(1899,11,30));return d.getUTCFullYear()*10000+(d.getUTCMonth()+1)*100+d.getUTCDate();}
    var text=String(value==null?'':value).trim();
    var match=text.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if(match)return Number(match[1])*10000+Number(match[2])*100+Number(match[3]);
    return Number.MAX_SAFE_INTEGER;
  }
  rows.sort(function(a,b){return dateKey(a.row[dateCol])-dateKey(b.row[dateCol])||a.index-b.index;});
  return {header:section.header,rows:rows.map(function(item){return item.row;})};
}
function _writeMonth(ss, name, meta, attendance, sessions, payroll){
  // Senior October workbook is the display contract. Transform report columns only.
  payroll=_withoutPayrollStatusColumns(payroll);
  payroll=_seniorPayrollLayout(payroll);
  attendance=_sortAttendanceByDate(_seniorAttendanceLayout(attendance,payroll));
  var sh=ss.getSheetByName(name); if(!sh) sh=ss.insertSheet(name);
  var monthNum=Number(String(name).replace(/[^0-9]/g,''))||0;
  var ym=String(ss.getName()).match(/(20\d{2})/);
  var reportTitle=(ym?ym[1]+'년 ':'')+monthNum+'월 근태 · 급여 보고서';
  // Deployment invariant: only payroll and attendance sections; no session-detail block.
  // All blank separators must remain white after every automatic or manual refresh.
  var sections=[
    {title:'급여 집계',data:payroll},
    {title:'근태 현황',data:attendance}
  ];
  var width=1; sections.forEach(function(s){width=Math.max(width,s.data.header.length);});
  var out=[[reportTitle],[meta],[]], sectionRows=[],headerRows=[],dataRanges=[];
  sections.forEach(function(s){
    sectionRows.push(out.length+1); out.push([s.title]);
    headerRows.push(out.length+1); out.push(s.data.header);
    var first=out.length+1;
    s.data.rows.forEach(function(row){out.push(row);});
    dataRanges.push({first:first,last:out.length,count:s.data.rows.length});
    out.push([]);
  });
  out.forEach(function(row){while(row.length<width)row.push(''); if(row.length>width)row.length=width;});

  // Clear the entire grid, not only the current report width. Old report versions styled
  // columns beyond the current data range; those stale fills must not survive a rewrite.
  sh.getRange(1,1,sh.getMaxRows(),sh.getMaxColumns()).clear({contentsOnly:false});
  sh.getRange(1,1,out.length,width).setValues(out);
  sh.setHiddenGridlines(true);
  sh.setFrozenRows(headerRows[0]);

  var white='#ffffff', ink='#26332b', green='#176b3a', headerGreen='#0f6335', pale='#dff2e3', canvas='#f7f9f8', line='#cfd8d2';
  sh.getRange(1,1,out.length,width).setFontFamily('Arial').setFontSize(10).setFontColor(ink)
    .setFontWeight('normal').setHorizontalAlignment('center')
    .setBackground(white).setVerticalAlignment('middle').setWrap(false);

  // Spreadsheet-native report header: compact, printable, and stable in Google Sheets mobile.
  // Do not merge across the table width; merged regions made narrow mobile views visually drift.
  sh.getRange(1,1,1,width).setBackground(green).setFontColor(white).setFontSize(18).setFontWeight('bold').setHorizontalAlignment('left');
  sh.getRange(2,1,1,width).setBackground(green).setFontColor('#eef8f1').setFontSize(10).setFontWeight('bold').setHorizontalAlignment('left');
  sh.getRange(3,1,1,width).setBackground(white);
  sh.setRowHeight(1,42); sh.setRowHeight(2,28); sh.setRowHeight(3,10);

  sections.forEach(function(s,i){
    var sr=sectionRows[i], hr=headerRows[i], dr=dataRanges[i];
    sh.getRange(sr,1,1,width).setBackground(pale).setFontColor(headerGreen)
      .setFontSize(13).setFontWeight('bold').setHorizontalAlignment('left');
    sh.setRowHeight(sr,30);
    sh.getRange(hr,1,1,width).setBackground(headerGreen).setFontColor('#ffffff')
      .setFontWeight('bold').setHorizontalAlignment('center')
      .setBorder(true,true,true,true,true,true,'#9fb2a6',SpreadsheetApp.BorderStyle.SOLID);
    sh.setRowHeight(hr,30);
    if(dr.count){
      sh.getRange(dr.first,1,dr.count,width).setBackground(white)
        .setBorder(true,true,true,true,true,true,line,SpreadsheetApp.BorderStyle.SOLID)
        .setVerticalAlignment('middle');
      for(var rr=dr.first;rr<=dr.last;rr++) sh.setRowHeight(rr,28);
    }else{
      // Preserve an intentionally empty section without inventing content.
      sh.setRowHeight(dr.first,18);
    }
    sh.getRange(dr.last+1,1,1,width).setBackground(white);
    sh.setRowHeight(dr.last+1,18);
  });

  // Apply display formats by semantic header. Sheets stores dates/times as serial numbers;
  // without number formats mobile clients can expose values such as 46296 / 0.829166....
  sections.forEach(function(s,i){
    var dr=dataRanges[i]; if(!dr.count)return;
    s.data.header.forEach(function(h,idx){
      var col=idx+1, range=sh.getRange(dr.first,col,dr.count,1);
      if(h==='날짜') range.setNumberFormat('yyyy-mm-dd');
      if(['출근','퇴근'].indexOf(h)>=0) range.setNumberFormat('hh:mm');
      if(['실근무','총근무','야간근무'].indexOf(h)>=0) range.setNumberFormat('[h]:mm');
      if(['휴게 기준시간(참고)','휴게 미제공 가산시간','가산 포함 급여산정시간'].indexOf(h)>=0) range.setNumberFormat('[h]:mm');
    });
  });

  // Align by semantic data type while preserving content-authoritative widths.
  var centerHeaders=['날짜','직원명','출근','퇴근','실근무','상태','정정','총근무','야간근무','휴게','휴게 기준시간(참고)','휴게 미제공 가산시간','가산 포함 급여산정시간'];
  sections.forEach(function(s,i){
    var dr=dataRanges[i]; if(!dr.count)return;
    s.data.header.forEach(function(h,idx){
      var col=idx+1;
      if(centerHeaders.indexOf(h)>=0) sh.getRange(dr.first,col,dr.count,1).setHorizontalAlignment('center');
      if(['시급','기본급','야근수당','주휴','휴게수당','조정','예상 세전급여','확정 세전급여'].indexOf(h)>=0)
        sh.getRange(dr.first,col,dr.count,1).setHorizontalAlignment('right');
    });
  });

  var attendanceSectionIndex=sections.findIndex(function(section){return section.title==='근태 현황';});
  var payrollSectionIndex=sections.findIndex(function(section){return section.title==='급여 집계';});
  var aStatus=attendance.header.indexOf('상태')+1;
  if(aStatus>0&&dataRanges[attendanceSectionIndex].count) sh.getRange(dataRanges[attendanceSectionIndex].first,aStatus,dataRanges[attendanceSectionIndex].count,1)
    .setFontColor('#145c34').setFontWeight('bold').setHorizontalAlignment('center');
  var gross=payroll.header.indexOf('예상 세전급여')+1;
  if(gross<=0) gross=payroll.header.indexOf('확정 세전급여')+1;
  if(gross>0&&dataRanges[payrollSectionIndex].count) sh.getRange(dataRanges[payrollSectionIndex].first,gross,dataRanges[payrollSectionIndex].count,1)
    .setFontColor('#17663b').setFontWeight('bold').setHorizontalAlignment('right');
  var pStatus=payroll.header.indexOf('상태')+1;
  if(pStatus>0&&dataRanges[payrollSectionIndex].count) sh.getRange(dataRanges[payrollSectionIndex].first,pStatus,dataRanges[payrollSectionIndex].count,1)
    .setFontColor('#745500').setFontWeight('bold').setHorizontalAlignment('center');

  // Size each used column from the widest text that is actually displayed in that column.
  // Native autoResize can collapse short Korean headers to ~18px on mobile, so measure the
  // rendered strings themselves instead of assigning type buckets/min/max widths.
  SpreadsheetApp.flush();
  var usedRange=sh.getRange(1,1,out.length,width);
  var display=usedRange.getDisplayValues();
  var sizes=usedRange.getFontSizes();
  var weights=usedRange.getFontWeights();
  var paddingPx=24;
  function textWidthPx(value,fontSize,isBold){
    var text=String(value==null?'':value);
    var units=0;
    for(var ci=0;ci<text.length;ci++){
      var code=text.charCodeAt(ci);
      if(code===32) units+=0.38;
      else if(code>=0x2e80) units+=1.05; // Hangul/CJK/full-width glyphs
      else if(/[MW@#%&]/.test(text.charAt(ci))) units+=0.90;
      else if(/[A-Z0-9]/.test(text.charAt(ci))) units+=0.68;
      else units+=0.58;
    }
    return Math.ceil(units*fontSize*(isBold?1.08:1)+paddingPx);
  }
  // Never resize the active month independently: that produces a visible width drift
  // before the annual shared-width pass, especially when refreshing October.
  // A single month must not independently shrink columns: normalize the same column
  // against every populated month in the annual workbook after each write.
  var sharedWidths=[];
  for(var mm=1;mm<=12;mm++){
    var peer=ss.getSheetByName(mm+'월');
    if(!peer)continue;
    var peerLast=Math.max(1,peer.getLastRow());
    var peerRange=peer.getRange(1,1,peerLast,width);
    var peerDisplay=peerRange.getDisplayValues();
    var peerSizes=peerRange.getFontSizes();
    var peerWeights=peerRange.getFontWeights();
    for(var pc=0;pc<width;pc++){
      for(var pr=2;pr<peerDisplay.length;pr++){
        // Report title/subtitle and full-width section labels are presentation,
        // not column data. Exclude them even when a peer tab has older layout.
        var first=String(peerDisplay[pr][0]||'').trim();
        if(first==='급여 집계'||first==='근태 현황'||first==='세션 상세')continue;
        if(/^(?:20\d{2}년\s*)?\d{1,2}월\s+근태\s*[·ㆍ]\s*급여\s*보고서$/.test(first))continue;
        if(/^마지막 동기화\s*:/.test(first))continue;
        sharedWidths[pc]=Math.max(sharedWidths[pc]||0,textWidthPx(peerDisplay[pr][pc],peerSizes[pr][pc]||10,peerWeights[pr][pc]==='bold'));
      }
    }
  }
  for(var sm=1;sm<=12;sm++){
    var target=ss.getSheetByName(sm+'월');
    if(!target)continue;
    for(var sc=0;sc<width;sc++)if(sharedWidths[sc]>0)target.setColumnWidth(sc+1,sharedWidths[sc]);
  }
  SpreadsheetApp.flush();

  return {column_resize_applied:true,resize_scope:'all_used_columns_after_write',
    width_source:'measured_display_text',resized_columns:width,
    report_design_applied:true,report_design_version:'sheet-report-v8'};
}

function _json(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
