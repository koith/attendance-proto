export function countReplayDelta(rows, originals = []) {
  if (!Array.isArray(rows) || !Array.isArray(originals)) throw Error('DELTA_INVALID');
  const originalIds = new Set();
  for (const original of originals) {
    const id = typeof original === 'string' ? original : original && typeof original === 'object' && !Array.isArray(original) ? original.id : undefined;
    if (typeof id !== 'string' || !id.trim()) throw Error('DELTA_INVALID');
    originalIds.add(id);
  }
  const ids = new Set();
  let previousTimestamp = -Infinity;
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row.id !== 'string' || !row.id.trim() || typeof row.timestamp !== 'string' || !Number.isFinite(Date.parse(row.timestamp)) || typeof row.originalEventId !== 'string' || !originalIds.has(row.originalEventId)) throw Error('DELTA_INVALID');
    if (ids.has(row.id)) throw Error('DELTA_DUPLICATE_ID');
    ids.add(row.id);
    const timestamp = Date.parse(row.timestamp);
    if (timestamp < previousTimestamp) throw Error('DELTA_OUT_OF_ORDER');
    previousTimestamp = timestamp;
  }
  return {count: rows.length};
}
