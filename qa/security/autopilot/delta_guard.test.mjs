import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {countReplayDelta} from '../../../scripts/security/autopilot/delta_guard.mjs';

test('synthetic fixture', () => assert.deepEqual(countReplayDelta([]), {count: 0}));

test('validates synthetic event IDs, timestamp order, and original references', () => {
  const originals = [{id: 'source-1'}, {id: 'source-2'}];
  const events = [
    {id: 'delta-1', timestamp: '2026-01-01T09:00:00Z', originalEventId: 'source-1'},
    {id: 'delta-2', timestamp: '2026-01-01T09:01:00Z', originalEventId: 'source-2'}
  ];
  assert.deepEqual(countReplayDelta(events, originals), {count: 2});
  assert.throws(() => countReplayDelta([events[0], {...events[1], id: 'delta-1'}], originals), /DELTA_DUPLICATE_ID/);
  assert.throws(() => countReplayDelta([events[1], events[0]], originals), /DELTA_OUT_OF_ORDER/);
  assert.throws(() => countReplayDelta([{...events[0], originalEventId: 'missing'}], originals), /DELTA_INVALID/);
  assert.throws(() => countReplayDelta([{...events[0], originalEventId: undefined}], originals), /DELTA_INVALID/);
});
