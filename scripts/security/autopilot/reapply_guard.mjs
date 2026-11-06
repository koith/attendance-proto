import {countReplayDelta} from './delta_guard.mjs';
import {isDeepStrictEqual} from 'node:util';

// SEC-S16: offline, synthetic-only rollback + incremental re-apply rehearsal.
// NEVER connects to an operating DB. Pure function over in-memory synthetic rows.
//
// Model: after a backup was taken, new attendance events ("deltas") were recorded.
// A rollback restores the backup `baseline`. We must re-apply the post-backup deltas
// onto that baseline with: no duplicates, no loss, stable order, original immutability,
// atomic failure (all-or-nothing), and idempotency (re-running yields the same state).

function freeze(row) {
  // Isolate the rehearsal from input mutation, including nested event metadata.
  const copy = structuredClone(row);
  return Object.freeze(copy);
}

function keyOf(row) {
  // identity for an attendance event in the rehearsal
  return row.id;
}

export function reapplyDeltas(baseline, deltas, originals = []) {
  if (!Array.isArray(baseline)) throw Error('BASELINE_INVALID');

  // Validate baseline rows and build the restored state (post-rollback snapshot).
  const state = new Map();
  for (const row of baseline) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string' || !row.id.trim()) {
      throw Error('BASELINE_INVALID');
    }
    if (state.has(row.id)) throw Error('BASELINE_DUPLICATE_ID');
    state.set(row.id, freeze({...row}));
  }

  // Validate the delta set itself via the existing delta_guard (reuse, no reimplementation).
  // Throws DELTA_INVALID / DELTA_DUPLICATE_ID / DELTA_OUT_OF_ORDER on malformed input.
  countReplayDelta(deltas, originals);

  // Snapshot the baseline identity set BEFORE applying, to prove originals are untouched
  // and to enforce idempotency / collision rules.
  const baselineIds = new Set(state.keys());

  // Stage all mutations first (atomic: validate everything before committing any).
  const staged = [];
  const stagedIds = new Set();
  let reappliedNew = 0;
  let skippedIdempotent = 0;

  for (const delta of deltas) {
    const id = keyOf(delta);
    if (stagedIds.has(id)) {
      // duplicate within the same delta batch would double-apply
      throw Error('REAPPLY_DUPLICATE_IN_BATCH');
    }
    stagedIds.add(id);

    if (baselineIds.has(id)) {
      // An id already in the restored baseline. Idempotent only if content matches;
      // otherwise re-applying would silently overwrite original data -> reject.
      const existing = state.get(id);
      if (!sameEvent(existing, delta)) throw Error('REAPPLY_CONFLICT_ORIGINAL');
      skippedIdempotent++;
      continue; // nothing to add; original preserved
    }
    staged.push(delta);
  }

  // Commit staged mutations (all-or-nothing: any throw above left `state` unmodified).
  for (const delta of staged) {
    state.set(delta.id, freeze({...delta}));
    reappliedNew++;
  }

  // Integrity: every original baseline id still present and unchanged.
  for (const id of baselineIds) {
    if (!state.has(id)) throw Error('ORIGINAL_LOST'); // must never happen; defensive
  }

  const finalRows = [...state.values()];
  return {
    baseline_count: baseline.length,
    delta_count: deltas.length,
    reapplied_new: reappliedNew,
    skipped_idempotent: skippedIdempotent,
    final_count: finalRows.length,
    final_ids: finalRows.map(keyOf),
    // Return the complete reconstructed snapshot, not counts alone. Synthetic only.
    final_rows: structuredClone(finalRows)
  };
}

function sameEvent(a, b) {
  // Every field must match, including nested metadata; otherwise the same ID could
  // silently hide an altered event during replay.
  return isDeepStrictEqual(a, b);
}
