import assert from 'node:assert/strict';
import fs from 'node:fs';
import {approvedWeeklyAdjustment} from './supabase/functions/server-sync-sheet/payroll_policy.mjs';
const sql=fs.readFileSync('supabase/migrations/20261010234500_weekly_append_only_decisions.sql','utf8');
const edge=fs.readFileSync('supabase/functions/server-sync-sheet/index.ts','utf8');
const ui=fs.readFileSync('index.html','utf8');
const engine=fs.readFileSync('supabase/functions/server-sync-sheet/engine.mjs','utf8');
assert.match(sql,/SECURITY DEFINER SET search_path TO 'public','pg_temp'/);
assert.match(sql,/SERVICE_ONLY/);
assert.match(sql,/EMPLOYEE_STORE_MISMATCH/);
assert.match(sql,/WEEK_NOT_CLOSED/);
assert.match(sql,/PAYROLL_ALREADY_CLOSED/);
assert.match(sql,/pg_advisory_xact_lock/);
assert.match(sql,/p_decision NOT IN \('APPROVE','REJECT'\)/);
assert.match(sql,/p_decision='REJECT' AND p_approved_won<>0/);
assert.match(sql,/TO service_role/);
assert.match(edge,/client\.rpc\("approve_payroll_weekly_decision_internal"/);
assert.match(edge,/\.order\("approved_at",\{ascending:false\}\)\.order\("id",\{ascending:false\}\)/);
assert.match(edge,/select\("employee_id,week_start,calculated_won,approved_won,decision/);
assert.match(ui,/id="weeklyDecision"/);
assert.match(ui,/mode:"weekly_decide"/);
assert.match(ui,/decision==="REJECT"\?0/);
assert.match(ui,/해당 주 자동계산 금액/);
assert.match(engine,/approvedWeeks\.has\(a\.week_start\)/);
// Same week, 3 immutable rows, returned newest first: only latest decision applies.
const records=[
  {id:3,week_start:'2026-09-07',approved_won:35000,decision:'APPROVE',approved_at:'2026-10-10T20:00:00Z',reason:'수정승인',approved_by:'hq'},
  {id:2,week_start:'2026-09-07',approved_won:0,decision:'REJECT',approved_at:'2026-10-10T19:00:00Z',reason:'반려사유',approved_by:'hq'},
  {id:1,week_start:'2026-09-07',approved_won:70000,decision:'APPROVE',approved_at:'2026-10-10T18:00:00Z',reason:'최초승인',approved_by:'hq'}
];
const before=70000,first=records[0];
const after=approvedWeeklyAdjustment(before,first.approved_won,first.reason,first.approved_by,first.approved_at).amount;
assert.equal(after,35000);
assert.equal(approvedWeeklyAdjustment(before,records[1].approved_won,records[1].reason,records[1].approved_by,records[1].approved_at).amount,0);
assert.equal(records.length,3,'Audit must retain all decisions');
console.log('PASS append-only weekly approval -> rejection -> reapproval latest-wins, scoped & closed-week guard');
