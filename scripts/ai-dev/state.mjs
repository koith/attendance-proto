// Pure execution state policy; strings/CI success alone cannot confer acceptance.
export const STATES = ['READY','IN_PROGRESS','CODE_VERIFIED','MERGED','DEPLOYED','ACCEPTED'];
export function transition(current, next, {verified = false, reason, resumeState} = {}) {
  if (![...STATES,'BLOCKED'].includes(current) || ![...STATES,'BLOCKED'].includes(next))
    throw Error('INVALID_STATE');
  if (current === next) return current;
  if (next === 'BLOCKED') {
    if (!reason?.trim()) throw Error('BLOCK_REASON_REQUIRED');
    return next;
  }
  if (current === 'BLOCKED') {
    if (!STATES.includes(resumeState) || next !== resumeState) throw Error('INVALID_RESUME_STATE');
    return next;
  }
  if (next === 'IN_PROGRESS') return next;
  if (STATES.indexOf(next) !== STATES.indexOf(current) + 1) throw Error('INVALID_TRANSITION');
  if (next !== 'IN_PROGRESS' && !verified) throw Error('INDEPENDENT_EVIDENCE_REQUIRED');
  return next;
}
