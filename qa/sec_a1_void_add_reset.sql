\set ON_ERROR_STOP on
TRUNCATE public.event_corrections RESTART IDENTITY;
INSERT INTO public.event_corrections(id,employee_id,action,new_event_at,new_event_type,reason,created_by)
 VALUES(1,101,'ADD','2026-11-09 08:00:00','IN','synthetic-original','synthetic-owner');
SELECT setval(pg_get_serial_sequence('public.event_corrections','id'),1,true);
