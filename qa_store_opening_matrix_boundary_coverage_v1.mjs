import assert from 'node:assert/strict';
import fs from 'node:fs';
// Trusted regression fixture only: never loaded in provider-key/model process.
const matrix=fs.readFileSync('qa_store_opening_matrix_v1.mjs','utf8');
const actual=matrix.slice(matrix.indexOf('const lanes=['),matrix.indexOf('\n];'));
const required=[
 ['근태 이상 징후 즉시 정정 경계','qa_actual_attendance_anomaly_correction_v1.mjs'],
 ['관리자 수기 근태 재정정 단일 유효 교대','qa_manual_attendance_recorrection_v1.mjs'],
 ['고용 계약 생성·급여 조건 경계','qa_employment_contract_v1.mjs'],
 ['직원 지점 등록 경계','qa_employee_store_registration_v218.mjs']
];
for(const [label,file] of required){
 assert.equal(actual.split("'"+file+"'").length,2,'one-run matrix must include '+file+' once');
 assert.ok(actual.includes("['"+label+"','"+file+"']"),'separate scenario label required');
 assert.ok(fs.existsSync(file),'real regression source missing '+file);
}
assert.ok(matrix.includes('results.push({label,file,passed,exitCode:child.status,output:output.slice(-2400)})'),'preserve per-lane failure evidence');
assert.ok(matrix.includes("if(!results.every(r=>r.passed))"),'matrix must fail closed on any regression');
console.log('PASS QA-06 verified reviewed four independent boundary regression lanes');
