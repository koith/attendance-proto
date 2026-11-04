export function checkAuthConfigMetadata(rows){ if(!Array.isArray(rows))throw Error('CONFIG_INVALID'); return {count:rows.length}; }
