// SEC-S04 / SEC-S01: read-only PostgreSQL structure + content FINGERPRINT inventory.
// Emits counts and one-way digests only — never row values, secrets or passwords.
// Each query uses a read-only transaction; individual queries do NOT share a
// consistent MVCC snapshot. A live changing source should be compared against
// the exact database backup snapshot rather than treated as an atomic baseline.
// Identical code is used against the disposable restore target.
//
// Usage: node db_inventory.mjs <psql-conninfo> [--no-content-hash]   -> JSON on stdout
//   PIN_QA_PSQL / PSQL may point at a psql binary.
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {snapshotSql} from './exported_snapshot.mjs';

export const SYSTEM_SCHEMA_SQL=`n.nspname not in ('pg_catalog','information_schema')
 and n.nspname not like 'pg\\_toast%' and n.nspname not like 'pg\\_temp\\_%'`;

function psqlJson(psql,conninfo,sql,snapshot=null){
 const wrapped=snapshot?snapshotSql(snapshot,sql):`set default_transaction_read_only=on; begin read only; ${sql}; commit;`;
 let out;
 try{
  out=execFileSync(psql,['-X','-q','-v','ON_ERROR_STOP=1','-At','--dbname',conninfo,'-c',wrapped],
   {encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:64*1024*1024});
 }catch(e){
  // Never echo the conninfo or SQL; keep a short server reason for diagnosis.
  const reason=String(e?.stderr||'').split('\n').find(l=>/ERROR:/.test(l))?.replace(/.*ERROR:\s*/,'').slice(0,160)||'unknown';
  throw Error('INVENTORY_QUERY_FAILED: '+reason);
 }
 const line=out.split('\n').map(s=>s.trim()).filter(Boolean).find(s=>s.startsWith('{')||s.startsWith('['));
 return JSON.parse(line||'null');
}
const q=s=>'"'+String(s).replaceAll('"','""')+'"';
const lit=s=>"'"+String(s).replaceAll("'","''")+"'";

