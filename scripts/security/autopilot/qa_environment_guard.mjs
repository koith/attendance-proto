export function auditEnvDescriptor(rows){ if(!Array.isArray(rows))throw Error('DESCRIPTOR_INVALID'); return {count:rows.length}; }
