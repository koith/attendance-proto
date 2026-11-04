export function countReplayDelta(rows){ if(!Array.isArray(rows))throw Error('DELTA_INVALID'); return {count:rows.length}; }
