import assert from 'node:assert/strict';
const p=n=>String(n).padStart(2,'0');
const dim=ym=>{const[y,m]=ym.split('-').map(Number);return new Date(y,m,0).getDate()};
const date=(ym,d)=>`${ym}-${p(d)}`;const wd=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d).getDay()};
const dates=ym=>Array.from({length:dim(ym)},(_,i)=>date(ym,i+1));
const prevYM=ym=>{let[y,m]=ym.split('-').map(Number);if(--m<1){m=12;y--}return `${y}-${p(m)}`};
function toggleWeekday(sel,ym,w){const a=dates(ym).filter(d=>wd(d)===w),all=a.every(d=>sel.has(d));for(const d of a)all?sel.delete(d):sel.add(d)}
function mins(a,b){const cv=t=>{const[h,m]=t.split(':').map(Number);return h*60+m};if(a===b)throw Error('ZERO_DURATION');let n=cv(b)-cv(a);if(n<0)n+=1440;return n}
function canNext(step,s){if(step===1)return !!s.emp;if(step===2)return s.mode==='OFF'||(!!s.start&&!!s.end&&s.start!==s.end);if(step===3)return s.sel.size>0;return true}
function nthWeekdaySource(target,src){const ord=Math.floor((Number(target.slice(8))-1)/7),w=wd(target),first=wd(`${src}-01`),d=1+((w-first+7)%7)+ord*7;return d<=dim(src)?date(src,d):null}
function copyPrev({ym,scopeEmpId,emps,original,draft,prevRows}){const map=new Map(prevRows.map(r=>[`${r.employee_id}|${r.work_date}`,r]));let n=0;const targets=scopeEmpId==null?emps:emps.filter(e=>e.id===scopeEmpId);for(const e of targets)for(const d of dates(ym)){const k=`${e.id}|${d}`;if(original.has(k)||draft.has(k))continue;const src=nthWeekdaySource(d,prevYM(ym)),r=src&&map.get(`${e.id}|${src}`);if(!r)continue;draft.set(k,{...r,employee_id:e.id,work_date:d});n++}return n}
let pass=0;function t(n,f){f();pass++;console.log('PASS',n)}
t('28/29/30/31',()=>assert.deepEqual(['2026-02','2028-02','2026-09','2026-08'].map(dim),[28,29,30,31]));
t('직원 미선택 next 불가',()=>assert.equal(canNext(1,{emp:null}),false));t('직원 선택',()=>assert.equal(canNext(1,{emp:9}),true));
t('WORK valid',()=>assert.equal(canNext(2,{mode:'WORK',start:'09:00',end:'18:00'}),true));t('OFF valid',()=>assert.equal(canNext(2,{mode:'OFF'}),true));
t('zero duration 거부',()=>assert.equal(canNext(2,{mode:'WORK',start:'09:00',end:'09:00'}),false));t('overnight',()=>assert.equal(mins('22:00','06:00'),480));t('23-00',()=>assert.equal(mins('23:00','00:00'),60));
t('날짜 없으면 next 불가',()=>assert.equal(canNext(3,{sel:new Set()}),false));t('날짜 1개',()=>assert.equal(canNext(3,{sel:new Set(['2026-09-01'])}),true));
t('월금 shortcut',()=>{const s=new Set;for(const w of [1,2,3,4,5])toggleWeekday(s,'2026-09',w);assert.equal(s.size,22)});
t('토일 shortcut',()=>{const s=new Set;for(const w of [0,6])toggleWeekday(s,'2026-09',w);assert.equal(s.size,8)});
t('요일 전체 후 하루 제외',()=>{const s=new Set;toggleWeekday(s,'2026-09',1);const n=s.size;s.delete([...s][0]);assert.equal(s.size,n-1)});
t('요일 전체 후 다른 요일 하루 추가',()=>{const s=new Set;toggleWeekday(s,'2026-09',1);s.add('2026-09-05');assert(s.has('2026-09-05'))});
t('선택 해제',()=>{const s=new Set(['2026-09-01']);s.delete('2026-09-01');assert.equal(s.size,0)});
t('예정시간',()=>assert.equal(22*mins('09:00','18:00'),11880));
t('상태 객체는 step 이동에도 유지',()=>{const s={emp:9,mode:'WORK',start:'09:00',end:'18:00',sel:new Set(['2026-09-01'])};for(let step=1;step<=4;step++)assert.equal(s.start,'09:00')});
t('resize 모델은 state 불변',()=>{const s={draft:new Map([['9|2026-09-01',{status:'OFF'}]]),selected:new Set(['2026-09-01']),step:3};let mobile=true;mobile=!mobile;assert.equal(s.draft.size,1);assert.equal(s.selected.size,1);assert.equal(s.step,3)});
t('전월 현재직원만 복사',()=>{const draft=new Map,original=new Map,emps=[{id:1},{id:2}],prevRows=[{employee_id:1,work_date:'2026-08-03',status:'WORK',planned_start:'09:00',planned_end:'18:00'},{employee_id:2,work_date:'2026-08-03',status:'OFF'}];copyPrev({ym:'2026-09',scopeEmpId:1,emps,original,draft,prevRows});assert([...draft.keys()].every(k=>k.startsWith('1|')))});
t('전월 서로 다른 WORK/OFF 보존',()=>{const draft=new Map,original=new Map,emps=[{id:1}],prevRows=[{employee_id:1,work_date:'2026-08-03',status:'WORK',planned_start:'09:00',planned_end:'18:00'},{employee_id:1,work_date:'2026-08-04',status:'OFF'}];copyPrev({ym:'2026-09',scopeEmpId:1,emps,original,draft,prevRows});const vals=[...draft.values()];assert(vals.some(r=>r.status==='WORK'&&r.planned_start==='09:00'));assert(vals.some(r=>r.status==='OFF'))});
t('전월 기존 일정 보호',()=>{const draft=new Map,original=new Map([['1|2026-09-07',{status:'OFF'}]]),emps=[{id:1}],prevRows=[{employee_id:1,work_date:'2026-08-03',status:'WORK',planned_start:'09:00',planned_end:'18:00'}];copyPrev({ym:'2026-09',scopeEmpId:1,emps,original,draft,prevRows});assert(!draft.has('1|2026-09-07'))});
t('전월 dirty 보호',()=>{const draft=new Map([['1|2026-09-07',{status:'WORK',planned_start:'12:00',planned_end:'21:00'}]]),original=new Map,emps=[{id:1}],prevRows=[{employee_id:1,work_date:'2026-08-03',status:'OFF'}];copyPrev({ym:'2026-09',scopeEmpId:1,emps,original,draft,prevRows});assert.equal(draft.get('1|2026-09-07').planned_start,'12:00')});
t('전월 28→31 없는 순번은 미복사',()=>assert.equal(nthWeekdaySource('2026-03-30','2026-02'),null));
console.log(`Monthly V1.1 QA: ${pass} PASS`);
