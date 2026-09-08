// WorkSchedule v62 regression QA
// Mirrors pure display/state rules used by index.html without DB/network access.
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

function scheduleSet(prev, status, start = null, end = null) {
  if (status === 'OFF') return { status: 'OFF', planned_start: null, planned_end: null };
  if (status !== 'WORK') throw new Error('BAD_STATUS');
  scheduleState({ status, planned_start: start, planned_end: end });
  return { ...(prev || {}), status, planned_start: start, planned_end: end };
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
  if (end < start) n += 24 * 60;
  return n;
}

function progressPct(actualSeconds, start, end) {
  const plan = plannedMinutes(start, end) * 60;
  return Math.max(0, (actualSeconds / plan) * 100);
}

function startOfLocalDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function openTodaySeconds(openInAt, now) {
  if (!openInAt) return 0;
  const from = Math.max(openInAt.getTime(), startOfLocalDay(now).getTime());
  return Math.max(0, (now.getTime() - from) / 1000);
}

function actualTodaySeconds(completedSeconds, openInAt, now) {
  return Math.max(0, completedSeconds + openTodaySeconds(openInAt, now));
}

function operationalPunchState(openInAt) {
  return openInAt ? 'WORKING' : 'OFF';
}

function completedSeconds(sessions) {
  return sessions.filter(s => s.status === 'COMPLETE').reduce((sum, s) => sum + Math.max(0, s.sec || 0), 0);
}

function applyCorrections(events, corrections) {
  const corrByEvent = {};
  const added = [];
  for (const c of corrections || []) {
    if (c.action === 'ADD') { added.push(c); continue; }
    if (c.event_id != null) {
      const prev = corrByEvent[c.event_id];
      if (!prev || new Date(c.created_at) > new Date(prev.created_at)) corrByEvent[c.event_id] = c;
    }
  }
  const eff = [];
  for (const e of events || []) {
    const c = corrByEvent[e.id];
    if (c) {
      if (c.action === 'VOID') continue;
      eff.push({
        id: e.id,
        employee_id: e.employee_id,
        event_type: c.action === 'EDIT_TYPE' && c.new_event_type ? c.new_event_type : e.event_type,
        event_at: c.action === 'EDIT_TIME' && c.new_event_at ? c.new_event_at : e.event_at,
        corrected: true,
      });
    } else {
      eff.push({ id: e.id, employee_id: e.employee_id, event_type: e.event_type, event_at: e.event_at });
    }
  }
  for (const c of added) {
    eff.push({
      id: `add_${c.id}`,
      employee_id: c.employee_id,
      event_type: c.new_event_type,
      event_at: c.new_event_at,
      corrected: true,
      addedByAdmin: true,
    });
  }
  return eff;
}

