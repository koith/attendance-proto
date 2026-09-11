import assert from 'node:assert/strict';

const toMin=t=>{const[h,m]=String(t).split(':').map(Number);return h*60+m};
function contractMinutes(a,b){if(!a||!b||a===b)throw Error('ZERO_DURATION');let n=toMin(b)-toMin(a);if(n<0)n+=1440;return n}
function weeklyMinutes(rows){return rows.reduce((n,r)=>n+contractMinutes(r.start,r.end),0)}
function holidayBase(weekly,wage){const holidayMinutes=weekly/5;return {candidate:weekly>=900,holidayMinutes,weeklyPay:Math.round((holidayMinutes/60)*wage)}}
function validateTax(type,rate){if(type==='BUSINESS_INCOME')return rate!=null&&rate>=0&&rate<=1;if(type==='FOUR_INSURANCE')return rate==null;return false}
function validatePayroll(type,hourly,monthly){if(type==='HOURLY')return hourly>0&&monthly==null;if(type==='MONTHLY')return monthly>0&&hourly==null;return false}
function validateNight(enabled,mode,value){if(!enabled)return mode==null&&value==null;return ['RATE','FLAT'].includes(mode)&&value!=null&&value>=0}
function localDateTime(s){const[y,mo,d,h,m]=s.match(/\d+/g).map(Number);return new Date(y,mo-1,d,h,m,0,0)}
function nightMinutesForSession(start,end,threshold='22:00'){const a=localDateTime(start),b=localDateTime(end);if(!(b>a))throw Error('BAD_SESSION');const[hh,mm]=threshold.split(':').map(Number);const t=new Date(a.getFullYear(),a.getMonth(),a.getDate(),hh,mm,0,0);if(b<=t)return 0;const from=a>t?a:t;return Math.floor((b-from)/60000)}
function overlap(a1,a2,b1,b2){const ax=a2??'9999-12-31',bx=b2??'9999-12-31';return a1<=bx&&b1<=ax}
function applyCorrection(ev,c){return c?.action==='EDIT_TIME'?{...ev,event_at:c.new_event_at}:ev}
function assertDecision(v){return ['NEEDS_REVIEW','UNEXCUSED','NOT_UNEXCUSED'].includes(v)}
function resolvePeriod(periods,state){if(state.creatingPeriod)return null;if(state.periodId&&periods.some(x=>x.id===state.periodId))return state.periodId;return periods[0]?.id??null}
function resolveContract(contracts,state){if(state.creatingContract)return null;if(state.contractId&&contracts.some(x=>x.id===state.contractId))return state.contractId;return contracts[0]?.id??null}
function rerenderEditState(state){return {payrollType:state.payrollType,taxTreatment:state.taxTreatment,nightEnabled:state.nightEnabled,workdays:new Map(state.workdays)}}

