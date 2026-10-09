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
  const admin=await client.from("admin_users").select("user_id").eq("user_id",data.user.id).maybeSingle();
  if(admin.error||!admin.data)throw new HttpError(403,"NOT_ADMIN");
  return {internal:false,userId:data.user.id};
}
class HttpError extends Error{constructor(status,message){super(message);this.status=status}}
async function sourceFor(ym,storeId){
  const {data,error}=await client.rpc("sheet_server_payroll_source",{p_store_id:storeId,p_ym:ym});
  if(error||!data)throw new Error("SERVER_PAYROLL_SOURCE_FAILED: "+(error?.code||"NO_DATA"));
  const BE={
    allEmployees:async()=>data.employees||[],
    eventsWithCorrections:async()=>({events:data.events||[],corrections:data.corrections||[]}),
    payrollPeriod:async()=>({period:data.period||{weeks:null},overrides:data.overrides||[]}),
    payrollContracts:async()=>data.contracts||[],
    payrollContractWorkdays:async()=>data.workdays||[],
    payrollSubstitutions:async()=>data.substitutions||[],
    employmentBundle:async id=>{
      const bundle=data.bundles?.[String(id)];
      if(!bundle)throw new Error("MISSING_EMPLOYEE_CONTRACT_BUNDLE");
      return bundle;
    },
  };
  const storeName=storeId===1?"인하대학교점":String(storeId);
  const engine=createPayrollEngine({BE,storeId,storeName});
  return {data,engine};
}
function packLocalDates(value){
  if(value instanceof Date)return `${value.getFullYear()}-${p2(value.getMonth()+1)}-${p2(value.getDate())}T${p2(value.getHours())}:${p2(value.getMinutes())}:${p2(value.getSeconds())}`;
  if(Array.isArray(value))return value.map(packLocalDates);
  if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,packLocalDates(v)]));
  return value;
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
  return ym===current || (data.events||[]).length>0 || (data.overrides||[]).length>0;
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
    if(!["cron","dryrun","deployment","payroll","parity","sync"].includes(mode))throw new HttpError(400,"BAD_MODE");
    await authenticate(req,mode);
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
    if(storeId!==1)throw new HttpError(403,"STORE_NOT_ENABLED");
    if(mode==="payroll"){
      const {engine}=await sourceFor(ym,storeId);
      const report=await engine.computeMonthPayroll(ym);
      return reply({ok:true,ym,result:packLocalDates(report)});
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
