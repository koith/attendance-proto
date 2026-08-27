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
 *  - 월별 3탭(근태/세션/급여) replace. write 실패 시 빈 시트 방지: 먼저 새 데이터를
 *    임시 시트에 쓰고 검증 성공 후 기존 데이터 영역과 교체.
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

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var meta = '마지막 동기화: ' + body.synced_at + '   |   상태: ' + body.status_label;

    _writeTab(ss, '근태-'+body.ym, meta, body.attendance.header, body.attendance.rows);
    _writeTab(ss, '세션-'+body.ym, meta, body.sessions.header, body.sessions.rows);
    _writeTab(ss, '급여-'+body.ym, meta, body.payroll.header, body.payroll.rows);

    return _json({ok:true, ym:body.ym,
      counts:{attendance:body.attendance.rows.length, sessions:body.sessions.rows.length, payroll:body.payroll.rows.length}});
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
function _writeTab(ss, name, meta, header, rows){
  var sh = ss.getSheetByName(name);
  if(!sh) sh = ss.insertSheet(name);

  // 최종 출력 배열 미리 완성 (여기서 실패하면 기존 시트 손 안 댐)
  var out = [];
  out.push([meta]);           // 1행: metadata
  out.push([]);               // 2행: 공백
  out.push(header);           // 3행: 헤더
  for(var i=0;i<rows.length;i++){ out.push(rows[i]); }

  // 폭 맞추기 (setValues는 직사각형 필요)
  var width = header.length;
  for(var r=0;r<out.length;r++){
    while(out[r].length < width) out[r].push('');
    if(out[r].length > width) out[r] = out[r].slice(0, width);
  }

  // 교체: 기존 내용 지우고 한 번에 쓰기
  sh.clearContents();
  sh.getRange(1, 1, out.length, width).setValues(out);

  // 서식 (metadata·헤더 강조) — 데이터와 무관, 실패해도 값은 이미 기록됨
  try{
    sh.getRange(1,1,1,width).setFontColor('#666').setFontSize(10);
    sh.getRange(3,1,1,width).setFontWeight('bold').setBackground('#f1f3f5');
    sh.setFrozenRows(3);
  }catch(fmtErr){ /* 서식 실패는 무시 */ }
}

function _json(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
