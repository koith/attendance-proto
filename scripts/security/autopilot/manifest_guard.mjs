import {createHash} from 'node:crypto';

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function assertJsonValue(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (typeof value !== 'object' || ancestors.has(value)) throw Error('INVALID_ROW');
  const array = Array.isArray(value);
  if (array ? Object.getPrototypeOf(value) !== Array.prototype : !isPlainObject(value)) throw Error('INVALID_ROW');
  ancestors.add(value);
  const keys = Reflect.ownKeys(value);
  if (array) {
    if (keys.length !== value.length + 1 || !keys.includes('length')) throw Error('INVALID_ROW');
    for (let index = 0; index < value.length; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw Error('INVALID_ROW');
      assertJsonValue(descriptor.value, ancestors);
    }
  } else {
    for (const key of keys) {
      if (typeof key !== 'string') throw Error('INVALID_ROW');
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw Error('INVALID_ROW');
      assertJsonValue(descriptor.value, ancestors);
    }
  }
  ancestors.delete(value);
}


// Pure offline check for encrypted logical DB recovery receipts; NEVER opens an operating DB.
export function checkManifest(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) throw Error('INVALID_MANIFEST');
  if (receipt.format !== 'attendance-privileged-data-escrow-v1') throw Error('UNEXPECTED_FORMAT');
  if (!Number.isSafeInteger(receipt.table_count) || receipt.table_count < 1) throw Error('INVALID_TABLE_COUNT');
  if (!receipt.data || typeof receipt.data !== 'object' || Array.isArray(receipt.data)) throw Error('DATA_MISSING');
  const tables = Object.entries(receipt.data);
  const ids = new Set();
  for (const [id, rows] of tables) {
    if (!/^[A-Za-z_][A-Za-z0-9_$]*\.[A-Za-z_][A-Za-z0-9_$]*$/.test(id)) throw Error('INVALID_TABLE_ID');
    const normalizedId = id.toLowerCase();
    if (ids.has(normalizedId)) throw Error('DUPLICATE_TABLE_ID');
    ids.add(normalizedId);
    if (!Array.isArray(rows)) throw Error('TRUNCATED_ROWS');
    assertJsonValue(rows);
    for (let index = 0; index < rows.length; index++) {
      if (!isPlainObject(rows[index])) throw Error('INVALID_ROW');
    }
  }
  if (tables.length !== receipt.table_count) throw Error('TABLE_COUNT_MISMATCH');

  for (const field of ['timestamp', 'created_at', 'generated_at']) {
    if (Object.hasOwn(receipt, field)) {
      const value = receipt[field];
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) throw Error('INVALID_TIMESTAMP');
      const parsed = Date.parse(value);
      if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== (value.includes('.') ? value : value.replace('Z', '.000Z'))) throw Error('INVALID_TIMESTAMP');
    }
  }

  for (const [field, validate] of [
    ['table_row_counts', (value, rows) => Number.isSafeInteger(value) && value >= 0 && value === rows.length],
    ['table_digests', (value, rows) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) && value === createHash('sha256').update(JSON.stringify(rows)).digest('hex')]
  ]) {
    if (Object.hasOwn(receipt, field)) {
      const metadata = receipt[field];
      if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) throw Error(`INVALID_${field.toUpperCase()}`);
      const entries = Object.entries(metadata);
      if (entries.length !== tables.length || entries.some(([id]) => !Object.hasOwn(receipt.data, id))) throw Error(`INVALID_${field.toUpperCase()}`);
      for (const [id, rows] of tables) {
        if (!Object.hasOwn(metadata, id) || !validate(metadata[id], rows)) throw Error(field === 'table_digests' ? 'TABLE_DIGEST_MISMATCH' : 'TRUNCATED_ROWS');
      }
    }
  }

  return {table_count: tables.length, row_count: tables.reduce((count, [, rows]) => count + rows.length, 0)};
}
