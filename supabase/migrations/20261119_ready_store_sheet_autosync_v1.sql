-- Enable automatic Google Sheets change detection and rotation for normal READY stores.
-- Scope: INHA remains cron job 5; normal READY franchise branches excluding 1ho test.
-- Each branch uses an immutable STORE_<store_id> workbook identity in the Edge writer.
CREATE OR REPLACE FUNCTION public.system_check_sheet_changes()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare st record; fp text;
begin
  for st in select id from public.stores
    where is_active=true and onboarding_status='READY'
      and (id=1 or (id<>80 and code ~ '^(REAL_|BC_)[0-9]+
    select md5(concat_ws('|',
      coalesce((select string_agg(md5(row_to_json(a)::text),',' order by a.id) from public.attendance_events a join public.employees e on e.id=a.employee_id where e.store_id=st.id),''),
      coalesce((select string_agg(md5(row_to_json(c)::text),',' order by c.id) from public.event_corrections c join public.employees e on e.id=c.employee_id where e.store_id=st.id),''),
      coalesce((select string_agg(md5(row_to_json(e)::text),',' order by e.id) from public.employees e where e.store_id=st.id),''),
      coalesce((select string_agg(md5(row_to_json(ep)::text),',' order by ep.id) from public.employment_periods ep join public.employees e on e.id=ep.employee_id where e.store_id=st.id),''),
      coalesce((select string_agg(md5(row_to_json(ec)::text),',' order by ec.id) from public.employment_contracts ec join public.employment_periods ep on ep.id=ec.employment_period_id join public.employees e on e.id=ep.employee_id where e.store_id=st.id),''),
      coalesce((select string_agg(md5(row_to_json(w)::text),',' order by w.contract_id,w.weekday) from public.employment_contract_workdays w join public.employment_contracts ec on ec.id=w.contract_id join public.employment_periods ep on ep.id=ec.employment_period_id join public.employees e on e.id=ep.employee_id where e.store_id=st.id),''),
      coalesce((select string_agg(md5(row_to_json(p)::text),',' order by p.ym) from public.payroll_period p where p.store_id=st.id and p.ym >= to_char(current_date - interval '45 days','YYYY-MM')),''),
      coalesce((select string_agg(md5(row_to_json(pe)::text),',' order by pe.ym,pe.employee_id) from public.payroll_period_employee pe join public.employees e on e.id=pe.employee_id where e.store_id=st.id),''),
      coalesce((select string_agg(md5(row_to_json(sr)::text),',' order by sr.id) from public.substitution_requests sr join public.employees e on e.id=sr.requester_employee_id where e.store_id=st.id),''),
      coalesce((select string_agg(md5(row_to_json(s)::text),',' order by s.id) from public.payroll_snapshot s join public.employees e on e.id=s.employee_id where e.store_id=st.id),'')
    )) into fp;
    insert into public.sheet_sync_change_state(store_id,fingerprint,changed_at,checked_at)
      values(st.id,fp,now(),now())
    on conflict(store_id) do update set
      fingerprint=excluded.fingerprint,
      checked_at=now(),
      changed_at=case when sheet_sync_change_state.fingerprint is distinct from excluded.fingerprint then now() else sheet_sync_change_state.changed_at end;
  end loop;
end $function$
 and name not like '[QA%'))
    order by id loop
    select md5(concat_ws('|',
      coalesce((select string_agg(md5(row_to_json(a)::text),',' order by a.id) from public.attendance_events a join public.employees e on e.id=a.employee_id where e.store_id=st.id),''),
      coalesce((select string_agg(md5(row_to_json(c)::text),',' order by c.id) from public.event_corrections c join public.employees e on e.id=c.employee_id where e.store_id=st.id),''),
      coalesce((select string_agg(md5(row_to_json(e)::text),',' order by e.id) from public.employees e where e.store_id=st.id),''),
      coalesce((select string_agg(md5(row_to_json(ep)::text),',' order by ep.id) from public.employment_periods ep join public.employees e on e.id=ep.employee_id where e.store_id=st.id),''),
      coalesce((select string_agg(md5(row_to_json(ec)::text),',' order by ec.id) from public.employment_contracts ec join public.employment_periods ep on ep.id=ec.employment_period_id join public.employees e on e.id=ep.employee_id where e.store_id=st.id),''),
      coalesce((select string_agg(md5(row_to_json(w)::text),',' order by w.contract_id,w.weekday) from public.employment_contract_workdays w join public.employment_contracts ec on ec.id=w.contract_id join public.employment_periods ep on ep.id=ec.employment_period_id join public.employees e on e.id=ep.employee_id where e.store_id=st.id),''),
      coalesce((select string_agg(md5(row_to_json(p)::text),',' order by p.ym) from public.payroll_period p where p.ym >= to_char(current_date - interval '45 days','YYYY-MM')),''),
      coalesce((select string_agg(md5(row_to_json(pe)::text),',' order by pe.ym,pe.employee_id) from public.payroll_period_employee pe join public.employees e on e.id=pe.employee_id where e.store_id=st.id),''),
      coalesce((select string_agg(md5(row_to_json(sr)::text),',' order by sr.id) from public.substitution_requests sr join public.employees e on e.id=sr.requester_employee_id where e.store_id=st.id),''),
      coalesce((select string_agg(md5(row_to_json(s)::text),',' order by s.id) from public.payroll_snapshot s join public.employees e on e.id=s.employee_id where e.store_id=st.id),'')
    )) into fp;
    insert into public.sheet_sync_change_state(store_id,fingerprint,changed_at,checked_at)
      values(st.id,fp,now(),now())
    on conflict(store_id) do update set
      fingerprint=excluded.fingerprint,
      checked_at=now(),
      changed_at=case when sheet_sync_change_state.fingerprint is distinct from excluded.fingerprint then now() else sheet_sync_change_state.changed_at end;
  end loop;
end $function$


-- Existing minute writer for INHA (job 5) is preserved unchanged.
-- The new worker reads a vaulted token and selects one READY, staffed branch
-- per minute to respect the Google Apps Script global lock.
SELECT cron.schedule('baekeok-sheet-ready-stores-writer', '* * * * *', $cron$
SELECT net.http_post(
  url := 'https://waluhdgqhwjjwmflhrle.supabase.co/functions/v1/server-sync-sheet',
  headers := jsonb_build_object(
    'Content-Type','application/json',
    'x-sheet-autosync-token',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='baekeok_sheet_autosync_token')
  ),
  body := '{"mode":"cron","store_id":"next"}'::jsonb,
  timeout_milliseconds := 50000
);
$cron$);
