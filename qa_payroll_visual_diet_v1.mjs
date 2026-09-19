import fs from 'node:fs';import assert from 'node:assert/strict';const s=fs.readFileSync('payroll_contract_authority_v1.js','utf8');
assert(!s.includes("note.textContent='급여는 계약조건과 정정 반영 실근무를 기준으로 계산합니다.'"));
assert(!s.includes("warn.textContent=\`급여 마감 보류"));
assert(!s.includes("parts=[\`실근무 \\`,\`시급 "));
assert(!s.includes("s.textContent=contractSummary(rec.contract)"));
assert(s.includes("n.textContent='급여 확인 필요'"));
assert(s.includes("close.disabled=!!blockers.length"),'close safety must remain even when warning prose is hidden');
assert(s.includes("payroll-gross-value"),'gross pay remains primary employee value');
console.log('payroll visual diet: PASS');