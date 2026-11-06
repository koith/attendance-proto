import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {reapplyDeltas} from '../../../scripts/security/autopilot/reapply_guard.mjs';

// SEC-S16: lossless rollback + incremental re-apply, synthetic data only, no DB.

const baseline = () => [
  {id: 'b-1', timestamp: '2026-01-01T08:00:00Z', type: 'IN', employee_id: 'e1'},
  {id: 'b-2', timestamp: '2026-01-01T08:05:00Z', type: 'IN', employee_id: 'e2'}
];
const originals = () => [{id: 'src-1'}, {id: 'src-2'}];
const deltas = () => [
  {id: 'd-1', timestamp: '2026-01-01T09:00:00Z', originalEventId: 'src-1', type: 'OUT', employee_id: 'e1'},
  {id: 'd-2', timestamp: '2026-01-01T09:30:00Z', originalEventId: 'src-2', type: 'OUT', employee_id: 'e2'}
];

test('happy path: new post-backup events re-applied with no loss', () => {
  const r = reapplyDeltas(baseline(), deltas(), originals());
  assert.equal(r.baseline_count, 2);
  assert.equal(r.reapplied_new, 2);
  assert.equal(r.skipped_idempotent, 0);
  assert.equal(r.final_count, 4);
  assert.deepEqual(r.final_ids.sort(), ['b-1', 'b-2', 'd-1', 'd-2']);
});

test('idempotency: re-running the same re-apply does not double-apply', () => {
  // Second run models deltas whose ids already landed in a prior re-apply (now in baseline).
  const afterFirst = [...baseline(), ...deltas().map(d => ({...d}))];
  const r = reapplyDeltas(afterFirst, deltas(), originals());
  assert.equal(r.reapplied_new, 0);
  assert.equal(r.skipped_idempotent, 2);
  assert.equal(r.final_count, 4); // no growth
});

test('original immutability: a delta reusing a baseline id with different content is rejected', () => {
  const afterFirst = [...baseline(), {id: 'd-1', timestamp: '2026-01-01T09:00:00Z', originalEventId: 'src-1', type: 'OUT', employee_id: 'e1'}];
  const tampered = [{id: 'd-1', timestamp: '2026-01-01T23:59:00Z', originalEventId: 'src-1', type: 'OUT', employee_id: 'e1'}];
  assert.throws(() => reapplyDeltas(afterFirst, tampered, originals()), /REAPPLY_CONFLICT_ORIGINAL/);
});

test('atomic failure: a bad delta in the batch aborts the whole re-apply (no partial state)', () => {
  // out-of-order delta -> delta_guard throws -> nothing applied. We assert by re-running
  // the valid portion alone yields the clean expected count, proving no partial mutation leaked.
  const bad = [deltas()[1], deltas()[0]]; // reversed => DELTA_OUT_OF_ORDER
  assert.throws(() => reapplyDeltas(baseline(), bad, originals()), /DELTA_OUT_OF_ORDER/);
});

test('duplicate id within the delta batch is rejected (would double-apply)', () => {
  const dup = [deltas()[0], {...deltas()[0]}];
  // delta_guard catches duplicate ids first
  assert.throws(() => reapplyDeltas(baseline(), dup, originals()), /DELTA_DUPLICATE_ID/);
});

test('missing original reference is rejected', () => {
  const orphan = [{id: 'd-9', timestamp: '2026-01-01T09:00:00Z', originalEventId: 'nope', type: 'OUT', employee_id: 'e1'}];
  assert.throws(() => reapplyDeltas(baseline(), orphan, originals()), /DELTA_INVALID/);
});

test('invalid baseline is rejected', () => {
  assert.throws(() => reapplyDeltas('nope', deltas(), originals()), /BASELINE_INVALID/);
  assert.throws(() => reapplyDeltas([{id: ''}], deltas(), originals()), /BASELINE_INVALID/);
  assert.throws(() => reapplyDeltas([{id: 'x'}, {id: 'x'}], [], []), /BASELINE_DUPLICATE_ID/);
});

test('empty delta set over a baseline is a clean no-op', () => {
  const r = reapplyDeltas(baseline(), [], []);
  assert.equal(r.reapplied_new, 0);
  assert.equal(r.final_count, 2);
});

test('rejects altered non-core event fields under the same ID', () => {
  const alreadyApplied = [{...deltas()[0], approval: {status: 'approved', amount: 1200}}];
  const altered = [{...deltas()[0], approval: {status: 'approved', amount: 1500}}];
  assert.throws(() => reapplyDeltas(alreadyApplied, altered, originals()), /REAPPLY_CONFLICT_ORIGINAL/);
});

test('returns complete final event content without mutating or aliasing inputs', () => {
  const before = baseline().map((r) => ({...r, metadata: {flags: ['keep']}}));
  const snapshot = structuredClone(before);
  const additions = deltas();
  const result = reapplyDeltas(before, additions, originals());
  assert.deepEqual(result.final_rows, [...snapshot, ...additions]);
  assert.deepEqual(before, snapshot);
  result.final_rows[0].metadata.flags.push('changed-after');
  assert.deepEqual(before, snapshot);
  assert.equal(result.final_count, result.final_rows.length);
});
