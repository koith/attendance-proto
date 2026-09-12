/* Actual attendance V1.1: correction overlay from effective session. Raw attendance remains immutable. */
(()=>{
  const originalRenderDay=renderDay;
  const dtValue=d=>d&&!isNaN(d)?`${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`:'';
  const wallValue=v=>String(v||'').replace('T',' ').slice(0,16)+':00';
  function closeCorrection(){document.getElementById('actualCorrectionVeil')?.remove()}
  function toastCorrection(msg,err=false){const t=el('toast');t.textContent=msg;t.className='toast show'+(err?' err':'');clearTimeout(toastCorrection.t);toastCorrection.t=setTimeout(()=>t.className='toast',2200)}
  function openCorrection(day,s){
    closeCorrection();
    const emp=S.employees.find(x=>Number(x.id)===Number(s.employee_id));
    const veil=document.createElement('div');veil.id='actualCorrectionVeil';veil.className='correction-veil';
    veil.innerHTML=`<div class="correction-modal" role="dialog" aria-modal="true" aria-label="근태 정정">
      <div class="correction-head"><div><b>${escapeHtml(emp?.name||'직원')} · 근태 정정</b><div>${day}</div></div><button id="correctionClose" aria-label="닫기">×</button></div>
      <div class="correction-note">원본 출퇴근 기록은 변경하지 않고 정정 이력을 추가합니다.</div>
      <label>출근</label><input id="correctionIn" type="datetime-local" value="${dtValue(s.in)}">
      <label>퇴근</label><input id="correctionOut" type="datetime-local" value="${dtValue(s.out)}">
      <label>정정 사유 <span>(필수)</span></label><input id="correctionReason" type="text" maxlength="120" placeholder="예: 마감 후 퇴근 누락">
      <div id="correctionPreview" class="correction-preview"></div>
      <button id="correctionSave" class="correction-save">정정 저장</button>
    </div>`;
    document.body.appendChild(veil);
    const inEl=el('correctionIn'),outEl=el('correctionOut'),save=el('correctionSave'),preview=el('correctionPreview');
    const refresh=()=>{const a=inEl.value?parseWall(wallValue(inEl.value)):null,b=outEl.value?parseWall(wallValue(outEl.value)):null;if(a&&b&&b<=a){preview.textContent='퇴근 시각은 출근 시각보다 늦어야 합니다.';preview.classList.add('bad');save.disabled=true}else{preview.textContent=a&&b?`예상 근무 ${dur((b-a)/1000)}`:'누락된 출근 또는 퇴근을 추가할 수 있습니다.';preview.classList.remove('bad');save.disabled=false}};
    inEl.oninput=refresh;outEl.oninput=refresh;refresh();
    el('correctionClose').onclick=closeCorrection;veil.onclick=e=>{if(e.target===veil)closeCorrection()};
    save.onclick=async()=>{
      const reason=el('correctionReason').value.trim();if(!reason)return toastCorrection('정정 사유를 입력하세요.',true);
      const nextIn=inEl.value?wallValue(inEl.value):null,nextOut=outEl.value?wallValue(outEl.value):null;
      if(!nextIn&&!nextOut)return toastCorrection('출근 또는 퇴근 시각을 입력하세요.',true);
      const a=nextIn?parseWall(nextIn):null,b=nextOut?parseWall(nextOut):null;if(a&&b&&b<=a)return toastCorrection('퇴근 시각을 확인하세요.',true);
      const calls=[];
      if(s.inId&&nextIn&&dtValue(s.in)!==inEl.value)calls.push({p_action:'EDIT_TIME',p_event_id:Number(s.inId),p_employee_id:Number(s.employee_id),p_new_at:nextIn,p_new_type:'IN',p_reason:reason});
      if(!s.inId&&nextIn)calls.push({p_action:'ADD',p_event_id:null,p_employee_id:Number(s.employee_id),p_new_at:nextIn,p_new_type:'IN',p_reason:reason});
      if(s.outId&&nextOut&&dtValue(s.out)!==outEl.value)calls.push({p_action:'EDIT_TIME',p_event_id:Number(s.outId),p_employee_id:Number(s.employee_id),p_new_at:nextOut,p_new_type:'OUT',p_reason:reason});
      if(!s.outId&&nextOut)calls.push({p_action:'ADD',p_event_id:null,p_employee_id:Number(s.employee_id),p_new_at:nextOut,p_new_type:'OUT',p_reason:reason});
      if(!calls.length)return toastCorrection('변경된 시각이 없습니다.',true);
      save.disabled=true;
      try{for(const args of calls)await rpc('admin_correct_event',args);closeCorrection();toastCorrection('근태 정정을 반영했습니다.');await loadMonth();renderDay(day)}catch(e){console.error('[actual-correction]',e);toastCorrection('정정을 저장하지 못했습니다.',true);save.disabled=false}
    };
  }
  renderDay=function(day){
    originalRenderDay(day);
    const ss=sessionsForDay(day);
    document.querySelectorAll('.sessions .session').forEach((row,i)=>{const s=ss[i];if(!s)return;const actions=document.createElement('div');actions.className='session-actions';actions.innerHTML='<button type="button" class="session-fix">정정</button>';actions.querySelector('button').onclick=()=>openCorrection(day,s);row.appendChild(actions)});
  };
})();