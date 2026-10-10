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
window.mountHqStoreOnboarding=async function(box){
  if(!box||!box.isConnected)return;
  const section=document.createElement("section");
  section.id="hqStoreOnboarding";
  section.style.cssText="margin-top:18px;padding-top:16px;border-top:1px solid var(--border)";
  section.innerHTML='<h3 style="font-size:1.05rem;margin:0 0 8px">백억커피 전국 지점 운영</h3>'+
    '<p style="font-size:.8rem;color:var(--text-muted);margin:0 0 12px">지점을 준비(STAGED) 상태로 등록하고 점주 계정을 연결한 뒤 운영을 활성화합니다. 운영 승인 전에는 지점 급여 기능이 열리지 않습니다.</p>'+
    '<div id="hqOnboardingBody" aria-live="polite">지점 정보를 불러오는 중…</div>';
  box.appendChild(section);
  const body=section.querySelector("#hqOnboardingBody");
  let stores=[],managers=[],selected=1,busy=false;
  const message=(title,detail)=>{if(typeof toast==="function")toast("in",title,detail);};
  const err=error=>{if(typeof toast==="function")toast("err","지점 설정 실패",String(error?.message||error));};
  async function refresh(){
    [stores,managers]=await Promise.all([rpc("hq_stores_onboarding_list"),rpc("hq_store_manager_list")]);
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
    const ready=store?.onboarding_status==="READY";
    body.innerHTML=
      '<div class="field"><label for="hqOnboardingStore">대상 지점</label><select id="hqOnboardingStore" class="form-control">'+
      stores.map(s=>'<option value="'+Number(s.id)+'"'+(Number(s.id)===selected?' selected':'')+'>'+
        escapeHTML(s.name)+' ('+Number(s.id)+', '+escapeHTML(s.onboarding_status)+')</option>').join("")+
      '</select></div>'+
      '<div style="margin:8px 0;font-size:.85rem">상태: <strong>'+escapeHTML(store?.onboarding_status||"UNKNOWN")+
      '</strong> · 배정된 점주 '+list.length+'명</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0">'+
      '<button type="button" class="btn btn-primary btn-sm" id="hqStoreReady"'+(ready?' disabled':'')+'>운영 활성화</button>'+
      '<button type="button" class="btn btn-secondary btn-sm" id="hqStoreSuspend"'+(Number(selected)===1?' disabled':'')+'>지점 일시중지</button>'+
      (ready?'<a class="btn btn-secondary btn-sm" id="hqStoreLink" href="'+escapeHTML(entryUrl(selected))+
        '" target="_blank" rel="noopener noreferrer">지점 전용 페이지 열기</a>':'')+'</div>'+
      '<div class="field"><label for="hqManagerEmail">점주 로그인 이메일</label><input id="hqManagerEmail" class="form-control" type="email" autocomplete="off" placeholder="owner@example.com"></div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 12px">'+
      '<button type="button" class="btn btn-secondary btn-sm" id="hqManagerAssign">기존 계정에 점주 권한 부여</button>'+
      '<button type="button" class="btn btn-primary btn-sm" id="hqManagerInvite">신규 점주 이메일 초대</button></div>'+
      '<div style="font-size:.8rem;color:var(--text-muted)">기존 계정은 회원 가입이 완료된 이메일이어야 합니다. 신규 초대는 인증 이메일을 발송합니다.</div>'+
      '<div style="margin:10px 0">'+(list.length?list.map(m=>
        '<div class="row" style="padding:8px;margin:5px 0;gap:8px"><span style="flex:1;min-width:0;overflow-wrap:anywhere">'+
        escapeHTML(m.email)+'</span><button type="button" class="btn btn-secondary btn-sm" data-owner-revoke="'+
        escapeHTML(m.user_id)+'">권한 해제</button></div>').join(""):
        '<div class="empty">이 지점에 배정된 점주 계정이 없습니다.</div>')+'</div>'+
      '<details style="margin-top:14px"><summary style="cursor:pointer;font-weight:600">새 지점 등록</summary>'+
      '<div style="display:grid;gap:8px;padding-top:10px">'+
      '<input class="form-control" id="hqNewStoreName" placeholder="지점명 (예: 백억커피 ○○점)">'+
      '<input class="form-control" id="hqNewStoreCode" placeholder="고유 코드 (영문·숫자·밑줄)">'+
      '<input class="form-control" id="hqNewStoreRegion" placeholder="지역 (선택)">'+
      '<button type="button" class="btn btn-secondary btn-sm" id="hqNewStoreCreate">준비 상태로 등록</button>'+
      '</div></details>';
    body.querySelector("#hqOnboardingStore").onchange=e=>{
      selected=Number(e.target.value);render();
    };
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
