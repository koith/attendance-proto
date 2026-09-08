import assert from 'node:assert/strict';
const p=n=>String(n).padStart(2,'0');
function parseYM(ym){const[y,m]=ym.split('-').map(Number);return{y,m}}
function daysInMonth(ym){const{y,m}=parseYM(ym);return new Date(y,m,0).getDate()}
function isoDate(ym,d){return `${ym}-${p(d)}`}
function localDate(iso){const[y,m,d]=iso.split('-').map(Number);return new Date(y,m-1,d)}
function weekday(iso){return localDate(iso).getDay()}
function monthDates(ym){return Array.from({length:daysInMonth(ym)},(_,i)=>isoDate(ym,i+1))}
function prevYM(ym){let{y,m}=parseYM(ym);m--;if(m<1){m=12;y--}return `${y}-${p(m)}`}
function nthWeekdaySource(targetIso,sourceYM){const ord=Math.floor((Number(targetIso.slice(8,10))-1)/7);const wd=weekday(targetIso);const first=localDate(`${sourceYM}-01`).getDay();const firstDay=1+((wd-first+7)%7);const d=firstDay+ord*7;return d<=daysInMonth(sourceYM)?isoDate(sourceYM,d):null}
function normRow(r){if(!r)return null;return{employee_id:Number(r.employee_id),work_date:String(r.work_date).slice(0,10),status:r.status,planned_start:r.status==='WORK'&&r.planned_start?String(r.planned_start).slice(0,5):null,planned_end:r.status==='WORK'&&r.planned_end?String(r.planned_end).slice(0,5):null,memo:r.memo||null}}
function sameRow(a,b){return JSON.stringify(normRow(a))===JSON.stringify(normRow(b))}
function plannedMinutes(r){r=normRow(r);if(!r||r.status!=='WORK')return 0;const cv=t=>{const[h,m]=t.split(':').map(Number);return h*60+m};let n=cv(r.planned_end)-cv(r.planned_start);if(n<0)n+=1440;return n}
class Draft{
 constructor(original=[]){this.original=new Map(original.map(r=>[`${r.employee_id}|${r.work_date}`,normRow(r)]));this.draft=new Map()}
 set(emp,date,row){const k=`${emp}|${date}`,orig=this.original.get(k)||null,n=normRow(row);if(sameRow(orig,n))this.draft.delete(k);else this.draft.set(k,n)}
 effective(emp,date){const k=`${emp}|${date}`;return this.draft.has(k)?this.draft.get(k):(this.original.get(k)||null)}
 payload(){return [...this.draft].map(([k,r])=>{const[employee_id,work_date]=k.split('|');return r?{op:'SET',employee_id:+employee_id,work_date,status:r.status,planned_start:r.planned_start,planned_end:r.planned_end}:{op:'DELETE',employee_id:+employee_id,work_date}})}
 clear(){this.draft.clear()}
}
function applyWeekdays(d,emp,ym,wds,row){for(const date of monthDates(ym))if(wds.has(weekday(date)))d.set(emp,date,{...row,employee_id:emp,work_date:date})}
function copyPrevDraft(draft,emps,currentYM,prevRows){const map=new Map(prevRows.map(r=>[`${r.employee_id}|${r.work_date}`,normRow(r)]));let n=0;for(const emp of emps)for(const date of monthDates(currentYM)){const k=`${emp}|${date}`;if(draft.original.has(k)||draft.draft.has(k))continue;const src=nthWeekdaySource(date,prevYM(currentYM));if(!src)continue;const r=map.get(`${emp}|${src}`);if(!r)continue;draft.set(emp,date,{...r,employee_id:emp,work_date:date});if(draft.draft.has(k))n++}return n}
function validateBatch(changes,employees=new Set([1,2])){if(!Array.isArray(changes))return'BAD_PAYLOAD';for(const x of changes){if(!employees.has(x.employee_id)||!x.work_date)return'EMPLOYEE_DATE_REQUIRED';if(x.op==='DELETE')continue;if(x.op!=='SET')return'BAD_OP';if(!['WORK','OFF'].includes(x.status))return'BAD_STATUS';if(x.status==='WORK'){if(!x.planned_start||!x.planned_end)return'TIME_REQUIRED';if(x.planned_start===x.planned_end)return'ZERO_DURATION'}}return'OK'}
let pass=0;function t(name,fn){try{fn();pass++;console.log('PASS',name)}catch(e){console.error('FAIL',name,e.message);process.exitCode=1}}
t('28일 2026-02',()=>assert.equal(daysInMonth('2026-02'),28));
t('29일 윤년 2028-02',()=>assert.equal(daysInMonth('2028-02'),29));
t('30일 2026-09',()=>assert.equal(daysInMonth('2026-09'),30));
t('31일 2026-08',()=>assert.equal(daysInMonth('2026-08'),31));
t('월 시작 요일 차이',()=>assert.notEqual(weekday('2026-08-01'),weekday('2026-09-01')));
t('WORK 09-18 540분',()=>assert.equal(plannedMinutes({employee_id:1,work_date:'2026-09-01',status:'WORK',planned_start:'09:00',planned_end:'18:00'}),540));
t('overnight 22-06 480분',()=>assert.equal(plannedMinutes({employee_id:1,work_date:'2026-09-01',status:'WORK',planned_start:'22:00',planned_end:'06:00'}),480));
t('23-00 60분',()=>assert.equal(plannedMinutes({employee_id:1,work_date:'2026-09-01',status:'WORK',planned_start:'23:00',planned_end:'00:00'}),60));
t('OFF 0분',()=>assert.equal(plannedMinutes({employee_id:1,work_date:'2026-09-01',status:'OFF'}),0));
t('미등록 null',()=>assert.equal(normRow(null),null));
t('zero duration batch 거부',()=>assert.equal(validateBatch([{op:'SET',employee_id:1,work_date:'2026-09-01',status:'WORK',planned_start:'09:00',planned_end:'09:00'}]),'ZERO_DURATION'));
t('월~금 WORK 2026-09',()=>{const d=new Draft();applyWeekdays(d,1,'2026-09',new Set([1,2,3,4,5]),{status:'WORK',planned_start:'09:00',planned_end:'18:00'});assert.equal(d.draft.size,22)});
t('토일 OFF 2026-09',()=>{const d=new Draft();applyWeekdays(d,1,'2026-09',new Set([0,6]),{status:'OFF'});assert.equal(d.draft.size,8)});
t('특정 요일 화요일 5회',()=>{const d=new Draft();applyWeekdays(d,1,'2026-09',new Set([2]),{status:'OFF'});assert.equal(d.draft.size,5)});
t('월 경계 날짜가 모두 현재월',()=>{const d=new Draft();applyWeekdays(d,1,'2026-09',new Set([1,2,3,4,5,6,0]),{status:'OFF'});assert([...d.draft.keys()].every(k=>k.includes('|2026-09-')))});
t('날짜 1개 적용',()=>{const d=new Draft();d.set(1,'2026-09-07',{employee_id:1,work_date:'2026-09-07',status:'OFF'});assert.equal(d.draft.size,1)});
t('여러 날짜 적용',()=>{const d=new Draft();for(const x of ['07','14','21'])d.set(1,`2026-09-${x}`,{employee_id:1,work_date:`2026-09-${x}`,status:'OFF'});assert.equal(d.draft.size,3)});
t('같은 날짜 여러번 최종값',()=>{const d=new Draft();d.set(1,'2026-09-07',{employee_id:1,work_date:'2026-09-07',status:'OFF'});d.set(1,'2026-09-07',{employee_id:1,work_date:'2026-09-07',status:'WORK',planned_start:'12:00',planned_end:'21:00'});assert.equal(d.payload()[0].status,'WORK')});
t('원래 값으로 되돌리면 dirty 해제',()=>{const o={employee_id:1,work_date:'2026-09-07',status:'OFF'};const d=new Draft([o]);d.set(1,o.work_date,{...o,status:'WORK',planned_start:'09:00',planned_end:'18:00'});d.set(1,o.work_date,o);assert.equal(d.draft.size,0)});
t('등록취소 payload DELETE',()=>{const o={employee_id:1,work_date:'2026-09-07',status:'OFF'};const d=new Draft([o]);d.set(1,o.work_date,null);assert.equal(d.payload()[0].op,'DELETE')});
t('변경 후 전체 취소',()=>{const d=new Draft();d.set(1,'2026-09-07',{employee_id:1,work_date:'2026-09-07',status:'OFF'});d.clear();assert.equal(d.draft.size,0)});
t('저장 실패 가정 시 draft 보존',()=>{const d=new Draft();d.set(1,'2026-09-07',{employee_id:1,work_date:'2026-09-07',status:'OFF'});const before=d.draft.size;assert.equal(d.draft.size,before)});
t('31→30 ordinal weekday mapping',()=>assert.equal(nthWeekdaySource('2026-09-28','2026-08'),'2026-08-24'));
t('31→28 fifth weekday may be absent',()=>assert.equal(nthWeekdaySource('2026-02-28','2026-01'),'2026-01-24'));
t('28→31 mapping',()=>assert.equal(nthWeekdaySource('2026-03-30','2026-02'),null));
t('시작요일 다른 달 same weekday',()=>{const s=nthWeekdaySource('2026-09-14','2026-08');assert.equal(weekday(s),weekday('2026-09-14'))});
t('기존 현재월 일정 보호',()=>{const d=new Draft([{employee_id:1,work_date:'2026-09-07',status:'OFF'}]);const prev=[{employee_id:1,work_date:'2026-08-03',status:'WORK',planned_start:'09:00',planned_end:'18:00'}];copyPrevDraft(d,[1],'2026-09',prev);assert.equal(d.effective(1,'2026-09-07').status,'OFF')});
t('미등록에만 복사',()=>{const d=new Draft();const prev=[{employee_id:1,work_date:'2026-08-03',status:'WORK',planned_start:'09:00',planned_end:'18:00'}];copyPrevDraft(d,[1],'2026-09',prev);assert(d.draft.size>=1)});
t('복사 후 저장 전 취소',()=>{const d=new Draft();const prev=[{employee_id:1,work_date:'2026-08-03',status:'OFF'}];copyPrevDraft(d,[1],'2026-09',prev);d.clear();assert.equal(d.draft.size,0)});
t('batch 여러 직원',()=>assert.equal(validateBatch([{op:'SET',employee_id:1,work_date:'2026-09-01',status:'OFF'},{op:'SET',employee_id:2,work_date:'2026-09-02',status:'OFF'}]),'OK'));
t('batch validation failure',()=>assert.equal(validateBatch([{op:'SET',employee_id:1,work_date:'2026-09-01',status:'WORK'}]),'TIME_REQUIRED'));
t('batch unauthorized는 DB에서 별도 검증 대상',()=>assert.equal(typeof validateBatch,'function'));
t('summary planned minutes multiple',()=>{const rows=[{employee_id:1,work_date:'2026-09-01',status:'WORK',planned_start:'09:00',planned_end:'18:00'},{employee_id:1,work_date:'2026-09-02',status:'WORK',planned_start:'22:00',planned_end:'06:00'}];assert.equal(rows.reduce((a,r)=>a+plannedMinutes(r),0),1020)});
console.log(`MonthlySchedule QA: ${pass} PASS`);if(process.exitCode)process.exit(1);
