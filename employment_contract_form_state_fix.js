/* Quick Fix Pack 1: preserve unsaved contract form values when segmented controls rerender the contract card. */
(()=>{
  const drafts=new Map();
  const ids=['hourlyWage','monthlySalary','businessRate','nightStart','nightMode','nightValue','contractMemo'];
  const originalRender=render;
  const contextKey=()=>[S.employeeId??'',S.periodId??'',S.creatingContract?'new':(S.contractId??'')].join(':');
  function capture(key){
    if(!key)return;
    const draft={};
    for(const id of ids){const node=el(id);if(node)draft[id]=node.value;}
    const night=el('nightEnabled');if(night)draft.nightEnabled=night.checked;
    if(Object.keys(draft).length)drafts.set(key,draft);
  }
  function restore(key){
    const draft=drafts.get(key);if(!draft)return;
    for(const id of ids){const node=el(id);if(node&&Object.prototype.hasOwnProperty.call(draft,id))node.value=draft[id];}
    const night=el('nightEnabled');
    if(night&&Object.prototype.hasOwnProperty.call(draft,'nightEnabled')){
      night.checked=!!draft.nightEnabled;
      S.nightEnabled=night.checked;
      el('nightFields')?.classList.toggle('hidden',!night.checked);
    }
    const mode=el('nightMode');if(mode)el('nightValueLabel').textContent=mode.value==='RATE'?'추가율 (%)':'정액 값 (원)';
  }
  render=function(){
    const app=el('app');
    capture(app?.dataset.contractFormContext||'');
    originalRender();
    const key=contextKey();
    const next=el('app');if(next)next.dataset.contractFormContext=key;
    restore(key);
  };
})();