const tests = [
  ['UNREGISTERED', () => assert.equal(scheduleState(null).kind, 'UNREGISTERED')],
  ['OFF', () => assert.equal(scheduleState({ status: 'OFF' }).kind, 'OFF')],
  ['WORK', () => assert.equal(scheduleState({ status: 'WORK', planned_start: '09:00', planned_end: '18:00' }).kind, 'WORK')],
  ['WORK→WORK', () => assert.deepEqual(scheduleSet({ status: 'WORK', planned_start: '09:00', planned_end: '18:00' }, 'WORK', '10:00', '19:00'), { status: 'WORK', planned_start: '10:00', planned_end: '19:00' })],
  ['WORK→OFF', () => assert.deepEqual(scheduleSet({ status: 'WORK', planned_start: '09:00', planned_end: '18:00' }, 'OFF'), { status: 'OFF', planned_start: null, planned_end: null })],
  ['OFF→WORK', () => assert.deepEqual(scheduleSet({ status: 'OFF' }, 'WORK', '09:00', '18:00'), { status: 'WORK', planned_start: '09:00', planned_end: '18:00' })],
  ['normal 09-18 = 540분', () => assert.equal(plannedMinutes('09:00', '18:00'), 540)],
  ['overnight 22-06 = 480분', () => assert.equal(plannedMinutes('22:00', '06:00'), 480)],
  ['23:30-00:30 = 60분', () => assert.equal(plannedMinutes('23:30', '00:30'), 60)],
  ['zero duration rejection', () => assert.throws(() => plannedMinutes('09:00', '09:00'), /ZERO_DURATION/)],
  ['progress 0%', () => assert.equal(progressPct(0, '09:00', '17:00'), 0)],
  ['progress 50%', () => assert.equal(progressPct(4 * 3600, '09:00', '17:00'), 50)],
  ['progress 100%', () => assert.equal(progressPct(8 * 3600, '09:00', '17:00'), 100)],
  ['progress >100%', () => assert.equal(progressPct(9 * 3600, '09:00', '17:00'), 112.5)],
  ['negative actual defense', () => assert.equal(progressPct(-1, '09:00', '17:00'), 0)],
  ['open IN started today', () => {
    const now = new Date(2026, 8, 8, 12, 0, 0); const open = new Date(2026, 8, 8, 10, 0, 0);
    assert.equal(openTodaySeconds(open, now), 2 * 3600);
  }],
  ['previous-day open IN clipped at today 00:00', () => {
    const now = new Date(2026, 8, 8, 3, 0, 0); const open = new Date(2026, 8, 7, 22, 0, 0);
    assert.equal(openTodaySeconds(open, now), 3 * 3600);
  }],
  ['no double counting after clipping', () => {
    const now = new Date(2026, 8, 8, 12, 0, 0); const open = new Date(2026, 8, 8, 10, 0, 0);
    assert.equal(actualTodaySeconds(2 * 3600, open, now), 4 * 3600);
  }],
  ['Operational Punch State previous-day open IN stays WORKING', () => assert.equal(operationalPunchState(new Date(2026, 8, 7, 22)), 'WORKING')],
  ['multiple completed session semantics preserved', () => assert.equal(completedSeconds([{ status:'COMPLETE', sec:3600 }, { status:'COMPLETE', sec:1800 }, { status:'WORKING', sec:999 }]), 5400)],
  ['correction/effective VOID preserved', () => assert.deepEqual(applyCorrections(
    [{ id:1, employee_id:7, event_type:'IN', event_at:'2026-09-08T09:00:00' }, { id:2, employee_id:7, event_type:'OUT', event_at:'2026-09-08T18:00:00' }],
    [{ id:10, action:'VOID', event_id:2, created_at:'2026-09-08T19:00:00' }]
  ).map(x=>x.id), [1])],
  ['correction/effective EDIT_TIME preserved', () => assert.equal(applyCorrections(
    [{ id:1, employee_id:7, event_type:'IN', event_at:'2026-09-08T09:00:00' }],
    [{ id:11, action:'EDIT_TIME', event_id:1, new_event_at:'2026-09-08T09:15:00', created_at:'2026-09-08T19:00:00' }]
  )[0].event_at, '2026-09-08T09:15:00')],
  ['correction/effective ADD preserved', () => {
    const x=applyCorrections([], [{ id:12, action:'ADD', employee_id:7, new_event_type:'OUT', new_event_at:'2026-09-08T18:00:00', created_at:'2026-09-08T19:00:00' }])[0];
    assert.equal(x.id, 'add_12'); assert.equal(x.addedByAdmin, true); assert.equal(x.event_type, 'OUT');
  }],
];

let pass = 0;
for (const [name, fn] of tests) {
  try { fn(); pass++; console.log(`PASS ${name}`); }
  catch (e) { console.error(`FAIL ${name}: ${e.message}`); process.exitCode = 1; }
}
console.log(`WorkSchedule v62 QA: ${pass}/${tests.length} PASS`);
if (pass !== tests.length) process.exitCode = 1;
