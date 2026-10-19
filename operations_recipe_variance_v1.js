/* MTG-13: optional manager-entered usage reconciliation.
 * No POS sale counts, waste, service or physical measurements are inferred.
 * Full evidence must be provided explicitly; values are never written to stock.
 */
(function(){
"use strict";
function amount(value){
 const raw=String(value??"").trim();
 if(!/^(?:0|[1-9]\d{0,8})(?:\.\d{1,3})?$/.test(raw))
  throw Error("USAGE_OBSERVATION_REQUIRED");
 const number=Number(raw);
 if(!Number.isSafeInteger(Math.round(number*1000))||number>1e9)
  throw Error("USAGE_OBSERVATION_INVALID");
 return number;
}
function compareStoreRecipeUsage(expected,observations){
 if(!Array.isArray(expected)||!Array.isArray(observations)||
    !expected.length||expected.length>100||expected.length!==observations.length)
  throw Error("USAGE_VARIANCE_INCOMPLETE");
 const seen=new Set();
 return expected.map((part,i)=>{
  const row=observations[i],id=Number(part?.id),base=Number(part?.amount);
  if(!Number.isSafeInteger(id)||id<=0||seen.has(id)||!Number.isFinite(base)||
     base<=0||!part.name||!part.unit||!row||Number(row.id)!==id)
   throw Error("USAGE_VARIANCE_INVALID");
  seen.add(id);
  const observed=amount(row.observed),waste=amount(row.waste),service=amount(row.service);
  const tolerance=amount(row.tolerance);
  if(tolerance>100)throw Error("USAGE_TOLERANCE_RANGE");
  const expectedWithExtras=base+waste+service;
  if(!Number.isFinite(expectedWithExtras)||expectedWithExtras>1e12)
   throw Error("USAGE_VARIANCE_OVERFLOW");
  const delta=Math.round((observed-expectedWithExtras)*1000)/1000;
  const allowed=expectedWithExtras*tolerance/100;
  const status=Math.abs(delta)<=allowed+1e-9?"WITHIN":delta>0?"OVER":"UNDER";
  return {id,name:part.name,unit:part.unit,recipe:base,observed,waste,service,
   expected:expectedWithExtras,delta,tolerance,status};
 });
}
window.computeStoreRecipeVariance=compareStoreRecipeUsage;
})();