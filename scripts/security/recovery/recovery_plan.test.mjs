import test from 'node:test';
import assert from 'node:assert/strict';
import {plan,validatePlan} from './recovery_plan.mjs';

test('recovery plan is dependency-ordered and every step has verify + rollback',()=>{
 const p=plan(process.cwd());
 assert.deepEqual(validatePlan(p),[]);
 const at=id=>p.steps.findIndex(s=>s.id===id);
 assert.ok(at('K1')<at('B2')&&at('B2')<at('D3')&&at('D3')<at('E1')&&at('E1')<at('G1')&&at('G1')<at('C1'));
 assert.deepEqual(p.auto_steps,['K2','B2']);
 assert.ok(!JSON.stringify(p).match(/eyJ|service_role_key=|sk_live/i),'names only, no secret values');
});
test('validatePlan rejects a step scheduled before its dependency',()=>{
 const p=plan(process.cwd());const s=p.steps;
 [s[0],s[3]]=[s[3],s[0]];
 assert.ok(validatePlan(p).some(e=>/runs before its dependency/.test(e)));
});
