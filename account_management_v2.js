(function(){
window.openAccountMgmt=async function(){
  const v=document.getElementById("accountVeil"), box=document.getElementById("adAccount");
  document.getElementById("accountClose").innerHTML=ICON.close;
  document.getElementById("accountClose").onclick=()=>v.classList.remove("show");
  attachNoDoubleTapZoom(v); v.classList.add("show");
  box.innerHTML='<div class="empty">불러오는 중…</div>';
  let me,users; try{me=await Auth.getUser();users=await BE.listAuthUsers();}catch(_){box.innerHTML='<div class="empty">계정 정보를 불러오지 못했습니다.</div>';return;}
  const myId=me&&me.id;
  box.innerHTML='<div class="account-user-list">'+users.map(u=>{
    const mine=u.user_id===myId,em=safeHtml(u.email||""),role=u.is_admin?"관리자":"일반";
    const action=mine?'<span class="account-role admin">나</span>':u.is_admin?'<button class="btn btn-danger btn-sm" data-remove="'+u.user_id+'" data-email="'+em+'">관리자 해제</button>':'<button class="btn btn-secondary btn-sm" data-add="'+em+'">관리자 지정</button>';
    return '<div class="account-user"><div class="account-user-email" title="'+em+'">'+em+'</div><span class="account-role '+(u.is_admin?"admin":"")+'">'+role+'</span>'+action+'</div>';
  }).join("")+'</div>';
  box.querySelectorAll("[data-add]").forEach(b=>b.onclick=async()=>{const em=b.dataset.add;if(!confirm(em+" 계정을 관리자로 지정할까요?"))return;b.disabled=true;try{const r=await BE.grantAdmin(em);if(r&&r.ok){toast("in","관리자 지정됨",em);openAccountMgmt();}else{toast("err","지정 실패",r&&r.error||"");b.disabled=false;}}catch(e){toast("err","지정 실패",e.message);b.disabled=false;}});
  box.querySelectorAll("[data-remove]").forEach(b=>b.onclick=async()=>{const em=b.dataset.email;if(!confirm(em+" 계정의 관리자 권한을 해제할까요?"))return;b.disabled=true;try{const r=await BE.revokeAdmin(b.dataset.remove);if(r&&r.ok){toast("out","관리자 해제됨",em);openAccountMgmt();}else{toast("err","해제 실패",r&&r.error==="CANNOT_REMOVE_LAST_ADMIN"?"마지막 관리자는 해제할 수 없습니다":r&&r.error||"");b.disabled=false;}}catch(e){toast("err","해제 실패",e.message);b.disabled=false;}});
};
window.openPersonalSettings=function(){
  let v=document.getElementById("settingsVeil");
  if(!v){v=document.createElement("div");v.id="settingsVeil";v.className="modal-veil";v.innerHTML='<div class="modal"><button type="button" class="btn-icon modal-x" id="settingsClose" aria-label="닫기">'+ICON.close+'</button><h3>설정</h3><div class="row" style="flex-direction:column;align-items:stretch;gap:8px;margin:0"><div style="font-size:.85rem;color:var(--text-muted)">내 로그인 이메일 변경</div><input class="form-control" id="newEmail" placeholder="새 이메일" inputmode="email"><button class="btn btn-primary" id="emailBtn">이메일 변경 요청</button><div id="emailMsg" style="font-size:.8rem;color:var(--text-muted)"></div></div></div>';document.body.appendChild(v);}
  document.getElementById("settingsClose").onclick=()=>v.classList.remove("show");attachNoDoubleTapZoom(v);v.classList.add("show");
  const input=document.getElementById("newEmail"),msg=document.getElementById("emailMsg");input.value="";msg.textContent="";
  document.getElementById("emailBtn").onclick=async()=>{const ne=input.value.trim();if(!ne){msg.textContent="새 이메일을 입력하세요.";return;}try{await Auth.requestEmailChange(ne);const u=await Auth.getUser();msg.textContent=(u&&u.email&&u.email.toLowerCase()===ne.toLowerCase())?"이메일이 변경 완료되었습니다.":"변경 요청됨. 이메일로 온 확인 링크를 완료한 뒤 재로그인하세요.";}catch(_){msg.textContent="이메일 변경 요청에 실패했습니다.";}};
};
})();