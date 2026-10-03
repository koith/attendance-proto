alter table public.event_corrections
  drop constraint if exists event_corrections_action_check;

alter table public.event_corrections
  add constraint event_corrections_action_check
  check (action = any (array[
    'EDIT_TIME'::text,
    'EDIT_TYPE'::text,
    'VOID'::text,
    'ADD'::text,
    'VOID_ADD'::text
  ]));
