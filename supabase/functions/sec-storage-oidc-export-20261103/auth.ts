// Exact, immutable GitHub Actions OIDC binding for the single approved backup workflow.
// Data-plane read is gated by jwtVerify() in index.ts before this predicate.
export const IMMUTABLE_SUB='repo:koith@48688331/attendance-proto@1346210224:ref:refs/heads/main';
export const WORKFLOW_REF='koith/attendance-proto/.github/workflows/sec-storage-oidc-export-20261103.yml@refs/heads/main';
export const AUDIENCE='attendance-storage-escrow-20261103';
export const NOT_AFTER=Date.parse('2026-11-03T12:30:00Z');
export function permittedClaims(p:Record<string,unknown>, now=Date.now()):boolean{
 return now<NOT_AFTER &&
   p.sub===IMMUTABLE_SUB &&
   p.repository==='koith/attendance-proto' &&
   String(p.repository_id)==='1346210224' &&
   p.repository_owner==='koith' &&
   String(p.repository_owner_id)==='48688331' &&
   p.ref==='refs/heads/main' &&
   p.workflow_ref===WORKFLOW_REF &&
   p.event_name==='push' &&
   String(p.run_attempt)==='1' &&
   typeof p.run_id==='string' && /^\d{8,18}$/.test(p.run_id);
}