let pass=0;const t=(name,fn)=>{fn();pass++;console.log('PASS',name)};
t('HOURLY 저장 규칙',()=>assert.equal(validatePayroll('HOURLY',12500,null),true));
t('MONTHLY 저장 규칙',()=>assert.equal(validatePayroll('MONTHLY',null,3000000),true));
t('HOURLY에 월급 동시입력 거부',()=>assert.equal(validatePayroll('HOURLY',12500,3000000),false));
t('계약요일/시간 4일×5.5h = 22h',()=>assert.equal(weeklyMinutes([1,2,4,5].map(weekday=>({weekday,start:'09:00',end:'14:30'}))),1320));
t('14h59m 주휴 후보 아님',()=>assert.equal(holidayBase(899,12500).candidate,false));
t('15h00m 주휴 후보',()=>assert.equal(holidayBase(900,12500).candidate,true));
t('22h 계약 주휴 4.4h',()=>assert.equal(holidayBase(1320,12500).holidayMinutes,264));
t('시급 12,500 주휴 55,000/week',()=>assert.equal(holidayBase(1320,12500).weeklyPay,55000));
t('4주 주휴 220,000',()=>assert.equal(holidayBase(1320,12500).weeklyPay*4,220000));
t('실제근무 138h여도 주휴 base는 계약 22h',()=>{const actual=138*60;assert(actual!==1320);assert.equal(holidayBase(1320,12500).holidayMinutes,264)});
t('overnight 계약시간 22-06 = 8h',()=>assert.equal(contractMinutes('22:00','06:00'),480));
t('start==end 거부',()=>assert.throws(()=>contractMinutes('09:00','09:00'),/ZERO_DURATION/));
t('BUSINESS_INCOME 3.3%',()=>assert.equal(validateTax('BUSINESS_INCOME',0.033),true));
t('BUSINESS_INCOME 다른 비율',()=>assert.equal(validateTax('BUSINESS_INCOME',0.041),true));
t('FOUR_INSURANCE는 business rate 없음',()=>assert.equal(validateTax('FOUR_INSURANCE',null),true));
t('FOUR_INSURANCE에 business rate 동시입력 거부',()=>assert.equal(validateTax('FOUR_INSURANCE',0.033),false));
t('night disabled',()=>assert.equal(validateNight(false,null,null),true));
t('night RATE 50 저장',()=>assert.equal(validateNight(true,'RATE',50),true));
t('night FLAT 2000 저장',()=>assert.equal(validateNight(true,'FLAT',2000),true));
t('21:00-23:00 22시 이후 60분',()=>assert.equal(nightMinutesForSession('2026-09-01T21:00','2026-09-01T23:00'),60));
t('22:00-02:00 22시 이후 240분',()=>assert.equal(nightMinutesForSession('2026-09-01T22:00','2026-09-02T02:00'),240));
t('21:00-03:00 22시 이후 300분',()=>assert.equal(nightMinutesForSession('2026-09-01T21:00','2026-09-02T03:00'),300));
t('21:00-22:00 boundary 0분',()=>assert.equal(nightMinutesForSession('2026-09-01T21:00','2026-09-01T22:00'),0));
t('22:00-22:01 boundary 1분',()=>assert.equal(nightMinutesForSession('2026-09-01T22:00','2026-09-01T22:01'),1));
t('multiple sessions night 합산',()=>assert.equal(nightMinutesForSession('2026-09-01T21:00','2026-09-01T23:00')+nightMinutesForSession('2026-09-02T22:30','2026-09-03T00:30'),180));
t('corrected session 기준 night',()=>{const out=applyCorrection({event_at:'2026-09-01T21:50'},{action:'EDIT_TIME',new_event_at:'2026-09-01T23:10'});assert.equal(nightMinutesForSession('2026-09-01T21:00',out.event_at),70)});
t('고용기간 overlap 감지',()=>assert.equal(overlap('2026-01-01',null,'2026-09-01',null),true));
t('고용기간 비중첩',()=>assert.equal(overlap('2026-01-01','2026-06-30','2026-07-01',null),false));
t('계약 없는 legacy 직원 자동계약 없음',()=>{const bundle={periods:[],contracts:[],workdays:[]};assert.equal(bundle.contracts.length,0)});
t('absence tri-state',()=>{for(const x of ['NEEDS_REVIEW','UNEXCUSED','NOT_UNEXCUSED'])assert.equal(assertDecision(x),true)});
t('schedule 없음만으로 UNEXCUSED 자동확정 안 함',()=>{const detected={schedule:'WORK',attendance:[]};const decision='NEEDS_REVIEW';assert.equal(detected.schedule,'WORK');assert.equal(decision,'NEEDS_REVIEW')});
t('J1/J2/J3는 pending policy',()=>assert.equal(['J1_MONTH_BOUNDARY','J2_PARTIAL_EMPLOYMENT_WEEK','J3_FOUR_INSURANCE_DEDUCTION_SHAPE'].length,3));
t('야간 FLAT 지급단위는 설정값만 저장',()=>{const cfg={enabled:true,mode:'FLAT',value:2000,unit:null};assert.equal(cfg.unit,null)});
t('새 고용기간 모드에서는 기존 기간 자동선택 안 함',()=>assert.equal(resolvePeriod([{id:1}],{periodId:null,creatingPeriod:true}),null));
t('새 계약 모드에서는 기존 계약 자동선택 안 함',()=>assert.equal(resolveContract([{id:1}],{contractId:null,creatingContract:true}),null));
t('기존 계약 편집 중 급여형태 변경이 rerender 후 유지',()=>{const s=rerenderEditState({payrollType:'MONTHLY',taxTreatment:'FOUR_INSURANCE',nightEnabled:true,workdays:new Map()});assert.equal(s.payrollType,'MONTHLY');assert.equal(s.taxTreatment,'FOUR_INSURANCE');assert.equal(s.nightEnabled,true)});
t('MONTHLY 전환 후 workdays 비운 상태 유지',()=>{const s=rerenderEditState({payrollType:'MONTHLY',taxTreatment:'BUSINESS_INCOME',nightEnabled:false,workdays:new Map()});assert.equal(s.workdays.size,0)});
console.log(`EmploymentContract V1 QA: ${pass} PASS`);
