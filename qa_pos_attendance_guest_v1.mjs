// #1028: POS shared terminal, no manager login, must open staff self-service
// without calling the protected pos_employees_state RPC. Data remains PIN-gated.
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync('index.html','utf8');
const sql=fs.readFileSync('supabase/migrations/20261015194500_pos_v096_public_cards.sql','utf8');
const gate=fs.readFileSync('supabase/migrations/20261015161000_pos_kiosk_session_gate_v1.sql','utf8');
const first=html.indexOf('async function openMyRecord(){');
const last=html.indexOf('// STEP 1: 인증 화면',first);
assert.ok(first>0&&last>first,'staff attendance entry function found');
const block=html.slice(first,last);
assert.match(block,/LIVE\?await BE\.posPublicStaffCards\(\):await BE\.listEmployeesState\(\)/);
assert.doesNotMatch(block,/await BE\.listEmployeesState\(\);/,'live guest flow must not call token-only roster directly');
assert.match(gate,/RAISE EXCEPTION 'POS_AUTH_REQUIRED'/,'private full employee state must stay token-gated');
assert.match(sql,/s\.onboarding_status='READY'/);
assert.match(sql,/REVOKE ALL ON FUNCTION public\.list_employees_state/);
assert.doesNotMatch(sql,/pin_bcrypt|hourly_wage|monthly_salary|contract/);
assert.match(html,/try\{ res=await BE\.myEvents\(id,pin,r\.fs,r\.ts\); \}/,'attendance itself remains 4-digit staff PIN verified');
assert.match(html,/if\(!\/\^\\d\{4\}\$\/\.test\(pin\)\)/,'PIN syntax enforced before events read');

async function run(live,fail=false) {
  let publicCount=0,privateCount=0,shown=null,error=null;
  const employees=[{id:44,employee_no:8,name:'테스트직원'}];
  const BE={
    async posPublicStaffCards(){publicCount++;if(fail)throw Error('network down');return employees;},
    async listEmployeesState(){privateCount++;if(live)throw Error('P0001 POS_AUTH_REQUIRED');return employees;},
    async myEvents(){throw Error('should not fetch records before PIN');}
  };
  const storage={removeItem(k){assert.equal(k,'staff_attendance_auth');},getItem(){return null;}};
  const open=(new Function('BE','LIVE','sessionStorage','mrShowAuth','toast','mrRange','location',
    block+'\nreturn openMyRecord;'))(
      BE,live,storage,(e,id)=>{shown={e,id};},(...args)=>{error=args;},()=>({fs:'',ts:''}),{href:''}
  );
  await open();
  return {publicCount,privateCount,shown,error};
}
const guest=await run(true);
assert.equal(guest.publicCount,1);
assert.equal(guest.privateCount,0);
assert.equal(guest.shown.e[0].id,44);
assert.equal(guest.error,null);
const demo=await run(false);
assert.equal(demo.publicCount,0);
assert.equal(demo.privateCount,1);
assert.equal(demo.shown.e[0].id,44);
const failure=await run(true,true);
assert.equal(failure.privateCount,0);
assert.equal(failure.shown,null);
assert.match(failure.error[2],/다시 시도/);
assert.doesNotMatch(failure.error[2],/P0001|POS_AUTH_REQUIRED/);
console.log('PASS POS guest attendance picker, protected private roster, PIN-only access, safe failure');
