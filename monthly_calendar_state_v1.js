/* Monthly calendar state semantics: color is supplemental, not the only cue. */
function decorateCalendarStateSemantics(){
  const cal=document.querySelector('.calendar');
  if(cal){
    let legend=document.getElementById('calendarStateLegend');
    if(!legend){
      legend=document.createElement('div');
      legend.id='calendarStateLegend';
      legend.className='calendar-legend';
      legend.setAttribute('aria-label','달력 상태 안내');
      legend.innerHTML=`
        <span class="legend-item neutral"><i class="legend-swatch"></i>미등록</span>
        <span class="legend-item contract"><i class="legend-swatch"></i>계약일</span>
        <span class="legend-item saved"><i class="legend-swatch"></i>저장된 일정</span>
        <span class="legend-item selected"><i class="legend-swatch"></i>현재 선택</span>
        <span class="legend-item extra"><i class="legend-swatch"></i>계약 외 선택</span>`;
      const head=document.querySelector('.weekday-head');
      if(head)head.parentNode.insertBefore(legend,head);
      const note=document.createElement('div');
      note.className='calendar-legend-note';
      note.textContent='계약일은 계약상 정기 근무요일 표시이며, 실제 월간 일정은 별도로 저장됩니다.';
      legend.after(note);
    }
    document.querySelectorAll('.calday[data-date]').forEach(b=>{
      const selected=b.classList.contains('selected');
      const contract=b.classList.contains('contract-day');
      const extra=b.classList.contains('contract-extra');
      const saved=b.classList.contains('saved');
      b.setAttribute('aria-pressed',selected?'true':'false');
      const labels=[];
      if(contract)labels.push('계약일');
      if(saved)labels.push('저장된 일정');
      if(selected)labels.push(extra?'계약 외 선택':'선택됨');
      b.setAttribute('aria-label',`${Number(b.dataset.date.slice(8))}일${labels.length?' · '+labels.join(' · '):''}`);
    });
  }
  document.querySelectorAll('.daycell[data-date]').forEach(b=>{
    b.setAttribute('aria-pressed',b.classList.contains('selected')?'true':'false');
  });
}
const calendarStateBaseRender=render;
render=function(){calendarStateBaseRender();requestAnimationFrame(decorateCalendarStateSemantics)};
requestAnimationFrame(decorateCalendarStateSemantics);
