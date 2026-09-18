/* Contract night allowance V1: persist explicit night end time. */
(()=>{
  if(window.__baekeokContractNightEndV1)return;window.__baekeokContractNightEndV1=true;
  if(typeof BE==='undefined'||typeof bindMain!=='function')return;
  BE.nightEndSet=(id,end)=>rpc('admin_contract_night_end_set',{p_contract_id:id,p_night_allowance_end:end});
  const baseBind=bindMain,baseSet=BE.contractSet,baseSaveContract=saveContract;
  S.nightEndPostSaveError=null;
  let draft=null,draftKey='';
  const key=c=>`${S.employeeId||0}:${S.periodId||0}:${c?.id||'new'}`;
  bindMain=function(c){baseBind(c);const k=key(c);if(k!==draftKey){draftKey=k;draft=null}const start=el('nightStart');if(!start||el('nightEnd'))return;const field=document.createElement('div');field.className='field';field.innerHTML=`<label>야간 종료</label><input id="nightEnd" type="time" value="${draft||String(c?.night_allowance_end||'06:00').slice(0,5)}">`;start.closest('.field')?.after(field);const input=el('nightEnd');if(input)input.addEventListener('input',()=>{draft=input.value})};
  BE.contractSet=async function(args){const end=el('nightEnd')?.value||'06:00';S.nightEndPostSaveError=null;const r=await baseSet(args);if(r?.ok&&r.id){try{const n=await BE.nightEndSet(Number(r.id),end);if(!n?.ok)throw Error(n?.error||'NIGHT_END_SAVE_FAILED');draft=null}catch(e){console.error('[contract-night-end-save]',e);S.nightEndPostSaveError='계약은 저장됐지만 야간 종료시간 저장에 실패했습니다. 계약 화면에서 종료시간을 확인하고 다시 저장해주세요.'}}return r};
  saveContract=async function(...args){await baseSaveContract.apply(this,args);if(S.nightEndPostSaveError){const msg=S.nightEndPostSaveError;S.nightEndPostSaveError=null;setTimeout(()=>toast(msg,true),80)}};
})();