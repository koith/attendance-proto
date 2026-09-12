/* Contract document V1: documents belong to a specific employment contract; legacy employee-only files remain unclassified. */
(()=>{
  if(window.__baekeokContractDocsV1)return;
  window.__baekeokContractDocsV1=true;

  BE.contractDocs=(employeeId,contractId)=>rpc('admin_contract_doc_list',{p_employee_id:employeeId,p_contract_id:contractId});
  BE.unclassifiedDocs=employeeId=>rpc('admin_unclassified_doc_list',{p_employee_id:employeeId});
  BE.contractDocAdd=(employeeId,contractId,path,file)=>rpc('admin_contract_doc_add',{
    p_employee_id:employeeId,p_contract_id:contractId,p_storage_path:path,p_filename:file.name,
    p_content_type:file.type,p_byte_size:file.size
  });
  BE.contractDocDelete=id=>rpc('admin_doc_delete',{p_document_id:id});
  BE.contractDocUpload=async(path,file)=>{
    const r=await fetch(`${CONFIG.SUPABASE_URL}/storage/v1/object/employee-docs/${path}`,{
      method:'POST',headers:{apikey:CONFIG.SUPABASE_ANON_KEY,Authorization:`Bearer ${Auth.token}`,'Content-Type':file.type,'x-upsert':'false'},body:file
    });
    if(!r.ok)throw Error(`STORAGE_UPLOAD_FAILED:${r.status}`);
  };
  BE.contractDocRemove=async path=>{
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

  const baseHistoryCard=historyCard;
  const baseBindHistory=bindHistory;

  function docsPanel(){
    if(S.historyMode!=='periodDetail'||S.creatingPeriod||S.pendingNewPeriod)return'';
    const c=currentContract();
    const contractBox=c?`<div class="contract-doc-block">
      <div class="history-title-row"><h3>근로계약서</h3><span class="hint">${escapeHtml(c.effective_from)}${c.effective_to?' ~ '+escapeHtml(c.effective_to):''}</span></div>
      <div id="contractDocList"><div class="hint">계약서 불러오는 중…</div></div>
      <input id="contractDocFile" type="file" accept="application/pdf,image/jpeg,image/png" hidden>
      <button class="btn full" id="contractDocPick">+ 계약서 첨부</button>
    </div>`:'<div class="hint">계약조건을 선택하면 해당 계약의 계약서를 관리할 수 있습니다.</div>';
    return `<div class="contract-doc-area">${contractBox}
      <details class="legacy-docs"><summary>기존 미분류 계약서</summary><div id="unclassifiedDocList"><div class="hint">불러오는 중…</div></div></details>
    </div>`;
  }

  historyCard=function(p,c){
    const html=baseHistoryCard(p,c);
    const panel=docsPanel();
    if(!panel)return html;
    return html.replace('</div>\n    </section>',`${panel}</div>\n    </section>`);
  };

  async function openDoc(path){
    try{window.open(await BE.contractDocUrl(path,60),'_blank','noopener')}catch(e){toast('계약서를 열지 못했습니다.',true)}
  }
  function docRow(d,allowDelete){
    const kb=Math.max(1,Math.round(Number(d.byte_size||0)/1024));
    return `<div class="subcard compact" data-doc-row="${d.id}"><div style="min-width:0;flex:1"><strong style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(d.filename)}</strong><span class="hint">${kb.toLocaleString()} KB</span></div><div class="actions"><button class="btn" data-doc-open="${d.id}">열기</button>${allowDelete?`<button class="btn" data-doc-delete="${d.id}">삭제</button>`:''}</div></div>`;
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
          const msg=r?.error==='TOO_OLD_TO_DELETE'?'현재 서버 정책상 업로드 후 24시간이 지나 삭제할 수 없습니다.':r?.error==='NOT_OWN_UPLOAD'?'업로드한 관리자만 삭제할 수 있습니다.':'계약서를 삭제하지 못했습니다.';
          return toast(msg,true);
        }
        await BE.contractDocRemove(r.storage_path);
        await loadDocPanels();toast('계약서를 삭제했습니다.');
      }catch(e){toast('계약서를 삭제하지 못했습니다.',true)}
    });
  }
  async function loadDocPanels(){
    if(S.historyMode!=='periodDetail'||!S.employeeId)return;
    const c=currentContract();
    try{
      if(c){const docs=await BE.contractDocs(S.employeeId,c.id);bindRows(el('contractDocList'),docs||[],true)}
      const legacy=await BE.unclassifiedDocs(S.employeeId);bindRows(el('unclassifiedDocList'),legacy||[],false);
    }catch(e){
      if(el('contractDocList'))el('contractDocList').innerHTML='<div class="hint">계약서를 불러오지 못했습니다.</div>';
      if(el('unclassifiedDocList'))el('unclassifiedDocList').innerHTML='<div class="hint">기존 파일을 불러오지 못했습니다.</div>';
    }
  }

  bindHistory=function(p){
    baseBindHistory(p);
    if(S.historyMode!=='periodDetail'||S.pendingNewPeriod)return;
    const pick=el('contractDocPick'),input=el('contractDocFile');
    if(pick&&input){
      pick.onclick=()=>input.click();
      input.onchange=async()=>{
        const file=input.files?.[0],c=currentContract();if(!file||!c)return;
        if(!['application/pdf','image/jpeg','image/png'].includes(file.type))return toast('PDF/JPEG/PNG 파일만 첨부할 수 있습니다.',true);
        if(file.size<=0||file.size>10485760)return toast('파일은 10MB 이하만 첨부할 수 있습니다.',true);
        pick.disabled=true;
        const safeExt=file.type==='application/pdf'?'.pdf':file.type==='image/png'?'.png':'.jpg';
        const path=`${S.employeeId}/${Date.now()}_${Math.random().toString(36).slice(2,9)}${safeExt}`;
        try{
          await BE.contractDocUpload(path,file);
          const r=await BE.contractDocAdd(S.employeeId,c.id,path,file);
          if(!r?.ok){await BE.contractDocRemove(path);throw Error(r?.error||'DOC_ADD_FAILED')}
          await loadDocPanels();toast('계약서를 첨부했습니다.');
        }catch(e){toast('계약서를 첨부하지 못했습니다.',true)}finally{pick.disabled=false;input.value=''}
      };
    }
    loadDocPanels();
  };
})();
