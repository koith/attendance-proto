/* Baekeok HQ-only store onboarding. This panel never grants rights on its own:
   all mutations are verified by PostgreSQL HQ policies or Edge JWT auth. */
(function(){
"use strict";
const entryUrl=id=>location.origin+location.pathname+"?mode=store&store="+encodeURIComponent(id)+"#pos";
const escapeHTML=value=>String(value??"").replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
async function rpc(fn,args={}){
  if(!Auth.token)throw Error("LOGIN_REQUIRED");
  const response=await fetch(CONFIG.SUPABASE_URL+"/rest/v1/rpc/"+fn,{
    method:"POST",headers:{apikey:CONFIG.SUPABASE_ANON_KEY,
      Authorization:"Bearer "+Auth.token,"Content-Type":"application/json"},
    body:JSON.stringify(args)
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw Error(data?.message||data?.error||fn+" "+response.status);
  return data;
}
async function invite(email,store_id){
  if(!Auth.token)throw Error("LOGIN_REQUIRED");
  const response=await fetch(CONFIG.SUPABASE_URL+"/functions/v1/server-sync-sheet",{
    method:"POST",headers:{Authorization:"Bearer "+Auth.token,"Content-Type":"application/json"},
    body:JSON.stringify({mode:"invite_store_manager",email,store_id})
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok||data?.ok!==true)throw Error(data?.error||"INVITE_FAILED");
  return data;
}
// Readiness export contains no PINs or owner emails. Keep all 283 registered
// stores, regardless of the current filtered HQ picker, so a single CSV is
// usable as a nationwide rollout checklist. Data comes only from HQ RPCs.
const readinessCsvCell=value=>{
  let text=String(value??"");
  // Excel/Sheets interpret leading = + - @ (also after whitespace) as
  // formulas. Prefix an apostrophe before RFC 4180 CSV quoting.
  if(/^\s*[=+\-@]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
};
const readinessCsv=(stores,proofs,sampleCounts)=>{
  const header=["지점ID","지점명","코드","지역","운영상태","실재확인","이메일확인점주수","샘플직원수","개통가능여부","미완료조건"];
  const rows=[header];
  for(const store of stores){
    const id=Number(store.id);
    const proof=proofs.find(item=>Number(item.store_id)===id);
    const sample=Number(sampleCounts.find(item=>Number(item.store_id)===id)?.sample_employee_count||0);
    const owners=Number(store.manager_count||0);
    const verified=id===1||proof?.decision==="VERIFIED";
    const isReady=store.onboarding_status==="READY";
    const blockers=[];
    if(!isReady){
      if(!verified)blockers.push("본사 실재 확인");
      if(owners<1)blockers.push("인증 점주 계정");
      if(sample>0)blockers.push("샘플·데모 직원 검토");
    }
    rows.push([id,store.name||"",store.code||"",store.region_group||"",
      store.onboarding_status||"UNKNOWN",id===1?"기존 운영점":proof?.decision||"미확인",
      owners,sample,isReady?"운영 중":blockers.length?"아니오":"예",blockers.join(" / ")]);
  }
  return "\uFEFF"+rows.map(row=>row.map(readinessCsvCell).join(",")).join("\r\n")+"\r\n";
};
window.mountHqStoreOnboarding=async function(box){
  if(!box||!box.isConnected)return;
  const section=document.createElement("section");
  section.id="hqStoreOnboarding";
  section.style.cssText="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)";
  section.innerHTML='<h3 style="font-size:1.05rem;margin:0 0 8px">백억커피 전국 지점 운영</h3>'+
    '<p style="font-size:.8rem;color:var(--text-muted);margin:0 0 10px">지점을 선택해 점주와 운영 상태를 관리합니다.</p>'+
    '<div id="hqOnboardingBody" aria-live="polite">지점 정보를 불러오는 중…</div>';
  box.appendChild(section);
  const body=section.querySelector("#hqOnboardingBody");
  let stores=[],managers=[],proofs=[],sampleCounts=[],primaryOwners=[],selected=1,busy=false,searchTerm="",statusFilter="ALL";
  const message=(title,detail)=>{if(typeof toast==="function")toast("in",title,detail);};
  const err=error=>{if(typeof toast==="function")toast("err","지점 설정 실패",String(error?.message||error));};
  async function refresh(){
    // Never render READY or export an eligible rollout from a partial/malformed HQ response.
    const result=await Promise.all([rpc("hq_stores_onboarding_list"),rpc("hq_store_manager_list"),rpc("hq_store_provenance_list"),rpc("hq_store_sample_roster_counts"),rpc("hq_store_primary_owner_list")]);
    if(!result.every(Array.isArray))throw Error("HQ_ONBOARDING_INVALID_RESPONSE");
    [stores,managers,proofs,sampleCounts,primaryOwners]=result;
    if(!stores.some(s=>Number(s.id)===selected))selected=Number(stores[0]?.id||1);
    render();
  }
  async function act(work,notice){
    if(busy)return;
    busy=true;
    try{await work();await refresh();message("지점 관리",notice);}
    catch(e){err(e);}
    finally{busy=false;}
  }
  function render(){
    if(!section.isConnected)return;
    const store=stores.find(s=>Number(s.id)===selected);
    const list=managers.filter(m=>Number(m.store_id)===selected);
    const primaryOwnerId=primaryOwners.find(o=>Number(o.store_id)===selected)?.user_id;
    const ready=store?.onboarding_status==="READY";
    const proof=proofs.find(p=>Number(p.store_id)===selected);
    const verified=selected===1||proof?.decision==="VERIFIED";
    const sampleEmployeeCount=Number(sampleCounts.find(x=>Number(x.store_id)===selected)?.sample_employee_count||0);
    const canActivate=selected===1||(verified&&Number(store?.manager_count||0)>0&&sampleEmployeeCount===0);
    const sampleStoreCount=sampleCounts.filter(x=>Number(x.sample_employee_count)>0).length;
    const sampleTotal=sampleCounts.reduce((n,x)=>n+Number(x.sample_employee_count||0),0);
    const readyCount=stores.filter(s=>s.onboarding_status==="READY").length;
    const stagedCount=stores.filter(s=>s.onboarding_status==="STAGED").length;
    const suspendedCount=stores.filter(s=>s.onboarding_status==="SUSPENDED").length;
    body.innerHTML=
      '<style>#hqStoreOnboarding .hq-compact-card{border:1px solid var(--border);border-radius:14px;padding:12px;margin:12px 0}#hqStoreOnboarding .hq-compact-card h4{font-size:.95rem;margin:0 0 10px}#hqStoreOnboarding .hq-compact-card .field{margin:8px 0}#hqStoreOnboarding .hq-actions{display:flex;gap:8px;flex-wrap:wrap}#hqStoreOnboarding .hq-actions .btn{min-height:40px}#hqStoreOnboarding .hq-hint{font-size:.75rem;color:var(--text-muted);margin:6px 0}#hqStoreOnboarding .hq-manager-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:10px 0;border-bottom:1px solid var(--border)}#hqStoreOnboarding .hq-manager-email{flex:1 1 180px;min-width:0;overflow-wrap:anywhere}#hqStoreOnboarding .hq-manager-row .btn{flex:0 0 auto}@media(max-width:520px){#hqStoreOnboarding .hq-actions .btn{flex:1 1 130px}#hqStoreOnboarding .hq-compact-card{padding:10px}#hqStoreOnboarding .hq-manager-email{flex-basis:100%}}</style>'+
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:9px">'+
        '<div><div id="hqStoreCounts" style="font-size:.84rem">등록 '+stores.length+'곳 · 운영 '+readyCount+' · 준비 '+stagedCount+' · 중지 '+suspendedCount+'</div>'+ 
        '<div id="hqSampleRosterSummary" style="font-size:.75rem;color:var(--text-muted)">점검할 초기 직원 '+sampleTotal+'명 · '+sampleStoreCount+'개 지점</div></div>'+
        '<div style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" id="hqStoreReadinessExport" class="btn btn-secondary btn-sm">개통 준비 현황 CSV</button><button type="button" id="hqStoreRefresh" class="btn btn-secondary btn-sm">정보 새로고침</button></div></div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px">'+
        '<div class="field"><label for="hqOnboardingSearchInput">지점명·코드·지역 검색</label>'+
          '<input id="hqOnboardingSearchInput" class="form-control" type="search" autocomplete="off" placeholder="예: 송도점" value="'+escapeHTML(searchTerm)+'"></div>'+
        '<div class="field"><label for="hqStoreStatusFilter">운영 상태 필터</label>'+
          '<select id="hqStoreStatusFilter" class="form-control">'+
          '<option value="ALL"'+(statusFilter==="ALL"?' selected':'')+'>전체</option>'+
          '<option value="READY"'+(statusFilter==="READY"?' selected':'')+'>운영 중</option>'+
          '<option value="STAGED"'+(statusFilter==="STAGED"?' selected':'')+'>준비 중</option>'+
          '<option value="SUSPENDED"'+(statusFilter==="SUSPENDED"?' selected':'')+'>일시중지</option>'+
          '</select></div></div>'+
      '<div class="field"><label for="hqOnboardingStore">대상 지점 <span id="hqStoreSearchCount"></span></label>'+
        '<select id="hqOnboardingStore" class="form-control"></select></div>'+
      '<div class="hq-hint">선택한 지점: <strong>'+escapeHTML(store?.name||"없음")+'</strong></div>'+
      '<div class="hq-compact-card" id="hqManagerCard"><h4>점주 관리</h4>'+
      '<div class="hq-hint">대표 점주: <strong>'+escapeHTML(list.find(m=>m.user_id===primaryOwnerId)?.email||"미지정")+'</strong> · 등록 '+list.length+'명</div>'+
      '<div class="field"><label for="hqManagerEmail">점주 로그인 이메일</label><input id="hqManagerEmail" class="form-control" type="email" autocomplete="off" placeholder="owner@example.com"></div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 12px">'+
      '<button type="button" class="btn btn-secondary btn-sm" id="hqManagerAssign">기존 계정에 점주 권한 부여</button>'+
      '<button type="button" class="btn btn-primary btn-sm" id="hqManagerInvite">신규 점주 이메일 초대</button></div>'+
      '<div class="hq-hint">가입된 계정은 연결, 신규 계정은 초대 메일을 발송합니다.</div>'+
      '<div style="margin:10px 0">'+(list.length?list.map(m=>
        '<div class="hq-manager-row"><span class="hq-manager-email">'+
        escapeHTML(m.email)+(primaryOwnerId===m.user_id?' <strong style="color:var(--brand-700)">· 대표 점주</strong>':'')+'</span>'+
        (primaryOwnerId!==m.user_id?'<button type="button" class="btn btn-secondary btn-sm" data-primary-assign="'+escapeHTML(m.user_id)+'">대표 지정</button>':'')+
        (primaryOwnerId===m.user_id?'<span style="font-size:.72rem;color:var(--text-muted)">대표 교체 후 해제 가능</span>':
          '<button type="button" class="btn btn-secondary btn-sm" data-owner-revoke="'+escapeHTML(m.user_id)+'">권한 해제</button>')+'</div>').join(""):
        '<div class="hq-hint">등록된 점주가 없습니다. 이메일로 계정을 연결하거나 초대하세요.</div>')+'</div></div>'+
      '<details class="hq-compact-card" id="hqStoreOperations"><summary style="cursor:pointer;font-weight:600">운영 상태 · 실재 확인 <span style="font-size:.75rem;color:var(--text-muted)">('+escapeHTML(store?.onboarding_status||"UNKNOWN")+')</span></summary>'+
      '<div class="hq-hint">실재 확인: '+escapeHTML(selected===1?"기존 운영점":proof?.decision||"미확인")+' · 인증 점주 '+Number(store?.manager_count||0)+'명</div>'+
      (sampleEmployeeCount>0?'<div id="hqSampleRosterBlocker" role="status" class="hq-hint">개통 전 샘플 직원 '+sampleEmployeeCount+'명 확인 필요 (자동 삭제하지 않음)</div>':'')+
      '<div class="field"><label for="hqStoreEvidence">공식 확인 근거</label><input class="form-control" id="hqStoreEvidence" type="text" maxlength="2000" placeholder="확인 자료 URL 또는 본사 확인 기록 (15자 이상)"></div>'+
      '<div class="hq-actions"><button type="button" class="btn btn-secondary btn-sm" id="hqStoreVerify"'+(selected===1?' disabled':'')+'>확인 승인</button>'+
      '<button type="button" class="btn btn-secondary btn-sm" id="hqStoreReject"'+(selected===1||ready?' disabled':'')+'>확인 반려</button></div>'+
      (proof?.evidence_reference?'<div class="hq-hint" style="overflow-wrap:anywhere">최근 근거: '+escapeHTML(proof.evidence_reference)+'</div>':'')+
      '<div class="hq-actions" style="margin-top:10px"><button type="button" class="btn btn-primary btn-sm" id="hqStoreReady"'+(ready||!canActivate?' disabled':'')+'>운영 활성화</button>'+
      '<button type="button" class="btn btn-secondary btn-sm" id="hqStoreSuspend"'+(Number(selected)===1?' disabled':'')+'>운영 일시중지</button>'+
      (ready?'<a class="btn btn-secondary btn-sm" id="hqStoreLink" href="'+escapeHTML(entryUrl(selected))+'" target="_blank" rel="noopener noreferrer">지점 페이지 열기</a>':'')+'</div>'+
      (ready?'<div class="field"><label for="hqStoreShareUrl">지점 공유 주소</label><input id="hqStoreShareUrl" class="form-control" type="text" readonly value="'+escapeHTML(entryUrl(selected))+'"></div>':'')+
      '</details>'+
      '<details style="margin-top:14px"><summary style="cursor:pointer;font-weight:600">새 지점 등록</summary>'+
      '<div style="display:grid;gap:8px;padding-top:10px">'+
      '<input class="form-control" id="hqNewStoreName" placeholder="지점명 (예: 백억커피 ○○점)">'+
      '<input class="form-control" id="hqNewStoreCode" placeholder="고유 코드 (영문·숫자·밑줄)">'+
      '<input class="form-control" id="hqNewStoreRegion" placeholder="지역 (선택)">'+
      '<button type="button" class="btn btn-secondary btn-sm" id="hqNewStoreCreate">준비 상태로 등록</button>'+
      '</div></details>';
    const storePicker=body.querySelector("#hqOnboardingStore");
    const updateChoices=()=>{
      const needle=searchTerm.trim().toLocaleLowerCase("ko-KR");
      const rows=stores.filter(s=>
        (statusFilter==="ALL"||s.onboarding_status===statusFilter)&&
        (!needle||[s.name,s.code,s.region_group,s.id].some(v=>String(v??"").toLocaleLowerCase("ko-KR").includes(needle))));
      const included=rows.some(s=>Number(s.id)===selected);
      storePicker.innerHTML=(included?"":'<option value="" selected disabled>검색 결과에서 지점을 선택하세요</option>')+
        rows.map(s=>'<option value="'+Number(s.id)+'">'+escapeHTML(s.name)+' ('+Number(s.id)+', '+
          escapeHTML(s.onboarding_status)+')</option>').join("");
      if(included)storePicker.value=String(selected);
      body.querySelector("#hqStoreSearchCount").textContent="("+rows.length+"곳)";
      storePicker.disabled=rows.length===0;
    };
    body.querySelector("#hqOnboardingSearchInput").oninput=e=>{searchTerm=e.target.value;updateChoices();};
    body.querySelector("#hqStoreStatusFilter").onchange=e=>{statusFilter=e.target.value;updateChoices();};
    storePicker.onchange=e=>{if(!e.target.value)return;selected=Number(e.target.value);render();};
    body.querySelector("#hqStoreRefresh").onclick=()=>{
      if(busy)return;busy=true;
      refresh().catch(err).finally(()=>{busy=false;});
    };
    body.querySelector("#hqStoreReadinessExport").onclick=()=>{
      const text=readinessCsv(stores,proofs,sampleCounts);
      const blob=new Blob([text],{type:"text/csv;charset=utf-8"});
      const url=URL.createObjectURL(blob);
      const link=document.createElement("a");
      link.href=url;
      link.download="baekeok-store-readiness-"+new Date().toISOString().slice(0,10)+".csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
      message("개통 준비 현황","등록 지점 "+stores.length+"곳의 운영 준비 조건을 CSV로 내보냈습니다.");
    };
    const share=body.querySelector("#hqStoreShareUrl");
    if(share)share.onclick=()=>share.select();
    updateChoices();
    const verifyStore=(decision)=>{
      const evidence=body.querySelector("#hqStoreEvidence").value.trim();
      if(evidence.length<15)return err("실제 지점임을 확인한 공식 출처와 확인 근거를 15자 이상 입력하세요.");
      if(!confirm(store.name+" 실재 확인 결과를 "+(decision==="VERIFIED"?"승인":"반려")+
        "하고 감사 이력에 기록하시겠습니까?"))return;
      act(()=>rpc("hq_store_provenance_review",{
        p_store_id:selected,p_decision:decision,p_evidence_reference:evidence
      }),decision==="VERIFIED"?"지점 확인 기록이 저장됐습니다.":"검증 반려 이력이 기록됐습니다.");
    };
    body.querySelector("#hqStoreVerify").onclick=()=>verifyStore("VERIFIED");
    body.querySelector("#hqStoreReject").onclick=()=>verifyStore("REJECTED");
    body.querySelector("#hqStoreReady").onclick=()=>{
      if(!confirm(escapeHTML(store?.name)+" 점주의 접근 권한과 운영 준비가 확인됐습니까?"))return;
      act(()=>rpc("hq_store_onboarding_set",{p_store_id:selected,p_status:"READY"}),"해당 지점이 운영 활성화되었습니다.");
    };
    body.querySelector("#hqStoreSuspend").onclick=()=>{
      if(!confirm(escapeHTML(store?.name)+" 지점 운영을 일시중지하시겠습니까?"))return;
      act(()=>rpc("hq_store_onboarding_set",{p_store_id:selected,p_status:"SUSPENDED"}),"지점 운영이 중지됐습니다.");
    };
    body.querySelector("#hqManagerAssign").onclick=()=>{
      const email=body.querySelector("#hqManagerEmail").value.trim().toLowerCase();
      if(!email)return;
      if(!confirm(email+" 계정을 "+store.name+" 점주로 지정할까요?"))return;
      act(async()=>{
        const result=await rpc("hq_store_manager_assign",{p_email:email,p_store_id:selected});
        if(!result?.ok)throw Error(result?.error||"ASSIGN_FAILED");
      },"기존 점주 계정이 연결됐습니다.");
    };
    body.querySelector("#hqManagerInvite").onclick=()=>{
      const email=body.querySelector("#hqManagerEmail").value.trim().toLowerCase();
      if(!email)return;
      if(!confirm(email+" 주소로 "+store.name+" 점주 초대 메일을 보내시겠습니까?"))return;
      act(()=>invite(email,selected),"점주 이메일 초대를 요청했습니다.");
    };
    body.querySelectorAll("[data-primary-assign]").forEach(button=>{
      button.onclick=()=>{
        const id=button.getAttribute("data-primary-assign");
        if(!confirm(store.name+" 지점의 대표 점주를 이 계정으로 지정하시겠습니까?"))return;
        act(()=>rpc("hq_store_primary_owner_set",{p_store_id:selected,p_user_id:id}),
          "대표 점주가 지정됐습니다.");
      };
    });
    body.querySelectorAll("[data-owner-revoke]").forEach(button=>{
      button.onclick=()=>{
        const id=button.getAttribute("data-owner-revoke");
        if(!confirm("점주 계정 권한을 해제하시겠습니까?"))return;
        act(()=>rpc("hq_store_manager_revoke",{p_user_id:id}),"점주 권한을 해제했습니다.");
      };
    });
    body.querySelector("#hqNewStoreCreate").onclick=()=>{
      const name=body.querySelector("#hqNewStoreName").value.trim();
      const code=body.querySelector("#hqNewStoreCode").value.trim().toUpperCase();
      const region=body.querySelector("#hqNewStoreRegion").value.trim();
      if(!name||!code)return;
      if(!confirm(name+" 지점을 준비 상태로 등록하시겠습니까?"))return;
      act(async()=>{
        const result=await rpc("hq_store_register",{
          p_name:name,p_code:code,p_region_group:region||null
        });
        selected=Number(result?.store_id)||selected;
      },"신규 지점을 준비 상태로 등록했습니다.");
    };
  }
  try{await refresh();}
  catch(e){body.textContent="본사 지점 관리 정보를 불러올 수 없습니다: "+String(e?.message||e);}
};
})();
