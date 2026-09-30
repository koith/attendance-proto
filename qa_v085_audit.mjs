import fs from "node:fs";
const index=fs.readFileSync("index.html","utf8");
const units=fs.readFileSync("supabase/migrations/20260930012050_inventory_units_and_audit_hardening_v085.sql","utf8");
const recipe=fs.readFileSync("supabase/migrations/20260930012059_staff_recipe_canonical_clock_state_v085.sql","utf8");
const checks=[
 ["version",(()=>{const m=index.match(/APP_VERSION="v0\.(\d+)"/);return !!m&&Number(m[1])>=85})()],
 ["unit columns",/stock_unit text/.test(units)&&/order_unit text/.test(units)&&/conversion_quantity numeric/.test(units)],
 ["safe seed",units.includes("unit not like '%/%'")&&units.includes("unit<>'원본 기준'")],
 ["snapshot conversion",units.includes("conversion_quantity,ordered_quantity")&&units.includes("v_stock_qty:=p_quantity*coalesce(r.conversion_quantity,1)")],
 ["missing manual target aborts",units.includes("returning id into v_updated")&&units.includes("if v_updated is null then raise exception 'INVENTORY_ITEM_NOT_FOUND'")],
 ["current/future payroll blocked",units.includes("CURRENT_OR_FUTURE_MONTH_CANNOT_CLOSE")],
 ["duplicate payroll close blocked",units.includes("PAYROLL_ALREADY_CLOSED")],
 ["legacy substitution helpers not anon",units.includes("revoke execute on function public.substitution_is_working")&&units.includes("revoke execute on function public.substitution_schedule_conflict")],
 ["staff recipe corrected attendance",recipe.includes("public.substitution_is_working(p_employee_id)")&&!recipe.includes("select ae.event_type into v_last_type")]
];
let fail=0; for(const [name,ok] of checks){console.log((ok?"PASS ":"FAIL ")+name);if(!ok)fail++}
if(fail)process.exit(1);
console.log("v0.85 audit QA passed:",checks.length);
