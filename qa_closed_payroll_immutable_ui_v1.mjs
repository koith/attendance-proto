import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// Synthetic fixtures only. Never closes or modifies actual payroll.
const html=fs.readFileSync("index.html","utf8");
const sql=fs.readFileSync("supabase/migrations/20261012152500_closed_payroll_immutable_ui_snapshot.sql","utf8");
const start=html.indexOf("function payrollClosedSnapshotReport(snapshot){");
const end=html.indexOf("async function drawPay(ym){",start);
assert.ok(start>=0&&end>start,"closed snapshot mapper must be present");
const ctx=vm.createContext({});
vm.runInContext(html.slice(start,end),ctx);
const render=ctx.payrollClosedSnapshotReport;

const originals=[
 {employee_id:501,employee_name:"Transferred hourly employee",hours:12.5,wage:13000,
  weeks:1,base_pay:162500,juhyu_pay:50000,adjust:1000,gross_pay:249500,
  net_pay:240000,tax_rate:0.04,night_allowance_won:14000,
  break_compensation_won:18000,substitution_pay_won:4000,
  night_allowance_label:"정률 50%",break_mode:"NOT_PROVIDED"},
 {employee_id:502,employee_name:"Historical salaried employee",hours:0,wage:0,
  weeks:0,base_pay:2600000,juhyu_pay:0,adjust:0,gross_pay:2600000,
  net_pay:2570000,tax_rate:0.0115,night_allowance_won:null,
  break_compensation_won:null,substitution_pay_won:null,
  night_allowance_label:null,break_mode:null}
];
const frozen=render({status:"CLOSED",rows:originals});
assert.equal(frozen.rows.length,2,"No transferred or deactivated employee may be lost");
assert.equal(frozen.totalGross,2849500);
assert.equal(frozen.totalNet,2810000);
assert.equal(frozen.rows[0].pay.gross,249500);
assert.equal(frozen.rows[0].pay.nightAllowance,14000);
assert.equal(frozen.rows[0].pay.breakCompPay,18000);
assert.equal(frozen.rows[0].pay.substitutePay,4000);
assert.equal(frozen.rows[0].pay.nightAllowanceLabel,"정률 50%");
assert.equal(frozen.rows[0].pay.breakMode,"NOT_PROVIDED");
assert.equal(frozen.rows[0].employee_name,"Transferred hourly employee");
assert.equal(frozen.rows[0].sessions.length,0,"Mutable attendance must not leak into closed totals");
assert.equal(frozen.rows[0].emp.id,501);
assert.equal(frozen.rows[1].pay.nightAllowance,null,"Historical unknown is not 0");
assert.equal(frozen.rows[1].pay.breakCompPay,null);
assert.equal(frozen.rows[1].pay.substitutePay,null);
assert.equal(frozen.rows[1].pay.nightAllowanceLabel,"—");
assert.throws(()=>render({status:"CLOSED",rows:[]}),/CLOSED_PAYROLL_SNAPSHOT_MISSING/);
assert.throws(()=>render({status:"CLOSED",rows:[originals[0],originals[0]]}),/CLOSED_PAYROLL_SNAPSHOT_INVALID/);
assert.throws(()=>render({status:"CLOSED",rows:[{...originals[0],gross_pay:null}]}),/CLOSED_PAYROLL_SNAPSHOT_INVALID/);
assert.throws(()=>render({status:"CLOSED",rows:[{...originals[0],gross_pay:-1}]}),/CLOSED_PAYROLL_SNAPSHOT_INVALID/);
assert.throws(()=>render({status:"CLOSED",rows:[{...originals[0],net_pay:999999}]}),/CLOSED_PAYROLL_SNAPSHOT_INVALID/);
assert.throws(()=>render({status:"CLOSED",rows:[{...originals[0],night_allowance_won:-1}]}),/CLOSED_PAYROLL_SNAPSHOT_INVALID/);
assert.match(html,/const saved=await BE\.snapshot\(ym\);[\s\S]*?if\(saved\?\.status==="CLOSED"\)\{[\s\S]*?R=payrollClosedSnapshotReport\(saved\);[\s\S]*?if\(!R\)R=await computeMonthPayroll\(ym\);/);
assert.match(html,/if\(rec\.closedSnapshot\)continue;/,
 "An immutable closed salary must not be reset by open-payroll zero-shift logic");
assert.equal(frozen.rows[0].pay.payrollType,undefined,
 "A closed salary row must never expose a weekly-approval mutation control");
assert.match(html,/if\(LIVE&&pay\?\.payrollType==="HOURLY"\)/,
 "Open months retain the existing weekly-approval UI");
assert.match(html,/closedSnapshot\?"마감 확정 급여":"현재 급여"/);
for(const name of ["night_allowance_won","break_compensation_won",
 "substitution_pay_won","night_allowance_label","break_mode"]){
 assert.ok(sql.includes(name),"Snapshot RPC must return "+name);
}
assert.match(sql,/public\.can_manage_store\(p_store_id\)/);
assert.match(sql,/WHERE store_id=p_store_id AND ym=p_ym/);
assert.match(sql,/SECURITY DEFINER/);
assert.doesNotMatch(sql,/\b(?:DELETE|TRUNCATE|DROP)\b/i);
console.log("PASS: closed months render immutable verified payroll, preserve transferred staff, block recalculation and approval edits");
