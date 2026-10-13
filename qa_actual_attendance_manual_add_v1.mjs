import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync('actual_attendance.js','utf8');
const begin=source.indexOf('  async function addAttendance(day){');
const end=source.indexOf('\n  function openCorrection(day,s){',begin);
assert.ok(begin>=0&&end>begin,'Manual attendance handler missing');
const script=source.slice(begin,end)+'\nthis.addAttendance=addAttendance;';
async function run(inputs,{failOut=false}={}){
  const prompts=[...inputs],writes=[],messages=[],rendered=[],S={staffMode:false,employees:[{id:928,name:'정재우'}]};
  const context=vm.createContext({
    S,document:{},location:{},prompt:()=>prompts.shift(),console:{error(){}},
    dayKey:d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),
    toastCorrection:(message,err)=>messages.push({message,err}),
    loadMonth:async()=>{rendered.push('load')},
    renderDay:day=>rendered.push(day),
    rpc:async(name,args)=>{assert.equal(name,'admin_correct_event');writes.push(args);if(failOut&&args.p_new_type==='OUT')throw Error('simulated server failure');return {ok:true}}
  });
  vm.runInContext(script,context);
  await context.addAttendance('2026-10-12');
  return {writes,messages,rendered,prompts};
}
let r=await run(['928','09:00','18:30','누락 정정']);
assert.deepEqual(r.writes.map(x=>x.p_new_type),['IN','OUT']);
assert.equal(r.writes[0].p_new_at,'2026-10-12 09:00:00');
assert.equal(r.writes[1].p_new_at,'2026-10-12 18:30:00');
assert.ok(r.messages.some(x=>/생성했습니다/.test(x.message)));
r=await run(['928','25:00','18:30','invalid']);
assert.equal(r.writes.length,0,'Invalid clock cannot write');
r=await run(['928','09:00','25:30','invalid']);
assert.equal(r.writes.length,0,'Invalid OUT cannot write partial IN');
r=await run(['928','18:00','01:00','2026-10-13','overnight']);
assert.equal(r.writes[1].p_new_at,'2026-10-13 01:00:00');
r=await run(['928','09:00','18:30','reason'],{failOut:true});
assert.equal(r.writes.length,2);
assert.ok(r.messages.some(x=>/출근 기록만 저장/.test(x.message)),'Partial write must not falsely claim success');
r=await run(['928',null]);
assert.equal(r.writes.length,0,'Cancelled entry cannot write');
console.log('PASS manual attendance: valid HH:MM writes IN/OUT, invalid times no writes, overnight, cancellation, partial failure');
