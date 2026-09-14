# 2026-09-13 actual attendance + payroll UX hotfix

- actual attendance RPC path now owns token refresh and retries authenticated RPCs after 401/403/JWT expiry signals.
- actual attendance runtime cache version bumped to `20260913f` for iPhone Safari.
- payroll cards are gross-first: `세전 급여` is the dominant value; work time, hourly wage, base, allowance, and net are compact supporting data.
- attendance/payroll issue count badges are removed from payroll cards; anomaly state is expressed by warning color on the card/name while necessary contract issue text stays compact.
- no payroll formula, attendance data, contract data, or DB schema is modified.
