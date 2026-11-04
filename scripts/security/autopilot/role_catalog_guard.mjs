export function summarizeRoleCatalog(rows){ if(!Array.isArray(rows)) throw Error('CATALOG_INVALID'); return {count:rows.length}; }
