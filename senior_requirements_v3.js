/* Senior requirements V3: actual-work-first UX, live accrued payroll, admin contract-document deletion. */
(()=>{
  if(window.__seniorRequirementsV3)return;window.__seniorRequirementsV3=true;
  const style=document.createElement('style');style.id='seniorRequirementsV3Style';style.textContent=`.sch-line,.sch-prog,.sch-prog-sub{display:none!important}#payList .payroll-gross-label::after{content:' · 현재까지 누적';font-weight:500;color:var(--text-muted)}`;document.head.appendChild(style);

  // Senior direction: the default operational view is actual attendance, not planned schedule.
  // Keep WorkSchedule data intact; only remove it from the default attendance cards.

  // While somebody is working, refresh accrued hours/pay from corrected actual attendance.
  let liveBusy=false;
  const liveRefresh=async()=>{
    if(liveBusy||document.visibilityState!=='visible'||typeof drawPay!=='function')return;
    const list=document.getElementById('payList'),month=document.getElementById('payMonth');
    if(!list||!month||document.getElementById('addVeil')?.classList.contains('show'))return;
    liveBusy=true;try{await drawPay(month.value)}catch(e){console.warn('[senior-v3 live payroll]',e)}finally{liveBusy=false}
  };
  setInterval(liveRefresh,10000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')liveRefresh()});

  // Delete metadata first: a later storage failure can leave only an inaccessible orphan file,
  // never a visible DB document record whose underlying file has already disappeared.
  if(typeof openDocsModal==='function'&&typeof BE!=='undefined'){
    const legacyOpenDocsModal=openDocsModal;
    openDocsModal=async function(emp){
      const result=await legacyOpenDocsModal(emp);
      let patching=false,stopped=false;
      const patch=async()=>{
        if(patching||stopped)return;const box=document.getElementById('docList');if(!box){stopped=true;return}patching=true;
        try{
          const docs=await BE.docList(emp.id);const byPath=new Map((docs||[]).map(d=>[String(d.storage_path),d]));
          [...box.querySelectorAll('.row')].forEach(row=>{
            const open=row.querySelector('[data-open]'),d=byPath.get(String(open?.dataset.open||''));if(!d)return;
            row.querySelectorAll('[data-del]').forEach(x=>x.remove());
            if(row.querySelector('[data-admin-delete]'))return;
            const b=document.createElement('button');b.className='btn btn-danger btn-sm doc-del-btn';b.dataset.adminDelete=String(d.id);b.textContent='삭제';
            b.onclick=async()=>{
              if(!confirm('이 근로계약서 파일을 삭제할까요?\n\n관리자는 첨부 시점과 관계없이 삭제할 수 있습니다.'))return;
              b.disabled=true;
              try{
                const r=await BE.docDelete(d.id);if(!r?.ok)throw new Error(r?.error||'DOC_DELETE_FAILED');
                const storageOk=await BE.docRemove(d.storage_path);
                if(typeof toast==='function')toast(storageOk?'out':'err',storageOk?'삭제 완료':'삭제 완료 · 파일 정리 필요',storageOk?'근로계약서 파일을 삭제했습니다.':'문서 목록에서는 삭제됐지만 저장소 파일 정리가 필요합니다.');
                row.remove();
              }catch(e){console.error('[senior-v3 doc delete]',e);b.disabled=false;if(typeof toast==='function')toast('err','삭제 실패','문서 정보는 유지되었습니다. 다시 시도해주세요.')}
            };row.appendChild(b);
          });
        }catch(e){console.warn('[senior-v3 doc list]',e)}finally{patching=false}
      };
      const obs=new MutationObserver(()=>patch());const box=document.getElementById('docList');if(box){obs.observe(box,{childList:true,subtree:true});patch()}
      setTimeout(()=>{stopped=true;obs.disconnect()},120000);return result;
    };
  }
})();