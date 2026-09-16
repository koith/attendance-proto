/* Keep contract help text consistent with the implemented night-pay calculation. */
(()=>{
 const fix=()=>document.querySelectorAll('.policy').forEach(x=>{if(x.textContent.includes('기존 payroll 지급액에는 아직 합산하지 않습니다'))x.textContent='야간 시작·종료 시각과 계약의 정률/시간당 정액 값을 기준으로 실제 인정근무분의 야간수당을 계산해 세전 급여에 합산합니다.'});
 fix();new MutationObserver(fix).observe(document.body,{childList:true,subtree:true});
})();