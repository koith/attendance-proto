// MTG-03: server-derived weekly payout evidence must not be silently coerced to 0.
// Keep in lockstep with server-sync-sheet/payroll_policy.mjs verifiedWeeklySource.
(function(root){
"use strict";
function verifiedReviewAmount(pay,key){
 if(!/^20\d{2}-(?:0[1-9]|1[0-2])-[0-3]\d$/.test(String(key||"")))return null;
 const data=pay?.weeklyCalculatedAmounts;
 if(data&&Object.prototype.hasOwnProperty.call(data,key)){
  const raw=data[key];
  if(raw===null||raw===undefined||typeof raw==="boolean"||
    (typeof raw==="string"&&!/^\d+$/.test(raw)))return null;
  const n=Number(raw);
  return Number.isSafeInteger(n)&&n>=0?n:null;
 }
 const reasons=Array.isArray(pay?.weeklyReviewComments)?pay.weeklyReviewComments:[];
 return reasons.some(x=>String(x).startsWith(key+":"))?0:null;
}
root.weeklyApprovalSourceAmount=verifiedReviewAmount;
})(typeof window!=="undefined"?window:globalThis);
