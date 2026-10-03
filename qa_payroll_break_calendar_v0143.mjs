import fs from "node:fs";
const s=fs.readFileSync("index.html","utf8");
const c=fs.readFileSync("employment_contracts_v3.js","utf8");
const mustIndex=[
  'const APP_VERSION="v0.143"',
  'admin_store_payroll_contracts_v2',
  'Number(s.sec||0)>4*3600',
  'const breakTimeProvided=contract?.break_time_provided!==false',
  'const breakCompensateCount=breakNotProvidedCount',
  'const breakCompPay=Math.round((effWage||0)*0.5*breakCompensateCount)',
  'rec.breakTimeProvided?"제공":"미제공"',
  '"휴게시간 제공","휴게미제공","30분 추가지급","휴게수당"'
];
for(const x of mustIndex) if(!s.includes(x)) throw new Error("missing break-pay policy: "+x);
const mustContract=[
  "admin_contract_break_policy_set",
  'id="breakTimeProvided"',
  '4시간 초과 근무 시 체크하면 30분 휴게 제공',
  "BE.breakPolicySet(Number(r.id),breakProvided)"
];
for(const x of mustContract) if(!c.includes(x)) throw new Error("missing contract break checkbox: "+x);
if(s.includes('bb.textContent="휴게"')) throw new Error("legacy payroll break button remains");
if(s.includes('data-v="pay"')) throw new Error("legacy per-shift break choice remains");
console.log("PASS payroll break contract policy v0.143");
