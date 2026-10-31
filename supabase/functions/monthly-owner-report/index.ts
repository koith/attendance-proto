// Dedicated read-only server endpoint for the monthly Gmail digest.
// This endpoint NEVER sends mail, writes payroll or generates an external link.
// verify_jwt=false requires the separate 64+ character private token below.
// Deploy only after authorized recipients + backend credential review.
import {createClient} from "https://esm.sh/@supabase/supabase-js@2";
const apiUrl=Deno.env.get("SUPABASE_URL")||"";
const svc=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const token=Deno.env.get("MONTHLY_OWNER_REPORT_TOKEN")||"";
const allow=(Deno.env.get("MONTHLY_OWNER_ALLOWED_STORES")||"").split(",").map(v=>Number(v.trim())).filter(Number.isSafeInteger);
const sb=createClient(apiUrl,svc,{auth:{autoRefreshToken:false,persistSession:false}});
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const yymm=/^20[0-9]{2}-(?:0[1-9]|1[0-2])$/;
const int=v=>typeof v==="number"&&Number.isSafeInteger(v);
const positive=v=>int(v)&&v>=0;
function equalConstantTime(a,b){
  if(typeof a!=="string"||typeof b!=="string")return false;
  let difference=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++)difference|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return difference===0;
}
function currentSeoulMonth(date=new Date()){
 const parts=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit"}).formatToParts(date);
 const year=parts.find(p=>p.type==="year")?.value,month=parts.find(p=>p.type==="month")?.value;
 return year+"-"+month;
}
function validSnapshot(row,storeId,ym,fingerprint){
 const keys=["employee_id","employee_name","wage","base_pay","juhyu_pay","adjust","gross_pay","tax_rate","net_pay"];
 if(row.store_id!==storeId||row.ym!==ym||!keys.every(k=>row[k]!==null&&row[k]!==undefined))return false;
 if(!int(row.employee_id)||row.employee_id<1||!String(row.employee_name).trim()||String(row.employee_name).trim().toUpperCase()==="TEST")return false;
 if(!positive(row.wage)||!positive(row.base_pay)||!positive(row.juhyu_pay)||!positive(row.gross_pay)||!positive(row.net_pay)||row.net_pay>row.gross_pay)return false;
 if(!int(row.adjust)||!Number.isFinite(Number(row.tax_rate))||Number(row.tax_rate)<0||Number(row.tax_rate)>1)return false;
 if(row.source_fingerprint!==fingerprint)return false;
 for(const key of ["night_allowance_won","break_compensation_won","substitution_pay_won"]){
   if(row[key]!==null&&row[key]!==undefined&&!positive(row[key]))return false;
 }
 return true;
}
Deno.serve(async req=>{
 try{
   if(req.method!=="POST")return json({ok:false,error:"METHOD_NOT_ALLOWED"},405);
   if(token.length<64||!svc||!apiUrl||allow.length===0||Deno.env.get("MONTHLY_OWNER_REPORTS_ACTIVE")!=="true")return json({ok:false,error:"SERVICE_DISABLED"},503);
   if(!equalConstantTime(req.headers.get("x-monthly-report-token")||"",token))return json({ok:false,error:"UNAUTHORIZED"},401);
   if(Number(req.headers.get("content-length")||"0")>4096)return json({ok:false,error:"BAD_REQUEST"},400);
   const body=await req.json().catch(()=>null);
   const storeId=Number(body?.store_id),ym=body?.ym;
   if(!Number.isSafeInteger(storeId)||storeId<1||!allow.includes(storeId)||typeof ym!=="string"||!yymm.test(ym))
      return json({ok:false,error:"INVALID_SCOPE"},403);
   // A current month's payroll cannot be CLOSED on the existing app; never imply otherwise.
   if(ym>=currentSeoulMonth())return json({ok:false,error:"PERIOD_NOT_FINISHED"},409);
   const {data:store,error:se}=await sb.from("stores").select("id,name,is_active,onboarding_status").eq("id",storeId).maybeSingle();
   if(se||!store||!store.is_active||store.onboarding_status!=="READY")return json({ok:false,error:"STORE_NOT_READY"},409);
   const {data:period,error:pe}=await sb.from("payroll_period").select("status").eq("store_id",storeId).eq("ym",ym).maybeSingle();
   if(pe||period?.status!=="CLOSED")return json({ok:false,error:"PAYROLL_NOT_CLOSED"},409);
   const {data:rows,error:re}=await sb.from("payroll_snapshot")
    .select("store_id,ym,employee_id,employee_name,hours,wage,weeks,base_pay,juhyu_pay,adjust,gross_pay,tax_rate,net_pay,memo,source_fingerprint,closed_at,night_allowance_won,break_compensation_won,substitution_pay_won,night_allowance_label,break_mode")
    .eq("store_id",storeId).eq("ym",ym).order("employee_id");
   if(re||!Array.isArray(rows)||rows.length<1||rows.length>100)return json({ok:false,error:"SNAPSHOT_UNAVAILABLE"},409);
   const fingerprint=rows[0].source_fingerprint;
   if(!/^[0-9a-f]{64}$/.test(String(fingerprint||""))||!rows.every(r=>validSnapshot(r,storeId,ym,fingerprint)))
      return json({ok:false,error:"SNAPSHOT_INCOMPLETE"},409);
   if(new Set(rows.map(r=>r.employee_id)).size!==rows.length)return json({ok:false,error:"DUPLICATE_EMPLOYEE"},409);
   const aggregate=rows.reduce((o,r)=>({gross:o.gross+r.gross_pay,net:o.net+r.net_pay}),{gross:0,net:0});
   if(!Number.isSafeInteger(aggregate.gross)||!Number.isSafeInteger(aggregate.net))return json({ok:false,error:"AGGREGATE_OVERFLOW"},409);
   return json({ok:true,store_id:storeId,store_name:store.name,ym,status:"CLOSED",source_fingerprint:fingerprint,count:rows.length,totals:aggregate,rows});
 }catch{
   return json({ok:false,error:"REPORT_READ_UNAVAILABLE"},503);
 }
});