export function inventory(conninfo,{psql=process.env.PIN_QA_PSQL||process.env.PSQL||'psql',contentHash=true,snapshot=null}={}){
 const meta=psqlJson(psql,conninfo,`select json_build_object(
  'server_version_num',current_setting('server_version_num')::int,
  'schemas',(select coalesce(json_agg(n.nspname order by n.nspname),'[]') from pg_namespace n where ${SYSTEM_SCHEMA_SQL}),
  'extensions',(select coalesce(json_agg(json_build_object('name',extname,'schema',extnamespace::regnamespace::text) order by extname),'[]') from pg_extension),
  'roles',(select coalesce(json_agg(json_build_object('name',rolname,'super',rolsuper,'login',rolcanlogin,
     'createrole',rolcreaterole,'createdb',rolcreatedb,'replication',rolreplication,'bypassrls',rolbypassrls,'inherit',rolinherit)
     order by rolname),'[]') from pg_roles where rolname !~ '^pg_'),
  'tables',(select coalesce(json_agg(json_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,
     'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'acl_md5',md5(coalesce(c.relacl::text,'')))
     order by n.nspname,c.relname),'[]')
   from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where ${SYSTEM_SCHEMA_SQL} and c.relkind in ('r','p','v','m','f')),
  'policies',(select coalesce(json_agg(json_build_object('schema',schemaname,'table',tablename,'name',policyname,
     'cmd',cmd,'permissive',permissive,'roles',roles::text,'expr_md5',md5(coalesce(qual,'')||'|'||coalesce(with_check,'')))
     order by schemaname,tablename,policyname),'[]') from pg_policies),
  'functions',(select coalesce(json_agg(x order by x->>'schema'),'[]') from (
     select json_build_object('schema',n.nspname,'count',count(*),
      'defs_md5',md5(string_agg(p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'||md5(pg_get_functiondef(p.oid)),',' order by p.proname,pg_get_function_identity_arguments(p.oid)))) x
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where ${SYSTEM_SCHEMA_SQL} and p.prokind in ('f','p')
      and not exists(select 1 from pg_depend d where d.objid=p.oid and d.deptype='e')
     group by n.nspname) f),
  'constraints',(select coalesce(json_agg(x order by x->>'schema'),'[]') from (
     select json_build_object('schema',n.nspname,'count',count(*),
      'defs_md5',md5(string_agg(t.relname||'.'||c.conname||':'||c.contype::text||':'||pg_get_constraintdef(c.oid),',' order by t.relname,c.conname))) x
     from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
     where ${SYSTEM_SCHEMA_SQL} group by n.nspname) k),
  'sequences',(select coalesce(json_agg(json_build_object('schema',schemaname,'name',sequencename,
     'last_value',last_value,'increment',increment_by) order by schemaname,sequencename),'[]') from pg_sequences),
  'owned_sequences',(select coalesce(json_agg(json_build_object('seq_schema',sn.nspname,'seq',s.relname,
     'schema',tn.nspname,'table',t.relname,'column',a.attname) order by sn.nspname,s.relname),'[]')
   from pg_depend d join pg_class s on s.oid=d.objid and s.relkind='S'
   join pg_namespace sn on sn.oid=s.relnamespace
   join pg_class t on t.oid=d.refobjid join pg_namespace tn on tn.oid=t.relnamespace
   join pg_attribute a on a.attrelid=t.oid and a.attnum=d.refobjsubid
   where d.deptype in ('a','i') and d.classid='pg_class'::regclass)
 )::text`,snapshot);
 // Row counts + order-independent content digests per base table, in one statement.
 const base=meta.tables.filter(t=>t.kind==='r'||t.kind==='p');
 const rows={};
 const chunk=150;
 for(let i=0;i<base.length;i+=chunk){
  const part=base.slice(i,i+chunk);
  if(!part.length)continue;
  const sel=part.map(t=>`select ${lit(t.schema+'.'+t.name)} as id,count(*) as n,`+
   (contentHash?`md5(coalesce(string_agg(md5(r::text),'' order by md5(r::text)),''))`:`null::text`)+
   ` as h from only ${q(t.schema)}.${q(t.name)} r`).join(' union all ');
  const got=psqlJson(psql,conninfo,`select coalesce(json_agg(json_build_object('id',id,'n',n,'h',h)),'[]')::text from (${sel}) z`,snapshot);
  for(const r of got)rows[r.id]={rows:Number(r.n),content_md5:r.h};
 }
 // Sequence vs owning column: next value must exceed the restored max key.
 const collisions=[];
 const owned=meta.owned_sequences;
 for(let i=0;i<owned.length;i+=chunk){
  const part=owned.slice(i,i+chunk);
  const sel=part.map(o=>`select ${lit(o.seq_schema+'.'+o.seq)} as id,
   (select max(${q(o.column)})::text from ${q(o.schema)}.${q(o.table)}) as mx,
   (select last_value::text from ${q(o.seq_schema)}.${q(o.seq)}) as lv,
   (select is_called from ${q(o.seq_schema)}.${q(o.seq)}) as called`).join(' union all ');
  const got=psqlJson(psql,conninfo,`select coalesce(json_agg(json_build_object('id',id,'mx',mx,'lv',lv,'called',called)),'[]')::text from (${sel}) z`,snapshot);
  for(const g of got){
   if(g.mx===null)continue;
   const mx=BigInt(g.mx.split('.')[0]),lv=BigInt(g.lv);
   const next=g.called?lv+1n:lv;
   if(next<=mx)collisions.push({sequence:g.id,max_key:g.mx,next_value:String(next)});
  }
 }
 const bySchema={};
 for(const t of base){const s=bySchema[t.schema]||(bySchema[t.schema]={tables:0,rows:0});s.tables++;s.rows+=rows[t.schema+'.'+t.name]?.rows||0}
 return {format:'attendance-db-inventory-v1',generated_at:new Date().toISOString(),
  content_hash:contentHash,consistent_snapshot:Boolean(snapshot),snapshot_kind:snapshot?'pg_export_snapshot':null,server_version_num:meta.server_version_num,
  schemas:meta.schemas,schema_summary:bySchema,extensions:meta.extensions,roles:meta.roles,
  tables:meta.tables.map(t=>({...t,...(rows[t.schema+'.'+t.name]||{})})),
  policies:meta.policies,functions:meta.functions,constraints:meta.constraints,
  sequences:meta.sequences,owned_sequences:meta.owned_sequences,sequence_collisions:collisions,
  safety:'counts and md5 digests only; no row values, no role passwords; read-only queries, but separate MVCC snapshots'};
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 const conninfo=process.argv[2];
 if(!conninfo){console.error('usage: db_inventory.mjs <psql-conninfo> [--no-content-hash]');process.exit(2)}
 try{console.log(JSON.stringify(inventory(conninfo,{contentHash:!process.argv.includes('--no-content-hash')}),null,1))}
 catch(e){console.error(String(e.message||e));process.exit(1)}
}
