// #1435: isolated read-only monthly owner report source.
// No mail, payroll close, spreadsheet writes or authorization changes here.
// Sender must re-check current owner immediately before MailApp.sendEmail.
import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
import {createPayrollEngine} from "../server-sync-sheet/engine.mjs";
const apiUrl=Deno.env.get("SUPABASE_URL")||"";
const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const token=Deno.env.get("MONTHLY_OWNER_REPORT_TOKEN")||"";
const active=Deno.env.get("MONTHLY_OWNER_REPORTS_ACTIVE")==="true";
const allowed=(Deno.env.get("MONTHLY_OWNER_ALLOWED_STORES")||"").trim();
const client=createClient(apiUrl,serviceRole,{auth:{autoRefreshToken:false,persistSession:false}});
const response=(data,status=200)=>new Response(JSON.stringify(data),{
  status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
});
const validMonth=s=>/^20[0-9]{2}-(?:0[1-9]|1[0-2])$/.test(s);
const validInt=v=>Number.isSafeInteger(v);
const money=v=>validInt(v)&&v>=0;
const p2=v=>String(v).padStart(2,"0");
function equalConstantTime(a,b){
  if(typeof a!=="string"||typeof b!=="string")return false;
  let n=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++)n|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return n===0;
}
function nowYm(date=new Date()){
  const x=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit"})
    .formatToParts(date);
  return x.find(p=>p.type==="year")?.value+"-"+x.find(p=>p.type==="month")?.value;
}
function isAllowed(storeId){
  return allowed==="*" || allowed.split(",").some(s=>String(storeId)===s.trim());
}
async function currentOwner(storeId){
  // Do not guess from the first STORE_MANAGER or reuse an old emailed address.
  const {data:owner,error:oe}=await client.from("store_primary_owners")
    .select("user_id").eq("store_id",storeId).maybeSingle();
  if(oe||!owner?.user_id)throw Error("PRIMARY_OWNER_NOT_APPOINTED");
  const {data:admin,error:ae}=await client.from("admin_users")
    .select("user_id,email,admin_role,store_id").eq("user_id",owner.user_id).maybeSingle();
  if(ae||!admin||admin.user_id!==owner.user_id||
     admin.admin_role!=="STORE_MANAGER"||Number(admin.store_id)!==storeId)
    throw Error("PRIMARY_OWNER_ROLE_INVALID");
  const {data:auth,error:ue}=await client.auth.admin.getUserById(owner.user_id);
  const user=auth?.user;
  const email=String(user?.email||"").trim().toLowerCase();
  if(ue||!user?.email_confirmed_at||!/^[A-Za-z0-9._%+-]+@(gmail\.com|googlemail\.com)$/i.test(email)||
      String(admin.email||"").trim().toLowerCase()!==email)
    throw Error("PRIMARY_OWNER_EMAIL_UNVERIFIED");
  return {user_id:owner.user_id,email};
}
async function sourceFor(ym,storeId){
  const {data,error}=await client.rpc("sheet_server_payroll_source",{p_store_id:storeId,p_ym:ym});
  if(error||!data)throw new Error("SERVER_PAYROLL_SOURCE_FAILED: "+(error?.code||"NO_DATA"));
  const {data:weeklyApprovals,error:weeklyApprovalError}=await client.from("payroll_weekly_approvals")
    .select("employee_id,week_start,calculated_won,approved_won,decision,reason,approved_by,approved_at,id")
    // An approval belongs only to the month containing its Monday; overlap shifts
    // come from payroll source, but previous-month approval must never pay again.
    .eq("store_id",storeId).gte("week_start",ym+"-01")
    .lt("week_start",new Date(Date.UTC(Number(ym.slice(0,4)),Number(ym.slice(5,7)),1)).toISOString().slice(0,10))
    .order("approved_at",{ascending:false}).order("id",{ascending:false});
  if(weeklyApprovalError)throw new Error("WEEKLY_APPROVALS_READ_FAILED: "+weeklyApprovalError.code);
  const employeeIds=(data.employees||[]).map(e=>Number(e.id)).filter(Number.isSafeInteger);
  const {data:employmentPeriods,error:periodError}=employeeIds.length
    ?await client.from("employment_periods").select("employee_id,started_on,ended_on")
       .in("employee_id",employeeIds).lte("started_on",new Date(Date.UTC(Number(ym.slice(0,4)),Number(ym.slice(5,7)),0)).toISOString().slice(0,10))
    :{data:[],error:null};
  if(periodError)throw new Error("EMPLOYMENT_PERIOD_READ_FAILED: "+periodError.code);
  // Read the start AND end of the employee's dated hourly contract window.
  // No consent/approval workflow and no changes to source attendance events.
  const contractIds=[...new Set((data.workdays||[]).map(w=>Number(w.contract_id))
    .filter(x=>Number.isSafeInteger(x)&&x>0))];
  const {data:contractWindows,error:contractWindowsError}=contractIds.length
    ?await client.from("employment_contract_workdays")
       .select("contract_id,weekday,planned_start,planned_end").in("contract_id",contractIds)
    :{data:[],error:null};
  if(contractWindowsError)throw new Error("PLANNED_WINDOW_SOURCE_FAILED: "+contractWindowsError.code);
  const rangeEnd=new Date(Date.UTC(Number(ym.slice(0,4)),Number(ym.slice(5,7)),8))
    .toISOString().slice(0,10);
  const {data:dailySchedules,error:dailyScheduleError}=employeeIds.length
    ?await client.from("work_schedules")
       .select("employee_id,work_date,status,planned_start,planned_end")
       .in("employee_id",employeeIds).gte("work_date",ym+"-01")
       .lte("work_date",rangeEnd)
    :{data:[],error:null};
  if(dailyScheduleError)throw new Error("PLANNED_SCHEDULE_READ_FAILED: "+dailyScheduleError.code);
  const BE={
    allEmployees:async()=>data.employees||[],
    eventsWithCorrections:async()=>({events:data.events||[],corrections:data.corrections||[]}),
    payrollPeriod:async()=>({period:data.period||{weeks:null},overrides:data.overrides||[]}),
    payrollContracts:async()=>data.contracts||[],
    payrollContractWorkdays:async()=>data.workdays||[],
    payrollShiftStartRules:async()=>({contractWeekdays:contractWindows||[],dailySchedules:dailySchedules||[]}),
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
  return {data,engine,weeklyApprovals:weeklyApprovals||[]};
}

function preliminaryRows(report){
  // Reuse the same engine as the app and server sheet; do not reimplement pay.
  const relevant=(report.rows||[]).filter(r=>{
    const name=String(r.employee_name||"").trim().toLowerCase();
    const memo=String(r.emp?.memo||"").trim().toLowerCase();
    return name!=="test"&&!name.startsWith("테스트")&&!name.startsWith("test")&&
      memo!=="데모 지점 직원"&&!memo.includes("테스트");
  });
  const rows=relevant.map(r=>{
    const p=r.pay||null;
    const unresolved=Number(r.issues||0)>0||(r.sessions||[]).some(s=>s.status!=="COMPLETE");
    const flags=[];
    if(unresolved)flags.push("근무기록 확인 필요");
    if(r.contractMode==="BLOCKED")flags.push("근로계약 확인 필요");
    if(!p||!r.payrollType)flags.push("급여 계산 확인 필요");
    const valid=p&&[p.wage,p.base,p.juhyu,p.adjust,p.gross,p.net,p.nightAllowance,
      p.breakCompPay,p.substitutePay].every(v=>validInt(Number(v??0)))&&
      Number(p.gross)>=0&&Number(p.net)>=0&&Number(p.net)<=Number(p.gross);
    if(p&&!valid)flags.push("금액 검산 필요");
    const amount=valid?{
      wage:Number(p.wage||0),base_pay:Number(p.base||0),juhyu_pay:Number(p.juhyu||0),
      adjust:Number(p.adjust||0),gross_pay:Number(p.gross||0),net_pay:Number(p.net||0),
      night_allowance_won:Number(p.nightAllowance||0),
      break_compensation_won:Number(p.breakCompPay||0),
      substitution_pay_won:Number(p.substitutePay||0),
      tax_rate:Number(p.rate||0)
    }:null;
    return {
      employee_id:Number(r.employee_id),employee_name:String(r.employee_name||"").trim(),
      hours:Number(r.hours||0),payroll_type:r.payrollType||null,
      ...amount,
      review_flags:flags,complete_pay:!!amount
    };
  }).sort((a,b)=>a.employee_id-b.employee_id);
  if(rows.some(r=>!validInt(r.employee_id)||r.employee_id<1||!r.employee_name)||
     new Set(rows.map(r=>r.employee_id)).size!==rows.length)throw Error("PREVIEW_ROWS_INVALID");
  return rows;
}
function validateFinal(rows,storeId,ym){
  if(!Array.isArray(rows)||rows.length<1||rows.length>400)return false;
  const fingerprint=rows[0].source_fingerprint;
  if(!/^[0-9a-f]{64}$/.test(String(fingerprint||""))||
     new Set(rows.map(r=>r.employee_id)).size!==rows.length)return false;
  return rows.every(r=>r.store_id===storeId&&r.ym===ym&&
    validInt(r.employee_id)&&r.employee_id>0&&String(r.employee_name||"").trim()&&
    String(r.employee_name).trim().toLowerCase()!=="test"&&
    ["wage","base_pay","juhyu_pay","gross_pay","net_pay"].every(k=>money(r[k]))&&
    validInt(r.adjust)&&r.net_pay<=r.gross_pay&&
    Number(r.tax_rate)>=0&&Number(r.tax_rate)<=1&&
    r.source_fingerprint===fingerprint);
}
async function digest(value){
  const bytes=new TextEncoder().encode(JSON.stringify(value));
  const out=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(out)].map(x=>x.toString(16).padStart(2,"0")).join("");
}
Deno.serve(async req=>{
  try{
    if(req.method!=="POST")return response({ok:false,error:"METHOD_NOT_ALLOWED"},405);
    if(!active||token.length<64||!apiUrl||!serviceRole||!allowed)
      return response({ok:false,error:"SERVICE_DISABLED"},503);
    if(!equalConstantTime(req.headers.get("x-monthly-report-token")||"",token))
      return response({ok:false,error:"UNAUTHORIZED"},401);
    if(Number(req.headers.get("content-length")||0)>4096)
      return response({ok:false,error:"BAD_REQUEST"},400);
    const body=await req.json().catch(()=>null),storeId=Number(body?.store_id),
      ym=body?.ym,mode=body?.mode;
    if(!validInt(storeId)||storeId<1||!isAllowed(storeId)||typeof ym!=="string"||!validMonth(ym)||
       !["preview","final","owner_check"].includes(mode))
      return response({ok:false,error:"INVALID_SCOPE"},403);
    if(ym>nowYm())return response({ok:false,error:"FUTURE_MONTH"},409);
    const {data:store,error:se}=await client.from("stores")
      .select("id,name,is_active,onboarding_status").eq("id",storeId).maybeSingle();
    if(se||!store?.is_active||store.onboarding_status!=="READY")
      return response({ok:false,error:"STORE_NOT_READY"},409);
    const owner=await currentOwner(storeId);
    if(mode==="owner_check")return response({
      ok:true,store_id:storeId,store_name:store.name,ym,owner
    });
    const {data:period,error:pe}=await client.from("payroll_period")
      .select("status").eq("store_id",storeId).eq("ym",ym).maybeSingle();
    if(pe)return response({ok:false,error:"PAYROLL_STATE_UNAVAILABLE"},503);
    if(mode==="preview"){
      if(period?.status==="CLOSED")
        return response({ok:false,error:"ALREADY_CLOSED"},409);
      const {engine}=await sourceFor(ym,storeId);
      const computed=await engine.computeMonthPayroll(ym);
      const rows=preliminaryRows(computed);
      if(rows.length<1||rows.length>400)return response({ok:false,error:"NO_PAYROLL_ROWS"},409);
      const totals=rows.reduce((a,r)=>({
        gross:a.gross+(r.complete_pay?r.gross_pay:0),
        net:a.net+(r.complete_pay?r.net_pay:0)
      }),{gross:0,net:0});
      if(!money(totals.gross)||!money(totals.net))
        return response({ok:false,error:"PREVIEW_TOTALS_INVALID"},409);
      return response({
        ok:true,store_id:storeId,store_name:store.name,ym,mode:"PREVIEW",
        status:"OPEN",owner,as_of:new Date().toISOString(),count:rows.length,
        source_fingerprint:await digest({storeId,ym,rows}),
        totals,review_count:rows.filter(r=>r.review_flags.length>0).length,rows
      });
    }
    if(ym>=nowYm()||period?.status!=="CLOSED")
      return response({ok:false,error:"PAYROLL_NOT_CLOSED"},409);
    const {data:rows,error:re}=await client.from("payroll_snapshot")
      .select("store_id,ym,employee_id,employee_name,hours,wage,weeks,base_pay,juhyu_pay,adjust,gross_pay,tax_rate,net_pay,memo,source_fingerprint,closed_at,night_allowance_won,break_compensation_won,substitution_pay_won,night_allowance_label,break_mode")
      .eq("store_id",storeId).eq("ym",ym).order("employee_id");
    if(re||!validateFinal(rows,storeId,ym))
      return response({ok:false,error:"FINAL_SNAPSHOT_INVALID"},409);
    const totals=rows.reduce((a,r)=>({
      gross:a.gross+r.gross_pay,net:a.net+r.net_pay
    }),{gross:0,net:0});
    if(!money(totals.gross)||!money(totals.net))return response({ok:false,error:"FINAL_TOTALS_INVALID"},409);
    return response({
      ok:true,store_id:storeId,store_name:store.name,ym,
      mode:"FINAL",status:"CLOSED",owner,as_of:new Date().toISOString(),
      source_fingerprint:rows[0].source_fingerprint,count:rows.length,
      totals,review_count:0,rows
    });
  }catch(err){
    // Safe user-facing error code only; never log recipient or salary.
    const message=String(err?.message||"");
    const known=["PRIMARY_OWNER_NOT_APPOINTED","PRIMARY_OWNER_ROLE_INVALID",
      "PRIMARY_OWNER_EMAIL_UNVERIFIED","SERVER_PAYROLL_SOURCE_FAILED",
      "NO_PAYROLL_ROWS","PREVIEW_ROWS_INVALID"];
    const code=known.find(x=>message.startsWith(x))||"REPORT_UNAVAILABLE";
    return response({ok:false,error:code},409);
  }
});
