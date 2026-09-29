create or replace function public.admin_events_with_corrections(p_from timestamp without time zone, p_to timestamp without time zone)
returns json language plpgsql security definer set search_path to 'public','pg_temp'
as $function$
begin
 if not public.is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
 return (select json_build_object(
 'events',coalesce((select json_agg(row_to_json(e)) from (
   select ev.id,ev.employee_id,ev.event_type,(ev.event_at at time zone 'UTC') at time zone 'Asia/Seoul' event_at
   from attendance_events ev join employees ee on ee.id=ev.employee_id
   where ev.event_at>=((p_from at time zone 'Asia/Seoul') at time zone 'UTC')
     and ev.event_at<((p_to at time zone 'Asia/Seoul') at time zone 'UTC')
     and (current_setting('request.jwt.claims',true)::jsonb ? 'sub' is false or ee.store_id is not null)
   order by ev.employee_id,ev.event_at) e),'[]'::json),
 'corrections',coalesce((select json_agg(row_to_json(c)) from (
   select ec.id,ec.event_id,ec.employee_id,ec.action,
          case when ec.new_event_at is null then null else (ec.new_event_at at time zone 'UTC') at time zone 'Asia/Seoul' end new_event_at,
          ec.new_event_type,ec.reason,ec.created_by,ec.created_at
   from event_corrections ec
   where ec.created_at >= (p_from at time zone 'Asia/Seoul')-interval '90 days') c),'[]'::json)));
end $function$;
