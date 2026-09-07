// WorkSchedule V1 regression QA
// Mirrors the pure display/state rules used by index.html without DB/network access.
// Run: node qa_work_schedule.mjs

import assert from 'node:assert/strict';

function scheduleState(row) {
  if (!row) return { kind: 'UNREGISTERED', label: '근무 일정 미등록' };
  if (row.status === 'OFF') return { kind: 'OFF', label: '오늘 근무 예정 없음' };
  if (row.status !== 'WORK') throw new Error('BAD_STATUS');
  if (!row.planned_start || !row.planned_end) throw new Error('TIME_REQUIRED');
  if (row.planned_start === row.planned_end) throw new Error('ZERO_DURATION');
  return { kind: 'WORK', label: 'WORK' };
}

function toMin(t) {
  const [h, m] = String(t).split(':').map(Number);
  assert(Number.isInteger(h) && h >= 0 && h <= 23, `bad hour: ${t}`);
  assert(Number.isInteger(m) && m >= 0 && m <= 59, `bad minute: ${t}`);
  return h * 60 + m;
}

function plannedMinutes(start, end) {
  if (!start || !end) throw new Error('TIME_REQUIRED');
  if (start === end) throw new Error('ZERO_DURATION');
  let n = toMin(end) - toMin(start);
  if (end < start) n += 24 * 60; // index.html/schema_v13 invariant
  return n;
}

function progressPct(actualSeconds, start, end) {
  const plan = plannedMinutes(start, end) * 60;
  return Math.max(0, (actualSeconds / plan) * 100);
}

const tests = [
  ['미등록은 OFF와 구분', () => assert.equal(scheduleState(null).kind, 'UNREGISTERED')],
  ['명시적 OFF', () => assert.equal(scheduleState({ status: 'OFF' }).kind, 'OFF')],
  ['WORK 정상', () => assert.equal(scheduleState({ status: 'WORK', planned_start: '09:00', planned_end: '18:00' }).kind, 'WORK')],
  ['WORK 시각 필수', () => assert.throws(() => scheduleState({ status: 'WORK', planned_start: null, planned_end: '18:00' }), /TIME_REQUIRED/)],
  ['zero-duration 차단', () => assert.throws(() => scheduleState({ status: 'WORK', planned_start: '09:00', planned_end: '09:00' }), /ZERO_DURATION/)],
  ['주간 09-18 = 540분', () => assert.equal(plannedMinutes('09:00', '18:00'), 540)],
  ['overnight 22-06 = 480분', () => assert.equal(plannedMinutes('22:00', '06:00'), 480)],
  ['overnight 23:30-00:30 = 60분', () => assert.equal(plannedMinutes('23:30', '00:30'), 60)],
  ['경계 00:00-23:59 = 1439분', () => assert.equal(plannedMinutes('00:00', '23:59'), 1439)],
  ['progress 4h/8h = 50%', () => assert.equal(progressPct(4 * 3600, '09:00', '17:00'), 50)],
  ['overnight progress 4h/8h = 50%', () => assert.equal(progressPct(4 * 3600, '22:00', '06:00'), 50)],
  ['초과근무 progress >100 보존', () => assert.equal(progressPct(9 * 3600, '09:00', '17:00'), 112.5)],
  ['음수 actual은 0% 하한', () => assert.equal(progressPct(-1, '09:00', '17:00'), 0)],
];

let pass = 0;
for (const [name, fn] of tests) {
  try { fn(); pass++; console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}: ${e.message}`); process.exitCode = 1; }
}
console.log(`WorkSchedule QA: ${pass}/${tests.length} PASS`);
if (pass !== tests.length) process.exitCode = 1;
