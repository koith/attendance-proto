import os,subprocess,pathlib
P=os.environ.get('PIN_QA_PSQL','psql');D=os.environ.get('PGDATABASE','audit_pin');assert D.startswith(('audit_pin','pin_fixture'))
def q(s):
 p=subprocess.run([P,'-X','-At','-v','ON_ERROR_STOP=1',D,'-c',s],capture_output=True,text=True)
 assert not p.returncode,p.stderr
 return p.stdout
root=pathlib.Path(__file__).resolve().parents[2]
q("select public.punch(710039,'1234','rollback-proof',NULL)")
rows=q("select jsonb_agg(to_jsonb(e) order by id) from attendance_events e")
p=subprocess.run([P,'-X','-At','-v','ON_ERROR_STOP=1',D],input="begin; create or replace function public.my_events(p_employee_id bigint,p_pin text,p_from timestamp,p_to timestamp) returns json language sql as $$select '{}'::json$$;\n"+(root/'qa/pin-security/rollback.sql').read_text(),text=True,capture_output=True)
assert p.returncode and 'PIN_ROLLBACK_SOURCE_DRIFT' in p.stderr
print('PASS rollback refuses later function drift atomically')
assert q("select bool_and(md5(pg_get_functiondef(signature::regprocedure))=installed_md5) from pin_private.source_archive").strip()=='t'
p=subprocess.run([P,'-X','-v','ON_ERROR_STOP=1',D,'-f',str(root/'qa/pin-security/rollback.sql')],capture_output=True,text=True);assert not p.returncode,p.stderr
assert q("select jsonb_agg(to_jsonb(e) order by id) from attendance_events e")==rows
assert q("select bool_and(pg_get_functiondef(signature::regprocedure)=before_definition) from pin_private.source_archive").strip()=='t'
assert q("select bool_and(has_function_privilege('public',signature,'EXECUTE')=before_public) from pin_private.source_archive").strip()=='t'
print('PASS rollback restores all original definitions/anonymous ACL and preserves newer attendance rows')
