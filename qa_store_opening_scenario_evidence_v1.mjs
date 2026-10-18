// Canonical #1008 QA-06: one-case/one-evidence matrix. Do not mistake synthetic PASS for field QA.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const lanes=[
 ['STORE-REGISTER','중복·주소·READY 경계 기초 검증','qa_hq_store_onboarding_v1.mjs'],
 ['STORE-READY','비READY 지점 진입 차단','qa_store_entry_ready_lock_v1.mjs'],
 ['ADMIN-ROLE','보조 관리자 지점 권한 격리','qa_store_delegated_manager_v1.mjs'],
 ['ATT-RAW','근태 원천과 화면 소비자 무결성','qa_actual_attendance_canonical_v1.mjs'],
 ['ATT-MANUAL','수기 근태 생성 및 실패 방어','qa_actual_attendance_manual_add_v1.mjs'],
 ['ATT-CORRECT','동시각 정정 이력 선택','qa_attendance_correction_tiebreak_v1.mjs'],
 ['ATT-OVERNIGHT','야간 출퇴근·자정 익일 쌍','qa_actual_attendance_overnight_pairing_v1.mjs'],
 ['ATT-SEGMENTS','날짜 경계 기준 출근 분할','qa_actual_attendance_day_slices_v1.mjs'],
 ['PAY-BREAK','휴게시간 적용 여부','qa_payroll_break_calendar_v0143.mjs'],
 ['PAY-CONTRACT','급여 계약 변경 시 권한/중첩 거부','qa_payroll_contract_transition_fail_closed_v1.mjs'],
 ['PAY-WEEK','주휴수당 승인·반려·재승인','qa_payroll_approval_engine_fixture_v1.mjs'],
 ['PAY-CROSSMONTH','월말·연말 주휴 소속 월','qa_payroll_month_boundary_v1.mjs'],
 ['PAY-CLOSE','급여 마감/취소 서버 권한','qa_payroll_close_server_authority_v1.mjs'],
 ['PAY-NOFUTURE','미래 월 급여 허위 생성 차단','qa_payroll_no_future_month_salary_v1.mjs'],
 ['PAY-NOPUNCH','마감 없는 미타각 상태 방어','qa_payroll_no_local_punch_close_v1.mjs'],
 ['PAY-TERMINATED','퇴사자 월급 지급 경계','qa_payroll_terminated_monthly_no_punch_v1.mjs'],
 ['PAY-STORE','다른 지점 급여 조회·합산 격리','qa_multistore_payroll_isolation_v1.mjs'],
 ['PAY-EXPECTED','독립 기대 급여 계산과 서버 일치','qa_server_payroll_parity_fixtures.mjs']
];
const pending=[
 ['STORE-ADDRESS','동일 명칭 다른 주소 실매장 공식 증빙'],
 ['ADMIN-SESSION','보조 권한 변경 즉시 이전 JWT 서버 거부'],
 ['ATT-LATE','약정 시각 이후 출근 지각 실데이터'],
 ['ATT-EARLY','약정 시각 이전 퇴근 조퇴 실데이터'],
 ['ATT-REHIRE','퇴사·재입사 기간 중복/급여 경계 실데이터'],
 ['PAY-REASON','실제 점주 급여 정정 사유 원천 검산'],
 ['PAY-FIELD','실제 한 달 점주 확정 및 급여 마감 스냅샷 대조']
];
const results=[];
for(const [id,label,file] of lanes){
 if(!fs.existsSync(file))throw Error('MISSING_QA_FIXTURE '+id+' '+file);
 const r=spawnSync(process.execPath,[file],{encoding:'utf8',timeout:90000,maxBuffer:1024*1024*3});
 const pass=r.status===0&&!r.error;
 results.push({id,label,file,result:pass?'PASS':'FAIL',
  evidence:((r.stdout||'')+(r.stderr||'')+String(r.error||'')).slice(-1600)});
 console.log((pass?'PASS ':'FAIL ')+id+' · '+label);
}
const evidence={issue:1008,canonicalId:'QA-06',at:new Date().toISOString(),
 environment:'synthetic/source fixture; no physical device or production mutations',
 verified:results.filter(x=>x.result==='PASS').length,
 failed:results.filter(x=>x.result==='FAIL').length,
 unresolved:pending.map(([id,label])=>({id,label,result:'GAP_FIELD_OR_MISSING_EVIDENCE'})),
 overall:results.some(x=>x.result==='FAIL')?'FAIL':'PARTIAL',results};
fs.mkdirSync('qa-results',{recursive:true});
fs.writeFileSync('qa-results/store-opening-qa06-evidence.json',JSON.stringify(evidence,null,2));
fs.writeFileSync('qa-results/store-opening-qa06-evidence.md',
 '# QA-06 업무원장 증거 행렬\n\n| ID | 시나리오 | 결과 |\n|---|---|---|\n'+
 results.map(x=>'| '+x.id+' | '+x.label+' | '+x.result+' |').join('\n')+'\n'+
 pending.map(x=>'| '+x[0]+' | '+x[1]+' | GAP_FIELD_OR_MISSING_EVIDENCE |').join('\n')+
 '\n\n현장 PC·실인원·원천 급여 미검증을 PASS로 계산하지 않음.\n');
if(results.some(x=>x.result==='FAIL'))process.exitCode=1;
console.log('QA-06 actual executable cases '+evidence.verified+'/'+lanes.length+
 '; gaps '+pending.length+'; status '+evidence.overall);
