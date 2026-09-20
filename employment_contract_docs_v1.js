/* Contract document integration V2: contract terms + contract document are edited in one form. */
(()=>{
  if(window.__baekeokContractDocsV2)return;
  window.__baekeokContractDocsV2=true;

  BE.contractDocs=(employeeId,contractId)=>rpc('admin_contract_doc_list',{p_employee_id:employeeId,p_contract_id:contractId});
  BE.unclassifiedDocs=employeeId=>rpc('admin_unclassified_doc_list',{p_employee_id:employeeId});
  BE.contractDocAdd=(employeeId,contractId,path,file)=>rpc('admin_contract_doc_add',{
    p_employee_id:employeeId,p_contract_id:contractId,p_storage_path:path,p_filename:file.name,
    p_content_type:file.type,p_byte_size:file.size
  });
  BE.contractDocDelete=id=>rpc('admin_doc_delete',{p_document_id:id});
  BE.contractDocUpload=async(path,file)=>{if(typeof testModeEnabled==='function'&&testModeEnabled())throw new Error('TEST_MODE_WRITE_BLOCKED');
    const r=await fetch(`${CONFIG.SUPABASE_URL}/storage/v1/object/employee-docs/${path}`,{
      method:'POST',headers:{apikey:CONFIG.SUPABASE_ANON_KEY,Authorization:`Bearer ${Auth.token}`,'Content-Type':file.type,'x-upsert':'false'},body:file
    });
    if(!r.ok)throw Error(`STORAGE_UPLOAD_FAILED:${r.status}`);
  };
  BE.contractDocRemove=async path=>{if(typeof testModeEnabled==='function'&&testModeEnabled())throw new Error('TEST_MODE_WRITE_BLOCKED');
    const r=await fetch(`${CONFIG.SUPABASE_URL}/storage/v1/object/employee-docs/${path}`,{
      method:'DELETE',headers:{apikey:CONFIG.SUPABASE_ANON_KEY,Authorization:`Bearer ${Auth.token}`}
    });
    return r.ok;
  };
  BE.contractDocUrl=async(path,expires=60)=>{
    const r=await fetch(`${CONFIG.SUPABASE_URL}/storage/v1/object/sign/employee-docs/${path}`,{
      method:'POST',headers:{apikey:CONFIG.SUPABASE_ANON_KEY,Authorization:`Bearer ${Auth.token}`,'Content-Type':'application/json'},
      body:JSON.stringify({expiresIn:expires})
    });
    if(!r.ok)throw Error(`SIGN_FAILED:${r.status}`);
    const d=await r.json();
    return `${CONFIG.SUPABASE_URL}/storage/v1${d.signedURL}`;
  };

  S.pendingContractFile=null;
  S.contractDocContext=null;
  S.contractDocPostSaveError=null;

  const baseMainCard=mainCard;
  const baseBindMain=bindMain;
  const baseContractSet=BE.contractSet;
  const baseSaveContract=saveContract;

  function contextKey(c){
    const period=S.pendingNewPeriod?'pending':(S.periodId??'none');
    return `${S.employeeId??'none'}:${period}:${c?.id??'new'}`;
  }
  function syncContext(c){
    const key=contextKey(c);
    if(S.contractDocContext!==key){S.contractDocContext=key;S.pendingContractFile=null;}
  }
  function pendingLabel(){
    return S.pendingContractFile
      ? `<div class="subcard compact pending-contract-doc"><div style="min-width:0;flex:1"><strong style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(S.pendingContractFile.name)}</strong><span class="hint">계약 저장 시 함께 첨부됩니다.</span></div><button type="button" class="btn" id="contractDocClear">취소</button></div>`
      : '';
  }
  function formPanel(c){
    return `<div class="contract-doc-area contract-doc-inline">
      <div class="history-title-row"><h3>근로계약서 <span id="contractDocRequired" class="required-alert" aria-label="계약서 첨부 필요">!</span></h3></div>
      ${c?'<div id="contractDocList"><div class="hint">첨부된 계약서 불러오는 중…</div></div>':''}
      <div id="contractDocPendingWrap">${pendingLabel()}</div>
      <input id="contractDocFile" type="file" accept="application/pdf,image/jpeg,image/png" hidden>
      <button type="button" class="btn full" id="contractDocPick">${c?'+ 계약서 추가/교체':'+ 계약서 선택'}</button>
      <details class="legacy-docs hidden" id="unclassifiedDocs"><summary>연결되지 않은 계약서</summary><div id="unclassifiedDocList"></div></details>
    </div>`;
  }

  mainCard=function(emp,p,c){
    syncContext(c);
    const html=baseMainCard(emp,p,c);
    if(!p)return html;
    const save='<button class="btn primary full save-main" id="saveContract">저장</button>';
    return html.includes(save)?html.replace(save,`${formPanel(c)}${save}`):html;
  };

  async function openDoc(path){
    try{window.open(await BE.contractDocUrl(path,60),'_blank','noopener')}catch(_){toast('계약서를 열지 못했습니다.',true)}
  }
  function docRow(d,allowDelete){
    const kb=Math.max(1,Math.round(Number(d.byte_size||0)/1024));
    return `<div class="subcard compact" data-doc-row="${d.id}"><div style="min-width:0;flex:1"><strong style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(d.filename)}</strong><span class="hint">${kb.toLocaleString()} KB</span></div><div class="actions"><button type="button" class="btn" data-doc-open="${d.id}">열기</button>${allowDelete?`<button type="button" class="btn" data-doc-delete="${d.id}">삭제</button>`:''}</div></div>`;
  }
  function bindRows(box,docs,allowDelete){
    if(!box)return;
    box.innerHTML=docs.length?docs.map(d=>docRow(d,allowDelete)).join(''):'<div class="hint">첨부된 계약서가 없습니다.</div>';
    box.querySelectorAll('[data-doc-open]').forEach(b=>b.onclick=()=>{const d=docs.find(x=>Number(x.id)===Number(b.dataset.docOpen));if(d)openDoc(d.storage_path)});
    if(allowDelete)box.querySelectorAll('[data-doc-delete]').forEach(b=>b.onclick=async()=>{
      const d=docs.find(x=>Number(x.id)===Number(b.dataset.docDelete));if(!d)return;
      if(!confirm(`${d.filename} 파일을 삭제할까요?`))return;
      try{
        const r=await BE.contractDocDelete(d.id);
        if(!r?.ok){
          const msg=r?.error==='TOO_OLD_TO_DELETE'?'현재 서버 정책상 업로드 후 24시간이 지나 삭제할 수 없습니다.':r?.error==='NOT_OWN_UPLOAD'?'현재 서버 정책상 업로드한 관리자만 삭제할 수 있습니다.':'계약서를 삭제하지 못했습니다.';
          return toast(msg,true);
        }
        const storageOk=await BE.contractDocRemove(r.storage_path);
        await loadDocPanels(currentContract());
        toast(storageOk?'계약서를 삭제했습니다.':'문서 목록은 삭제됐지만 저장소 파일 정리가 필요합니다.',!storageOk);
      }catch(_){toast('계약서를 삭제하지 못했습니다.',true)}
    });
  }
  function setDocAttention(missing){const x=el('contractDocRequired');if(x)x.hidden=!missing}
  async function loadDocPanels(c){
    if(!S.employeeId)return;
    try{
      if(c){const docs=await BE.contractDocs(S.employeeId,c.id);bindRows(el('contractDocList'),docs||[],true);setDocAttention(!(docs||[]).length&&!S.pendingContractFile)}
      else setDocAttention(!S.pendingContractFile)
      const legacy=await BE.unclassifiedDocs(S.employeeId),legacyBox=el('unclassifiedDocs');if(legacyBox)legacyBox.classList.toggle('hidden',!(legacy||[]).length);if((legacy||[]).length)bindRows(el('unclassifiedDocList'),legacy,false);
    }catch(_){
      if(el('contractDocList'))el('contractDocList').innerHTML='<div class="hint">계약서를 불러오지 못했습니다.</div>';
      if(el('unclassifiedDocList'))el('unclassifiedDocList').innerHTML='<div class="hint">기존 파일을 불러오지 못했습니다.</div>';
    }
  }
  function validateFile(file){
    if(!file)return '파일을 선택해주세요.';
    if(!['application/pdf','image/jpeg','image/png'].includes(file.type))return 'PDF/JPEG/PNG 파일만 첨부할 수 있습니다.';
    if(file.size<=0||file.size>10485760)return '파일은 10MB 이하만 첨부할 수 있습니다.';
    return null;
  }
  function refreshPending(){
    const box=el('contractDocPendingWrap');if(!box)return;
    box.innerHTML=pendingLabel();
    const clear=el('contractDocClear');if(clear)clear.onclick=()=>{S.pendingContractFile=null;refreshPending();setDocAttention(true)};
  }

  bindMain=function(c){
    baseBindMain(c);
    const pick=el('contractDocPick'),input=el('contractDocFile');
    if(pick&&input){
      pick.onclick=()=>input.click();
      input.onchange=()=>{
        const file=input.files?.[0];const err=validateFile(file);
        if(err){input.value='';return toast(err,true)}
        S.pendingContractFile=file;refreshPending();setDocAttention(false);input.value='';
      };
    }
    refreshPending();
    loadDocPanels(c);
  };

  BE.contractSet=async function(args){
    S.contractDocPostSaveError=null;
    const file=S.pendingContractFile;
    const r=await baseContractSet(args);
    if(!r?.ok||!file)return r;
    const err=validateFile(file);
    if(err){S.contractDocPostSaveError=err;return r;}
    const safeExt=file.type==='application/pdf'?'.pdf':file.type==='image/png'?'.png':'.jpg';
    const path=`${S.employeeId}/${Date.now()}_${Math.random().toString(36).slice(2,9)}${safeExt}`;
    try{
      await BE.contractDocUpload(path,file);
      const add=await BE.contractDocAdd(S.employeeId,Number(r.id),path,file);
      if(!add?.ok){await BE.contractDocRemove(path);throw Error(add?.error||'DOC_ADD_FAILED')}
      S.pendingContractFile=null;
    }catch(e){
      console.error('[contract-doc-save]',e);
      S.contractDocPostSaveError='계약은 저장됐지만 계약서 첨부에 실패했습니다. 계약 화면에서 다시 첨부해주세요.';
    }
    return r;
  };

  saveContract=async function(){
    await baseSaveContract();
    if(S.contractDocPostSaveError){const msg=S.contractDocPostSaveError;S.contractDocPostSaveError=null;setTimeout(()=>toast(msg,true),80)}
  };
})();
