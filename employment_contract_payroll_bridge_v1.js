/* Quick Fix Pack 6: keep legacy payroll cache aligned with authoritative hourly contract saves. */
(()=>{
  if(window.__baekeokContractPayrollBridgeV1)return;
  window.__baekeokContractPayrollBridgeV1=true;

  const baseContractSet=BE.contractSet;
  BE.contractSet=async function(args){
    const r=await baseContractSet(args);
    if(!r?.ok || args?.p_payroll_type!=='HOURLY')return r;

    const fields={wage:args.p_hourly_wage};
    if(args.p_tax_treatment==='BUSINESS_INCOME' && args.p_business_deduction_rate!=null){
      fields.tax_rate=args.p_business_deduction_rate;
    }

    try{
      await rpc('admin_update_employee',{p_id:S.employeeId,p_fields:fields});
    }catch(e){
      console.error('[contract-payroll-bridge]',e);
      setTimeout(()=>toast('계약은 저장됐지만 급여 연동을 확인해주세요.',true),180);
    }
    return r;
  };
})();
