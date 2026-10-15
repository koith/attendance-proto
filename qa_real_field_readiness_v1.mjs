import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evaluateReadiness} from './scripts/real_field_readiness_v1.mjs';
const zero={schema_version:2,captured_at:'2026-10-15T07:54:00Z',
 payroll:{closed_periods:0,closed_periods_with_snapshots:0,qualified_closed_periods:0,approved_weeks:0},
 stores:{qualified_owner_links:0,staged_count:243},
 operations:{completed_imports:0,confirmed_linked_real_transactions:0,unresolved_reconciliations:0,real_stock_movements:0}};
const r=evaluateReadiness(zero);
for(const id of ['PAY-01','STORE-01','FEATURE-01']){
 assert.equal(r.status[id].state,'WAITING_REAL_EVIDENCE');
 assert.equal(r.status[id].verified,false);
 assert.ok(r.status[id].missing.length>0);
}
const candidate=structuredClone(zero);
candidate.payroll={closed_periods:1,closed_periods_with_snapshots:1,qualified_closed_periods:1,approved_weeks:1};
candidate.stores.qualified_owner_links=1;
candidate.operations={completed_imports:1,confirmed_linked_real_transactions:3,unresolved_reconciliations:0,real_stock_movements:2};
const good=evaluateReadiness(candidate);
for(const id of ['PAY-01','STORE-01','FEATURE-01']){
 assert.equal(good.status[id].state,'READY_FOR_AUTHORIZED_FIELD_QA');
 assert.equal(good.status[id].verified,false,'synthetic evidence never passes field validation');
}
const pending=structuredClone(candidate);pending.operations.unresolved_reconciliations=1;
assert.deepEqual(evaluateReadiness(pending).status['FEATURE-01'].missing,['UNRESOLVED_RECONCILIATIONS']);
const mismatch=structuredClone(candidate);
mismatch.payroll.qualified_closed_periods=0;
assert.equal(evaluateReadiness(mismatch).status['PAY-01'].state,'WAITING_REAL_EVIDENCE',
 'an unrelated approved week must not activate payroll field QA');
assert.match(fs.readFileSync('qa_real_field_readiness_readonly.sql','utf8'),
 /JOIN closed_with_snapshot p ON p.store_id=w.store_id/,
 'weekly approvals require a matching closed store period');
const noApproval=structuredClone(candidate);noApproval.payroll.approved_weeks=0;
assert.equal(evaluateReadiness(noApproval).status['PAY-01'].state,'WAITING_REAL_EVIDENCE');
const noSource=structuredClone(candidate);noSource.operations.confirmed_linked_real_transactions=0;
assert.equal(evaluateReadiness(noSource).status['FEATURE-01'].state,'WAITING_REAL_EVIDENCE');
for(const data of [null,{...zero,payroll:null},{...zero,stores:{}},{...zero,operations:{...zero.operations,completed_imports:'1'}},
 {...zero,payroll:{...zero.payroll,closed_periods:-1}}, {...zero,payroll:{...zero.payroll,closed_periods_with_snapshots:1}}])
 assert.throws(()=>evaluateReadiness(data),'malformed evidence must fail closed');
const sql=fs.readFileSync('qa_real_field_readiness_readonly.sql','utf8');
assert.match(sql,/SELECT jsonb_build_object\(/);
assert.match(sql,/t\.is_demo IS FALSE AND t\.status='CONFIRMED'/);
assert.match(sql,/r\.id=t\.raw_record_id/);
assert.match(sql,/s\.onboarding_status='READY'/);
assert.match(sql,/latest_review\.decision='VERIFIED'/);
assert.match(sql,/ORDER BY v\.reviewed_at DESC,v\.id DESC LIMIT 1/);
assert.match(sql,/p\.status='CLOSED'/);
assert.doesNotMatch(sql,/\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP)\s+(TABLE|INTO|public\.|FROM)/i,
 'readiness SQL must not modify operational source');
console.log('PASS field evidence: no synthetic final-pass, snapshot/owner/source/provenance gates and fail closed');
