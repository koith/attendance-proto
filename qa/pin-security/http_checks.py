#!/usr/bin/env python3
"""PostgREST, real HTTP, synthetic fixture only."""
import urllib.request,urllib.error,json,os,sys
sys.path.insert(0,os.path.dirname(__file__))
# Do not import run.py: the integration runner intentionally has no side effects on import here.
BASE=os.environ.get('PIN_QA_HTTP','http://127.0.0.1:55443')
assert BASE.startswith(('http://127.0.0.1:','http://localhost:','http://postgrest:3000'))
passed=0
def post(name,args,headers=None,query=''):
 req=urllib.request.Request(BASE+'/rpc/'+name+query,data=json.dumps(args).encode(),headers={'Content-Type':'application/json',**(headers or {})})
 try:r=urllib.request.urlopen(req,timeout=15)
 except urllib.error.HTTPError as e:r=e
 s=r.read().decode();return r.status,json.loads(s) if s else None,dict(r.headers)
def ok(b,label):
 global passed
 assert b,label
 passed+=1;print('PASS HTTP',label,flush=True)
def args(e,p='1234'):return {'p_employee_id':e,'p_pin':p,'p_from':'2026-10-01','p_to':'2026-11-01'}
# Success bodies match historical JSON/TABLE return contracts.
s,b,_=post('my_events',args(710020));ok(s==200 and b['ok'],'legacy anonymous own records')
s,b,_=post('punch',{'p_employee_id':710020,'p_pin':'1234','p_device':'PC'});ok(s==200 and b['type']=='IN','PC actual JSON -> IN')
s,b,_=post('punch',{'p_employee_id':710020,'p_pin':'1234','p_device':'MOBILE'});ok(s==200 and b['type']=='OUT','mobile actual JSON -> OUT')
# Shared table/JSON failure budget. All failing requests must commit guard state.
for _ in range(5):s,b,_=post('staff_stocktake_catalog',{'p_store_id':710001,'p_employee_id':710021,'p_pin':'0000'})
ok(s==429,'TABLE auth failure returns HTTP429 instead of RAISE/rollback')
s,b,h=post('staff_stocktake_catalog',{'p_store_id':710001,'p_employee_id':710021,'p_pin':'1234'})
ok(s==429 and b==[] and 1<=int(h.get('Retry-After','0'))<=900,'locked TABLE request leaks no catalog and supplies retry interval')
s,b,_=post('my_events',args(710021));ok(b['error']=='RATE_LIMITED','TABLE failure count reaches JSON RPC')
# Stronger than the default production server: let clients request transaction rollback.
for _ in range(5):post('my_events',args(710022,'0000'),{'Prefer':'tx=rollback'})
s,b,_=post('my_events',args(710022));ok(b['error']=='RATE_LIMITED','Prefer tx=rollback cannot reset state')
# Singular response shaping can abort a PostgreSQL transaction after RPC execution.
for _ in range(5):post('staff_recipe_list',{'p_employee_id':710023,'p_pin':'0000','p_store_id':710001},{'Accept':'application/vnd.pgrst.object+json'})
s,b,_=post('my_events',args(710023));ok(b['error']=='RATE_LIMITED','singular-response rollback cannot reset state')
# Direct private helper/sequence and missing-signature paths cannot authenticate.
s,b,_=post('verify',{'p_employee_id':710020,'p_pin':'1234'});ok(s in (404,400),'no exposed private verification endpoint')
s,b,_=post('staff_stocktake_verify',{'p_store_id':710001,'p_employee_id':710020,'p_pin':'1234'});ok(s in (401,403),'old helper still denied anonymously')
# Known working staff: TABLE recipe/catalog and JSON stocktake preserve actual schemas.
s,b,_=post('punch',{'p_employee_id':710024,'p_pin':'1234'});ok(b['type']=='IN','working employee fixture')
s,b,_=post('staff_recipe_list',{'p_employee_id':710024,'p_pin':'1234','p_store_id':710001});ok(s==200 and len(b)==1 and b[0]['menu_name']=='Synthetic recipe','recipe TABLE success body unchanged')
s,b,_=post('staff_stocktake_catalog',{'p_store_id':710001,'p_employee_id':710024,'p_pin':'1234'});ok(s==200 and b[0]['unit']=='g','catalog TABLE success body unchanged')
s,b,_=post('staff_stocktake_submit',{'p_store_id':710001,'p_employee_id':710024,'p_pin':'1234','p_lines':[{'item_id':710001,'counted_quantity':2}]});ok(s==200 and b['status']=='SUBMITTED' and b['stock_changed']==False,'stocktake JSON success contract unchanged')
print('PIN_SECURITY_HTTP_PASS',passed)
