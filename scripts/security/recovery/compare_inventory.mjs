// SEC-S04: compare two db_inventory.mjs outputs (source snapshot vs isolated restore).
// Offline, no network, no credentials. Business/application schemas must match exactly
// (tables, row counts, content digests, RLS flags, ACL digests, policies, functions,
// constraints, sequences); provider-managed schemas are reported separately because
// they are rebuilt by the provider, not replayed (same classification as
// verify_backup_completeness.mjs).
// Usage: node compare_inventory.mjs <source.json> <restored.json>  -> JSON, exit 0 MATCH / 1 DIFF
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export const MANAGED_SCHEMAS=['cron','net','realtime','supabase_migrations','vault',
 'extensions','graphql','graphql_public','pgsodium','pgsodium_masks','supabase_functions','_realtime','_analytics','pgbouncer'];
// Roles that exist only because of the hosting cluster (bootstrap superuser,
// Supabase platform roles that a provider recreates). Attribute drift on these
// is reported, not failed.
export const PLATFORM_ROLES=['postgres','supabase_admin','supabase_auth_admin','supabase_storage_admin',
 'supabase_replication_admin','supabase_read_only_user','supabase_realtime_admin','supabase_functions_admin',
 'pgbouncer','authenticator','dashboard_user','pgsodium_keyholder','pgsodium_keyiduser','pgsodium_keymaker'];

const key=(o,...f)=>f.map(k=>o[k]).join('.');
function index(list,...f){return new Map((list||[]).map(o=>[key(o,...f),o]))}
function diffMaps(a,b,fields,label,out,managed){
 for(const [k,x] of a){
  const y=b.get(k);const schema=x.schema??k.split('.')[0];
  const bucket=managed(schema)?out.managed:out.business;
  if(!y){bucket.push({kind:label,id:k,issue:'missing_in_restore'});continue}
  for(const f of fields)if(JSON.stringify(x[f])!==JSON.stringify(y[f]))
   bucket.push({kind:label,id:k,issue:f+'_differs',source:x[f],restored:y[f]});
 }
 for(const [k,y] of b)if(!a.has(k)){
  const schema=y.schema??k.split('.')[0];
  (managed(schema)?out.managed:out.business).push({kind:label,id:k,issue:'extra_in_restore'});
 }
}
export function compare(src,dst,{ignoreSchemas=[]}={}){
 if(src?.format!=='attendance-db-inventory-v1'||dst?.format!=='attendance-db-inventory-v1')
  throw Error('INVALID_INVENTORY_FORMAT');
 const managed=s=>MANAGED_SCHEMAS.includes(s)||ignoreSchemas.includes(s);
 const out={business:[],managed:[],roles:[]};
 const contentFields=src.content_hash&&dst.content_hash?['rows','content_md5']:['rows'];
 diffMaps(index(src.tables,'schema','name'),index(dst.tables,'schema','name'),
  ['kind','rls','force_rls','acl_md5',...contentFields],'table',out,managed);
 diffMaps(index(src.policies,'schema','table','name'),index(dst.policies,'schema','table','name'),
  ['cmd','permissive','roles','expr_md5'],'policy',out,managed);
 diffMaps(index(src.functions,'schema'),index(dst.functions,'schema'),['count','defs_md5'],'functions',out,managed);
 diffMaps(index(src.constraints,'schema'),index(dst.constraints,'schema'),['count','defs_md5'],'constraints',out,managed);
 diffMaps(index(src.sequences,'schema','name'),index(dst.sequences,'schema','name'),['last_value','increment'],'sequence',out,managed);
 const srcRoles=index(src.roles,'name'),dstRoles=index(dst.roles,'name');
 for(const [k,r] of srcRoles){
  const d=dstRoles.get(k);const platform=PLATFORM_ROLES.includes(k);
  if(!d){out.roles.push({role:k,issue:'missing_in_restore',platform});continue}
  for(const f of ['login','bypassrls','createrole','createdb','replication','inherit','super'])
   if(r[f]!==d[f])out.roles.push({role:k,issue:f+'_differs',platform});
 }
 for(const s of dst.sequence_collisions||[])out.business.push({kind:'sequence_collision',id:s.sequence,issue:'next_value_not_above_max_key'});
 const blockingRoles=out.roles.filter(r=>!r.platform);
 const result=out.business.length||blockingRoles.length?'DIFF':'MATCH';
 const summary=s=>Object.fromEntries(Object.entries(s.schema_summary||{}).map(([k,v])=>[k,v]));
 return {result,business_differences:out.business.length,managed_differences:out.managed.length,
  role_differences:out.roles.length,blocking_role_differences:blockingRoles.length,
  source_schema_summary:summary(src),restored_schema_summary:summary(dst),
  business:out.business.slice(0,500),managed:out.managed.slice(0,500),roles:out.roles,
  managed_schemas:MANAGED_SCHEMAS,
  note:'Digests compare logical content, but source queries may have distinct MVCC snapshots. Values are never printed; managed schemas need provider-side rebuild.'};
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 const [a,b]=process.argv.slice(2);
 if(!a||!b){console.error('usage: compare_inventory.mjs <source.json> <restored.json>');process.exit(2)}
 try{
  const r=compare(JSON.parse(readFileSync(a,'utf8')),JSON.parse(readFileSync(b,'utf8')));
  console.log(JSON.stringify(r,null,1));process.exit(r.result==='MATCH'?0:1);
 }catch(e){console.error(String(e.message||e));process.exit(2)}
}
