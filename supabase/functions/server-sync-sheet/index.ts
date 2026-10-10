// Canonical server-owned payroll and Google Sheet writer.
// Manual admin sync and internal cron share the same report calculation and format contract.
import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
import {createRemoteJWKSet,jwtVerify} from "https://esm.sh/jose@5";
import {createPayrollEngine} from "./engine.mjs";

const CORS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, apikey, content-type, x-sheet-autosync-token",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};
const projectUrl=Deno.env.get("SUPABASE_URL")||"";
const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const client=createClient(projectUrl,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...CORS,"Content-Type":"application/json"}});
const p2=n=>String(n).padStart(2,"0");
function seoulParts(date=new Date()){
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23"}).formatToParts(date).map(p=>[p.type,p.value]));
}
function currentYm(){const v=seoulParts();return `${v.year}-${v.month}`;}
function seoulStamp(){const v=seoulParts();return `${v.year}-${v.month}-${v.day} ${v.hour}:${v.minute}`;}
async function authenticate(req,mode){
  if(mode==="deployment"){
    const header=/^Bearer (.+)$/i.exec(req.headers.get("Authorization")||"");
    if(!header)throw new HttpError(401,"DEPLOYMENT_TOKEN_REQUIRED");
    try{
      const jwks=createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
      const {payload}=await jwtVerify(header[1],jwks,{issuer:"https://token.actions.githubusercontent.com",audience:"https://waluhdgqhwjjwmflhrle.supabase.co/functions/v1/server-sync-sheet"});
      const workflow=String(payload.workflow_ref||"");
      const accepted=["p0-pages-deploy.yml","apps-script-deploy.yml"].some(file=>workflow===`koith/attendance-proto/.github/workflows/${file}@refs/heads/main`);
      if(!accepted||payload.repository!=="koith/attendance-proto"||payload.ref!=="refs/heads/main")throw new Error("UNTRUSTED_WORKFLOW");
      return {internal:true,workflow};
    }catch{throw new HttpError(403,"DEPLOYMENT_IDENTITY_REJECTED")}
  }
  if(mode==="cron"||mode==="dryrun"){
    const token=req.headers.get("x-sheet-autosync-token")||"";
    if(token.length<64)throw new HttpError(401,"BAD_INTERNAL_TOKEN");
    const {data,error}=await client.rpc("sheet_autosync_token_valid",{p_token:token});
    if(error||data!==true)throw new HttpError(401,"BAD_INTERNAL_TOKEN");
    return {internal:true};
  }
  const match=/^Bearer (.+)$/i.exec(req.headers.get("Authorization")||"");
  if(!match)throw new HttpError(401,"NOT_AUTHORIZED");
  const {data,error}=await client.auth.getUser(match[1]);
  if(error||!data?.user)throw new HttpError(401,"NOT_AUTHORIZED");
  const admin=await client.from("admin_users").select("user_id,admin_role,store_id").eq("user_id",data.user.id).maybeSingle();
  if(admin.error||!admin.data)throw new HttpError(403,"NOT_ADMIN");
  return {internal:false,userId:data.user.id,adminRole:admin.data.admin_role,storeId:admin.data.store_id};
}
class HttpError extends Error{constructor(status,message){super(message);this.status=status}}
async function sourceFor(ym,storeId){
  const {data,error}=await client.rpc("sheet_server_payroll_source",{p_store_id:storeId,p_ym:ym});
  if(error||!data)throw new Error("SERVER_PAYROLL_SOURCE_FAILED: "+(error?.code||"NO_DATA"));
  const {data:weeklyApprovals,error:weeklyApprovalError}=await client.from("payroll_weekly_approvals")
    .select("employee_id,week_start,calculated_won,approved_won,decision,reason,approved_by,approved_at,id")
    // Include the Monday of a week crossing into this month; payroll source includes boundary shifts.
    .eq("store_id",storeId).gte("week_start",new Date(Date.UTC(Number(ym.slice(0,4)),Number(ym.slice(5,7))-1,-6)).toISOString().slice(0,10))
    .lt("week_start",new Date(Date.UTC(Number(ym.slice(0,4)),Number(ym.slice(5,7)),1)).toISOString().slice(0,10))
    .order("approved_at",{ascending:false}).order("id",{ascending:false});
  if(weeklyApprovalError)throw new Error("WEEKLY_APPROVALS_READ_FAILED: "+weeklyApprovalError.code);
  const employeeIds=(data.employees||[]).map(e=>Number(e.id)).filter(Number.isSafeInteger);
  const {data:employmentPeriods,error:periodError}=employeeIds.length
    ?await client.from("employment_periods").select("employee_id,started_on,ended_on")
       .in("employee_id",employeeIds).lte("started_on",new Date(Date.UTC(Number(ym.slice(0,4)),Number(ym.slice(5,7)),0)).toISOString().slice(0,10))
    :{data:[],error:null};
  if(periodError)throw new Error("EMPLOYMENT_PERIOD_READ_FAILED: "+periodError.code);
  const BE={
    allEmployees:async()=>data.employees||[],
    eventsWithCorrections:async()=>({events:data.events||[],corrections:data.corrections||[]}),
    payrollPeriod:async()=>({period:data.period||{weeks:null},overrides:data.overrides||[]}),
    payrollContracts:async()=>data.contracts||[],
    payrollContractWorkdays:async()=>data.workdays||[],
    payrollSubstitutions:async()=>data.substitutions||[],
    payrollWeeklyApprovals:async()=>weeklyApprovals||[],
    payrollEmploymentPeriods:async()=>employmentPeriods||[],
    employmentBundle:async id=>{
      const bundle=data.bundles?.[String(id)];
      if(!bundle)throw new Error("MISSING_EMPLOYEE_CONTRACT_BUNDLE");
      return bundle;
    },
  };
  const {data:store,error:storeError}=await client.from("stores").select("name").eq("id",storeId).maybeSingle();
  if(storeError||!store)throw new Error("UNKNOWN_PAYROLL_STORE");
  const storeName=String(store.name);
  const engine=createPayrollEngine({BE,storeId,storeName});
  return {data,engine};
}
function packLocalDates(value){
  if(value instanceof Date)return `${value.getFullYear()}-${p2(value.getMonth()+1)}-${p2(value.getDate())}T${p2(value.getHours())}:${p2(value.getMinutes())}:${p2(value.getSeconds())}`;
  if(Array.isArray(value))return value.map(packLocalDates);
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,packLocalDates(v)]));
  return value;
}
function payrollClosingRows(report){
  const relevant=(report.rows||[]).filter(r=>{
    const e=r.emp||{},name=String(r.employee_name||"").trim().toLowerCase();
    const memo=String(e.memo||"").trim().toLowerCase();
    return name!=="test" && !name.startsWith("테스트") && !name.startsWith("test") &&
      memo!=="데모 지점 직원" && !memo.includes("테스트");
  });
  // An unresolved timecard or worked employee without a pay rule must block
  // the entire close. Checking only payable rows would silently omit them.
  if(relevant.some(r=>Number(r.issues||0)>0||
    (r.sessions||[]).some(x=>x.status!=="COMPLETE")))
    throw new HttpError(409,"UNRESOLVED_ATTENDANCE_SESSIONS");
  if(relevant.some(r=>Number(r.sec||0)>0 && (!r.pay||!r.payrollType)))
    throw new HttpError(409,"EMPLOYEE_PAY_RULE_MISSING");
  const rows=relevant.filter(r=>r.pay && r.payrollType);
  if(!rows.length)throw new HttpError(409,"NO_PAYROLL_ROWS_TO_CLOSE");
  if(rows.every(r=>Number(r.sec||0)===0))throw new HttpError(409,"NO_COMPLETED_WORK_FOR_MONTH");
  return rows.map(r=>{
    const p=r.pay;
    const row={
      employee_id:Number(r.employee_id),employee_name:String(r.employee_name),
      hours:Math.round(Number(r.hours||0)*100)/100,wage:Number(p.wage||0),
      weeks:Number(p.jweeks||0),base_pay:Number(p.base||0),juhyu_pay:Number(p.juhyu||0),
      adjust:Number(p.adjust||0),gross_pay:Number(p.gross||0),
      tax_rate:Number(p.rate||0),net_pay:Number(p.net||0),memo:String(r.memo||"")
    };
    if(!Number.isSafeInteger(row.employee_id)||row.employee_id<=0 ||
       Object.entries(row).some(([key,value])=>typeof value==="number"&&!Number.isFinite(value)))
      throw new HttpError(409,"INVALID_CALCULATED_PAYROLL_ROW");
    return row;
  }).sort((a,b)=>a.employee_id-b.employee_id);
}
async function closingPreview(ym,storeId){
  const {engine}=await sourceFor(ym,storeId);
  const report=await engine.computeMonthPayroll(ym);
  const rows=payrollClosingRows(report);
  const fingerprint=await hash(JSON.stringify({ym,storeId,rows,events:packLocalDates(report.events||[])}));
  return {rows,fingerprint,gross:rows.reduce((x,r)=>x+r.gross_pay,0),net:rows.reduce((x,r)=>x+r.net_pay,0)};
}
async function hash(text){
  const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text));
  return Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,"0")).join("");
}
async function reportRelease(){
  // Deployment SHA invalidates monthly report hashes after an Edge function deployment.
  // GitHub raw ETags invalidate them after main's app/Sheet code changes as well.
  const paths=["index.html","apps_script.gs","payroll_contract_authority_v1.js"];
  const stamps=await Promise.all(paths.map(async path=>{
    const r=await fetch(`https://raw.githubusercontent.com/koith/attendance-proto/main/${path}`,{method:"HEAD"});
    if(!r.ok)throw new Error("REPORT_SOURCE_REVISION_UNAVAILABLE");
    const tag=r.headers.get("etag")||r.headers.get("last-modified");
    if(!tag)throw new Error("REPORT_SOURCE_REVISION_MISSING");
    return tag;
  }));
  return [Deno.env.get("DENO_DEPLOYMENT_ID")||"dev",...stamps].join("|");
}
function monthTargets(nowYm){
  const [y,m]=nowYm.split("-").map(Number),list=[];
  for(let month=m;month>=1;month--)list.push(`${y}-${p2(month)}`);
  return list;
}
function shouldWriteMonth(ym,current,data){
  return ym===current || (data.events||[]).length>0 || (data.overrides||[]).length>0 || (data.corrections||[]).length>0;
}
function snapshotRows(snap,ym){
  if(!snap.length)return null;
  return {header:["직원명","총 실근무시간","시급","기본급","주휴","조정","확정 세전급여"],
    rows:snap.map(s=>[s.employee_name,humanHours(s.hours),won(s.wage),won(s.base_pay),won(s.juhyu_pay),won(s.adjust),won(s.gross_pay)])};
}
function humanHours(hours){const t=Number(hours)||0,H=Math.floor(t),M=Math.round((t-H)*60);return M?`${H}시간 ${M}분`:`${H}시간`;}
function won(n){return (Number(n)||0).toLocaleString("ko-KR")+"원";}
async function buildReport(ym,storeId){
  const {data,engine}=await sourceFor(ym,storeId);
  const report=await engine.buildSheetSyncPayload(ym);
  const {data:snap,error:snapError}=await client.from("payroll_snapshot").select("employee_id,employee_name,hours,wage,base_pay,juhyu_pay,adjust,gross_pay,closed_at").eq("ym",ym);
  if(snapError)throw new Error("SNAPSHOT_READ_FAILED");
  const ids=new Set((data.employees||[]).map(e=>Number(e.id)));
  const snapshots=(snap||[]).filter(s=>ids.has(Number(s.employee_id)));
  const closedPayroll=snapshotRows(snapshots,ym);
  return {source:data,report,closed:!!closedPayroll,closedPayroll};
}
async function googleWrite(ym,payload,closed,closedPayroll){
  const url=Deno.env.get("SHEET_WEBAPP_URL"),secret=Deno.env.get("SHEET_SHARED_SECRET");
  if(!url||!/^https:\/\/script\.google\.com\//.test(url)||!secret)throw new Error("SHEET_APP_NOT_CONFIGURED");
  const body={
    secret,ym,synced_at:seoulStamp(),status_label:closed?"마감완료":"예상 · 미마감",
    store_key:String(payload.store_key||"1"),store_name:String(payload.store_name||"인하대학교점"),
    drive_structure:{root_folder_name:"백억커피",store_folder_name:String(payload.store_name||"인하대학교점"),create_missing_folders:true,one_spreadsheet_per_store:true,separate_by_store:true},
    sheet_format:{auto_resize_columns:true,resize_scope:"all_used_columns_after_write",width_source:"measured_display_text",recalculate_on_every_sync:true,human_readable_report:true,hide_empty_sections:true,freeze_header_rows:true,duration_format:"HH:MM"},
    attendance:payload.attendance,sessions:payload.sessions,payroll:closed?(closedPayroll||payload.payroll):payload.payroll
  };
  const res=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  const raw=await res.text();let result;
  try{result=JSON.parse(raw)}catch{throw new Error("SHEET_NON_JSON_RESPONSE")}
  if(!res.ok||result?.ok!==true)throw new Error("SHEET_WRITE_FAILED: "+String(result?.error||res.status).slice(0,170));
  const proof=result.sheet_format;
  if(!proof||proof.column_resize_applied!==true||proof.resize_scope!=="all_used_columns_after_write"||proof.width_source!=="measured_display_text")throw new Error("SHEET_COLUMN_RESIZE_NOT_CONFIRMED");
  if(!result.spreadsheet_id||!result.spreadsheet_url)throw new Error("SHEET_WRITE_LOCATION_UNCONFIRMED");
  return result;
}
async function claim(storeId,ym,fingerprint,force){
  const {data,error}=await client.rpc("sheet_autosync_claim",{p_store_id:storeId,p_ym:ym,p_fingerprint:fingerprint,p_force:force});
  if(error)throw new Error("SHEET_CLAIM_FAILED: "+error.code);
  return data;
}
async function finish(storeId,ym,fingerprint,token,ok,message){
  const {data,error}=await client.rpc("sheet_autosync_finish",{p_store_id:storeId,p_ym:ym,p_fingerprint:fingerprint,p_claim:token,p_ok:ok,p_error:message||null});
  if(error||data!==true)throw new Error("SHEET_FINISH_FAILED: "+(error?.code||"CLAIM_STALE"));
}
async function writeClaimed(ym,storeId,prepared,release,force=false){
  const fingerprint=await hash(JSON.stringify({release,ym,report:prepared.report,closed:prepared.closed,closedPayroll:prepared.closedPayroll}));
  const lease=await claim(storeId,ym,fingerprint,force);
  if(!lease){
    if(force)throw new HttpError(409,"SHEET_SYNC_BUSY");
    return {ok:true,ym,skipped:true};
  }
  try{
    const result=await googleWrite(ym,prepared.report,prepared.closed,prepared.closedPayroll);
    await finish(storeId,ym,fingerprint,lease,true,null);
    return {ok:true,ym,written:true,result};
  }catch(error){
    await finish(storeId,ym,fingerprint,lease,false,String(error?.message||error));
    throw error;
  }
}
async function automaticCycle(){
  const storeId=1;
  const {data:state,error}=await client.from("sheet_sync_change_state").select("fingerprint,synced_fingerprint,changed_at").eq("store_id",storeId).maybeSingle();
  if(error||!state)throw new Error("SERVER_CHANGE_DETECTOR_UNAVAILABLE");
  const release=await reportRelease();
  const desiredGlobal=state.fingerprint+"|"+await hash(release);
  if(state.synced_fingerprint===desiredGlobal){
    const {data:recent,error}=await client.from("sheet_sync_month_state").select("synced_at").eq("store_id",storeId).eq("ym",currentYm()).maybeSingle();
    if(error)throw new Error("SHEET_RECENCY_READ_FAILED");
    if(recent?.synced_at&&Date.now()-new Date(recent.synced_at).getTime()<15*60*1000)
      return {ok:true,skipped:true,reason:"UNCHANGED_SOURCE"};
  }
  const current=currentYm(),months=monthTargets(current);
  let pending=false,processed=[],writes=0,counts={checked:0,eligible:0};
  for(const ym of months){
    const prepared=await buildReport(ym,storeId);counts.checked++;
    if(!shouldWriteMonth(ym,current,prepared.source))continue;
    counts.eligible++;
    const r=await writeClaimed(ym,storeId,prepared,release,false);
    if(r.written){
      processed.push({ym,spreadsheet_id:r.result.spreadsheet_id});writes++;
      // A live shift accrues time continuously. Do not let today's changing
      // fingerprint starve last month's catch-up.
      if(writes>=3){pending=true;break;}
      continue;
    }
    const {data:monthState,error}=await client.from("sheet_sync_month_state").select("desired_fingerprint,synced_fingerprint").eq("store_id",storeId).eq("ym",ym).maybeSingle();
    if(error||!monthState||monthState.synced_fingerprint!==monthState.desired_fingerprint)pending=true;
  }
  if(!pending){
    // Conditional compare prevents acknowledging a changed source that arrived mid-write.
    const {error}=await client.from("sheet_sync_change_state").update({synced_fingerprint:desiredGlobal,synced_at:new Date().toISOString(),last_error:null}).eq("store_id",storeId).eq("fingerprint",state.fingerprint);
    if(error)throw new Error("SERVER_CHANGE_ACK_FAILED");
  }
  return {ok:true,pending,processed,counts};
}
function safeCompare(clientPayload,serverPayload){
  if(!clientPayload?.payroll?.rows)return null;
  const normalize=section=>JSON.stringify({header:section?.header||[],rows:(section?.rows||[]).map(row=>row.map(v=>String(v??"")))});
  return {payroll_identical:normalize(clientPayload.payroll)===normalize(serverPayload.payroll),
    attendance_identical:normalize(clientPayload.attendance)===normalize(serverPayload.attendance)};
}
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:CORS});
  if(req.method!=="POST")return reply({ok:false,error:"METHOD_NOT_ALLOWED"},405);
  try{
    const body=await req.json(),mode=String(body?.mode||"sync");
    if(!["cron","dryrun","deployment","payroll","parity","sync","weekly_approve","weekly_decide","payroll_close_preview","payroll_close","payroll_reopen","invite_store_manager"].includes(mode))throw new HttpError(400,"BAD_MODE");
    const actor=await authenticate(req,mode);
    if(mode==="invite_store_manager"){
      if(actor.internal||actor.adminRole!=="HQ"||!actor.userId)
        throw new HttpError(403,"HQ_ONLY");
      const email=String(body.email||"").trim().toLowerCase();
      const storeId=Number(body.store_id);
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||
         !Number.isSafeInteger(storeId)||storeId<=0)
        throw new HttpError(400,"INVALID_INVITATION");
      const {data:store,error:storeError}=await client.from("stores")
        .select("id,onboarding_status").eq("id",storeId).maybeSingle();
      if(storeError||!store||store.onboarding_status==="SUSPENDED")
        throw new HttpError(403,"STORE_NOT_ELIGIBLE");
      const {data:invited,error:inviteError}=await client.auth.admin.inviteUserByEmail(email);
      if(inviteError||!invited?.user?.id)
        throw new HttpError(409,"INVITE_FAILED: "+String(inviteError?.message||"NO_USER"));
      const {data:assigned,error:assignError}=await client.rpc("service_store_manager_attach_invited_user",{
        p_store_id:storeId,p_user_id:invited.user.id,p_actor_id:actor.userId
      });
      if(assignError||assigned?.ok!==true)
        throw new HttpError(502,"INVITE_SENT_BUT_ROLE_ASSIGN_FAILED: "+
          String(assignError?.message||"UNKNOWN"));
      return reply({ok:true,store_id:storeId,email,role:"STORE_MANAGER",invited:true});
    }
    if(mode==="deployment"){
      const ym=currentYm();
      const prepared=await buildReport(ym,1);
      const release=await reportRelease();
      const result=await writeClaimed(ym,1,prepared,release,true);
      if(!result.written)throw new HttpError(409,"SHEET_WRITE_IN_PROGRESS");
      return reply({ok:true,written:true,ym,spreadsheet_id:result.result.spreadsheet_id,
        column_resize_applied:result.result.sheet_format?.column_resize_applied===true});
    }
    if(mode==="dryrun"){
      const ym=String(body.ym||currentYm());
      if(!/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(ym))throw new HttpError(400,"BAD_YM");
      const {source,report}=await (async()=>{const p=await buildReport(ym,1);return {source:p.source,report:p.report}})();
      const release=await reportRelease();
      return reply({ok:true,mode:"dryrun",release_revision:await hash(release),ym,employees:(source.employees||[]).length,events:(source.events||[]).length,payroll_rows:report.payroll.rows.length,attendance_rows:report.attendance.rows.length});
    }
    if(mode==="cron"){
      if(body.store_id!=null&&Number(body.store_id)!==1)throw new HttpError(403,"STORE_NOT_ALLOWED");
      return reply(await automaticCycle());
    }
    const ym=String(body.ym||currentYm()),storeId=Number(body.store_id||1);
    if(!/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(ym))throw new HttpError(400,"BAD_YM");
    if(!Number.isSafeInteger(storeId)||storeId<=0)throw new HttpError(400,"INVALID_STORE");
    const {data:store,error:storeError}=await client.from("stores")
      .select("id,name,is_active,onboarding_status").eq("id",storeId).maybeSingle();
    if(storeError||!store||!store.is_active||store.onboarding_status!=="READY")
      throw new HttpError(403,"STORE_NOT_ONBOARDED");
    if(["sync","parity"].includes(mode)&&storeId!==1)
      throw new HttpError(403,"STORE_SHEET_SYNC_NOT_CONFIGURED");
    if(!actor.internal && actor.adminRole!=="HQ" && !(actor.adminRole==="STORE_MANAGER"&&Number(actor.storeId)===storeId))
      throw new HttpError(403,"STORE_NOT_AUTHORIZED");
    if(["payroll_close_preview","payroll_close","payroll_reopen"].includes(mode)){
      if(actor.internal||!actor.userId)
        throw new HttpError(403,"HQ_APPROVAL_REQUIRED");
      if(ym>=currentYm()&&mode!=="payroll_reopen")
        throw new HttpError(409,"CURRENT_OR_FUTURE_MONTH_CANNOT_CLOSE");
      if(mode==="payroll_reopen"){
        const reason=String(body.reason||"").trim();
        if(reason.length<5||body.confirm_ym!==ym)
          throw new HttpError(400,"REOPEN_CONFIRMATION_REQUIRED");
        const {data,error}=await client.rpc("server_payroll_reopen_verified",{
          p_store_id:storeId,p_ym:ym,p_reason:reason,p_actor_id:actor.userId
        });
        if(error)throw new HttpError(409,"PAYROLL_REOPEN_REJECTED: "+error.message);
        return reply({ok:true,ym,result:data});
      }
      const {rows,fingerprint,gross,net}=await closingPreview(ym,storeId);
      if(mode==="payroll_close_preview")
        return reply({ok:true,ym,employee_count:rows.length,gross,net,fingerprint,
          status:"READY",engine_revision:"20261010-verified"});
      if(body.confirm_ym!==ym||String(body.fingerprint||"")!==fingerprint)
        throw new HttpError(409,"PAYROLL_SOURCE_CHANGED_OR_NOT_CONFIRMED");
      const {data,error}=await client.rpc("server_payroll_close_verified",{
        p_store_id:storeId,p_ym:ym,p_rows:rows,p_fingerprint:fingerprint,p_actor_id:actor.userId
      });
      if(error)throw new HttpError(409,"PAYROLL_CLOSE_REJECTED: "+error.message);
      return reply({ok:true,ym,result:data});
    }
    if(mode==="weekly_approve"||mode==="weekly_decide"){
      const employeeId=Number(body.employee_id),weekStart=String(body.week_start||"");
      const calculatedWon=Number(body.calculated_won),approvedWon=Number(body.approved_won);
      const decision=String(body.decision||"APPROVE").toUpperCase();
      const reason=String(body.reason||"").trim();
      if(!Number.isSafeInteger(employeeId)||employeeId<=0||
         !/^20[0-9]{2}-[0-9]{2}-[0-9]{2}$/.test(weekStart)||!weekStart.startsWith(ym)||
         !Number.isSafeInteger(calculatedWon)||calculatedWon<0||
         !Number.isSafeInteger(approvedWon)||approvedWon<0||reason.length<3||
         !["APPROVE","REJECT"].includes(decision)||(decision==="REJECT"&&approvedWon!==0))
        throw new HttpError(400,"INVALID_WEEKLY_APPROVAL");
      const weekMonday=new Date(weekStart+"T00:00:00Z");
      const nowSeoul=seoulParts();
      const nowWall=new Date(nowSeoul.year+"-"+nowSeoul.month+"-"+nowSeoul.day+"T"+nowSeoul.hour+":"+nowSeoul.minute+":00Z");
      if(!Number.isFinite(weekMonday.getTime())||weekMonday.getUTCDay()!==1||
         nowWall.getTime()<weekMonday.getTime()+7*86400000+2*3600000)
        throw new HttpError(409,"WEEK_NOT_CLOSED");
      const {engine:approvalEngine}=await sourceFor(ym,storeId);
      const currentPayroll=await approvalEngine.computeMonthPayroll(ym);
      const employeeRow=currentPayroll.rows.find(r=>Number(r.employee_id)===employeeId);
      if(!employeeRow||!employeeRow.pay||employeeRow.payrollType!=="HOURLY")
        throw new HttpError(404,"WEEKLY_EMPLOYEE_NOT_FOUND");
      const actualCalculated=Number(employeeRow.pay.weeklyCalculatedAmounts?.[weekStart]||0);
      if(calculatedWon!==actualCalculated)throw new HttpError(409,"WEEKLY_CALCULATED_AMOUNT_CHANGED");
      if(actor.internal||!actor.userId)throw new HttpError(403,"ADMIN_USER_REQUIRED");
      const {data,error}=await client.rpc("approve_payroll_weekly_decision_internal",{
        p_store_id:storeId,p_employee_id:employeeId,p_week_start:weekStart,
        p_calculated_won:actualCalculated,p_approved_won:approvedWon,p_reason:reason,
        p_approver_id:actor.userId,p_decision:decision
      });
      if(error)throw new HttpError(409,"WEEKLY_APPROVAL_REJECTED: "+error.message);
      return reply({ok:true,approval_id:data,decision});
    }
    if(mode==="payroll"){
      const {engine}=await sourceFor(ym,storeId);
      const report=await engine.computeMonthPayroll(ym);
      return reply({ok:true,ym,result:packLocalDates(report),engine_revision:"20261010-verified"});
    }
    const prepared=await buildReport(ym,storeId);
    if(mode==="parity"){
      const comparable=safeCompare(body.payload,prepared.report);
      return reply({ok:true,ym,parity:comparable,payroll:prepared.report.payroll,attendance:prepared.report.attendance});
    }
    const release=await reportRelease();
    const parity=safeCompare(body.payload,prepared.report);
    // Reject changes to existing manual projection until parity is proven.
    if(parity&&(!parity.payroll_identical||!parity.attendance_identical))
      throw new HttpError(409,"SERVER_CLIENT_PARITY_MISMATCH");
    const result=await writeClaimed(ym,storeId,prepared,release,true);
    return reply({...result,parity});
  }catch(error){
    const status=error instanceof HttpError?error.status:502;
    const message=error instanceof HttpError?error.message:String(error?.message||error);
    console.error("[server-sync-sheet]",status,message);
    return reply({ok:false,error:message.slice(0,240)},status);
  }
});
