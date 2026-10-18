/* #1000: Run every store-opening lane even when one fails. Never hide failed QA.
 * These are synthetic/contract checks; not a substitute for live SMTP or Sheets.
 */
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
const lanes=[
 ['HQ 지점 등록/READY 조건','qa_hq_store_onboarding_v1.mjs'],
 ['본사 지점 검색/대표 활성화','qa_hq_store_search_owner_activation_v1.mjs'],
 ['대표 초대/승인/비밀번호 계약','qa_owner_invite_autoactivation_921.mjs'],
 ['대표·보조 관리자 접근 경계','qa_store_delegated_manager_v1.mjs'],
 ['보조 관리자 초대/권한 변경/해임 동작','qa_store_manager_actions_v1.mjs'],
 ['근태 자정·야간 교대','qa_actual_attendance_overnight_pairing_v1.mjs'],
 ['근태 일자별 분리','qa_actual_attendance_day_slices_v1.mjs'],
 ['근태 누락·장시간 이상 징후','qa_actual_attendance_anomaly_v1.mjs'],
 ['근태 수기 생성·입력 검증','qa_actual_attendance_manual_add_v1.mjs'],
 ['근태 관리자 정정 이력·권한','qa_actual_attendance_correction_v1.mjs'],
 ['야간/익일 퇴근/미퇴근 연결','qa_actual_attendance_overnight_fix_v1.mjs'],
 ['중도 계약·임금 변경 월 경계','qa_payroll_contract_transition_fail_closed_v1.mjs'],
 ['현장 출퇴근 0건 급여 마감 안전성','qa_payroll_no_local_punch_close_v1.mjs'],
 ['입사 이전·미래 월급 미발생','qa_payroll_no_future_month_salary_v1.mjs'],
 ['주휴 주차·월말 경계','qa_payroll_week_boundary_behavior_v1.mjs'],
 ['지점별 직원 계약·재직정보 격리','qa_employee_contract_status_store_scope_v1.mjs'],
 ['대표 관리자 해임 뒤 권한 차단','qa_store_owner_revocation_hardening_v1.mjs'],
 ['근태↔급여 정합성','qa_attendance_payroll_consumer_parity_v1.mjs'],
 ['주휴·미완결 근태/급여 정책','qa_payroll_policy_scenarios_v1.mjs'],
 ['급여 마감 서버 권한','qa_payroll_close_server_authority_v1.mjs'],
 ['지점간 급여 격리','qa_store_payroll_isolation_v1.mjs'],
 ['실제 엔진 다직원 근태→급여→시트 페이로드','qa_store_opening_payroll_sheet_v1.mjs'],
 ['구글 시트 자동 동기화 제어','qa_sheet_auto_sync_v1.mjs'],
 ['마감 급여 지점별 시트 격리','qa_sheet_snapshot_store_scope_v1.mjs'],
 ['TEST 근태·급여 실운영 시트 격리','qa_server_sheet_test_exclusion_v1.mjs'],
 ['직원 출근/PIN/레시피 권한','qa_staff_recipe_ready_guard_v1.mjs'],
 ['레시피 본사 원문 유출 차단','qa_recipe_no_static_instruction_leak_v1.mjs'],
 ['레시피 검증된 원본 순서 보존','qa_recipe_verified_passorder_four_v1.mjs'],
 // #1060 / QA-07: entire inventory → purchasing → sales/reconciliation
 // scope executes with the store-opening report, not as unobserved separate CI.
 ['지점별 재고 원장/단위/관리권한 격리','qa_store_inventory_isolation_v1.mjs'],
 ['재고 장기체류 안전성·입고/사용·개인정보 경계','qa_store_inventory_age_v1.mjs'],
 ['판매명·행사명·1L 지점 SKU 매핑 경계','qa_store_sale_sku_preview_v1.mjs'],
 ['재고 수기·대량 등록 실제 UI 연결','qa_inventory_editor_wiring_v1.mjs'],
 ['모바일 재고실사 초안/확정 UI 안전성','qa_store_stocktake_ui_v1.mjs'],
 ['모바일 재실사 빠른 수정·다음 품목 입력','qa_stocktake_fast_mobile_entry_v1.mjs'],
 ['미입고/부분입고 발주·포장단위 중복 차단','qa_stock_reorder_net_pending_v1.mjs'],
 ['재고 미확인·데모 수량 제외','qa_inventory_real_metrics_v1.mjs'],
 ['지점별 POS/배달/매출 접근 경계','qa_store_operations_isolation_v1.mjs'],
 ['POS/매출 CSV 형식·주입 오류 거부','qa_operations_csv_integrity_v1.mjs'],
 ['매출·매입 데모의 실제 보고서 유입 차단','qa_operations_demo_metrics_guard_v1.mjs'],
 ['미정산·누락 거래 대사 화면 연결','qa_store_operations_reconciliation_ui_v1.mjs'],
 ['POS/배달 실제 장부 페이징·시연 분리','qa_operations_paged_real_v1.mjs'],
 ['지점 진입 잠금 및 재고 원문 단위 보존','qa_store_entry_inventory_units_v021.mjs']
];
const started=new Date().toISOString(),results=[];
for(const [label,file] of lanes){
 const child=spawnSync(process.execPath,[file],{encoding:'utf8',timeout:90000,maxBuffer:1024*1024*3});
 const passed=child.status===0&&!child.error;
 const output=(child.stdout||'')+(child.stderr||'')+(child.error||'');
 results.push({label,file,passed,exitCode:child.status,output:output.slice(-2400)});
 console.log((passed?'PASS':'FAIL')+' '+label+' — '+file);
 if(!passed)console.error(output.slice(-2000));
}
fs.mkdirSync('qa-results',{recursive:true});
const record={issue:1000,extensionIssue:1060,runStartedAt:started,endedAt:new Date().toISOString(),
 environment:'isolated synthetic & source-contract checks, no live writes',
 status:results.every(r=>r.passed)?'PASS':'FAIL',results};
fs.writeFileSync('qa-results/store-opening-matrix.json',JSON.stringify(record,null,2));
const md='## 신규 지점 개통 QA (격리형)\n\n'
 +'| 검증 항목 | 결과 |\n|---|---|\n'
 +results.map(r=>'| '+r.label+' | '+(r.passed?'PASS':'FAIL')+' |').join('\n')+'\n\n'
 +'실제 SMTP 수신, 운영 Supabase 및 Google Sheets 원격 쓰기: **이 검사 범위 밖**\n';
if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,md);
if(!results.every(r=>r.passed)){console.error('FAIL '+results.filter(r=>!r.passed).length+'/'+results.length+' lanes');process.exitCode=1;}
else console.log('PASS '+results.length+'/'+results.length+' isolated store-opening source/logic lanes');
