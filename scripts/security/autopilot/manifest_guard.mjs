// Pure offline check for encrypted logical DB recovery receipts; NEVER opens an operating DB.
export function checkManifest(receipt) {
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) throw Error('INVALID_MANIFEST');
  if (receipt.format !== 'attendance-privileged-data-escrow-v1') throw Error('UNEXPECTED_FORMAT');
  if (!Number.isSafeInteger(receipt.table_count) || receipt.table_count < 1) throw Error('INVALID_TABLE_COUNT');
  if (!receipt.data || typeof receipt.data !== 'object' || Array.isArray(receipt.data)) throw Error('DATA_MISSING');
  const tables=Object.entries(receipt.data);
  if (tables.length !== receipt.table_count || !tables.every(([,rows])=>Array.isArray(rows))) throw Error('TABLE_COUNT_MISMATCH');
  return {table_count:tables.length, row_count:tables.reduce((n,[,rows])=>n+rows.length,0)};
}
