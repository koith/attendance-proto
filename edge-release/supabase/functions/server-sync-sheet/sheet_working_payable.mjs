// Writer-only attendance display overlay.
// Use the same raw elapsed seconds the canonical payroll engine counted.
// Do not mutate its parity payload or calculate pay from formatted strings.
const pad=n=>String(n).padStart(2,'0');
const day=d=>d instanceof Date?
 `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`:'';
const clock=d=>d instanceof Date?
 `${pad(d.getHours())}:${pad(d.getMinutes())}`:'';
const duration=seconds=>{
 const minutes=Math.floor(Math.max(0,Math.round(Number(seconds)||0))/60);
 return `${pad(Math.floor(minutes/60))}:${pad(minutes%60)}`;
};
export function attendanceWithWorkingPayable(attendance,calculated){
 if(!attendance||!Array.isArray(attendance.rows)||!Array.isArray(calculated?.rows))
  throw new Error('WORKING_PAYABLE_SOURCE_REQUIRED');
 const working=new Map();
 for(const rec of calculated.rows){
  const completeSeconds=(rec.sessions||[]).filter(s=>s.status==='COMPLETE')
   .reduce((sum,s)=>sum+Math.max(0,Number(s.sec||0)),0);
  // Payroll already includes a live shift's elapsed seconds in rec.sec.
  // Until OUT, no completed-shift break deduction or bonus is applied.
  const unpaidTime=Math.max(0,Number(rec.sec||0)-completeSeconds);
  const live=(rec.sessions||[]).filter(s=>s.status==='WORKING'&&s.in instanceof Date);
  if(!live.length||unpaidTime<=0)continue;
  for(const s of live){
   const key=day(s.in)+'|'+String(rec.employee_name||'')+'|'+clock(s.in);
   const queue=working.get(key)||[];queue.push(unpaidTime/live.length);working.set(key,queue);
  }
 }
 return {...attendance,rows:attendance.rows.map(row=>{
  if(!Array.isArray(row)||row[3]!=='—')return row;
  const key=String(row[0])+'|'+String(row[1])+'|'+String(row[2]);
  const list=working.get(key);
  if(!list?.length)return row;
  const seconds=list.shift();
  // A one-session open day was previously mislabeled '정상' by the
  // attendance summary builder. Only the matched live session is relabeled.
  return row.map((cell,i)=>i===5?'근무중':i===10?duration(seconds):cell);
 })};
}
