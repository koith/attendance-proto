/* Server-authoritative payroll. Local development retains the legacy-only engine.
 * Production must not silently fall back to browser payroll if the server fails.
 * The report generator continues consuming the same row/session data contract.
 */
(()=>{
  if(window.__serverPayrollBridgeV1)return;
  if(typeof computeMonthPayroll!=="function"||!BE?.serverPayroll)return;
  window.__serverPayrollBridgeV1=true;
  const localOnly=computeMonthPayroll;
  function hydrateDate(value){
    if(!value)return null;
    if(value instanceof Date)return value;
    // The server returns Asia/Seoul wall-clock fields without an offset.
    return fromIso(value);
  }
  computeMonthPayroll=async function(ym){
    if(!LIVE)return localOnly(ym);
    const reply=await BE.serverPayroll(ym);
    if(!reply?.ok||!reply.result||!Array.isArray(reply.result.rows))
      throw new Error("SERVER_PAYROLL_INVALID_RESULT");
    const result=reply.result;
    for(const rec of result.rows){
      for(const s of rec.sessions||[]){
        if(s.in)s.in=hydrateDate(s.in);
        if(s.out)s.out=hydrateDate(s.out);
      }
    }
    window.__nightPayrollResult=result;
    window.__setServerPayrollResult?.(result);
    return result;
  };
})();
