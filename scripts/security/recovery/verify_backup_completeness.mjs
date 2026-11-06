// SEC continuity A: read-only metadata/TOC scope checker. No network, credentials or SQL.
// This checks declared coverage, NOT artifact authenticity, content hashes, or restore success.
// Usage: node verify_backup_completeness.mjs <sealed-manifest.json> <pg_restore-list.txt>
import {readFileSync} from 'node:fs';
const [,,manifestPath,tocPath]=process.argv;
if(!manifestPath||!tocPath){console.error('usage: verify_backup_completeness.mjs <manifest.json> <toc.txt>');process.exit(2);}
let manifest,toc;
try {manifest=JSON.parse(readFileSync(manifestPath,'utf8'));toc=readFileSync(tocPath,'utf8');}
catch {console.error('INPUT_UNREADABLE_OR_INVALID');process.exit(2);}
const missing=[];
const checks=[];
function need(label,ok,why){checks.push({label,ok:!!ok});if(!ok)missing.push({label,why});}
const hash=x=>typeof x==='string'&&/^[0-9a-f]{64}$/.test(x);
const data=(schema,table)=>new RegExp('\\bTABLE DATA '+schema+' '+table+'\\b').test(toc);
const schema=s=>new RegExp('\\bSCHEMA - '+s+'\\b').test(toc);
need('manifest.format',manifest?.format==='attendance-secure-backup-v1','not the approved sealed backup manifest format');
need('database.dump digest declared',hash(manifest?.database_sha256),'missing/invalid SHA-256 digest declaration; digest not verified against bytes');
need('roles.globals digest declared',hash(manifest?.roles_sha256),'missing/invalid role archive digest declaration');
need('auth hosted config',manifest?.auth_config?.captured===true,'hosted Auth configuration not captured');
need('storage roster',Array.isArray(manifest?.storage),'Storage object roster absent');
need('storage roster count',Number.isSafeInteger(manifest?.full_storage_count)&&manifest.full_storage_count>=0&&Array.isArray(manifest.storage)&&manifest.storage.length===manifest.full_storage_count,'Storage count inconsistent');
need('storage object byte digests declared',Array.isArray(manifest?.storage)&&manifest.storage.every(o=>o&&hash(o.sha256)&&Number.isSafeInteger(o.bytes)&&o.bytes>=0&&typeof o.file==='string'&&o.file.length>0),'Storage bytes/hash/file declarations absent or invalid; file bytes not verified here');
need('TOC: auth schema',schema('auth'),'Auth DDL absent');
need('TOC: storage schema',schema('storage'),'Storage DDL absent');
need('TOC: business data',/\bTABLE DATA public\b/.test(toc),'public TABLE DATA absent');
need('TOC: auth.users data',data('auth','users'),'auth.users TABLE DATA absent');
need('TOC: sequence definition',/\bSEQUENCE\s+[^\n]+/.test(toc),'sequence DDL absent');
need('TOC: sequence values',/\bSEQUENCE SET\b/.test(toc),'sequence current-value entries absent');
need('TOC: RLS policies',/\bPOLICY\b|\bROW SECURITY\b/.test(toc),'RLS policy/setting entries absent');
// Production catalog read-only audit (2026-11-05) found 22 tables OUTSIDE the
// old public/auth/storage PGlite runner. These five schemas hold app/history
// state, not merely managed provider runtime internals. Fail closed on omission.
// Claude v2 schema classification consolidated here instead of introducing a weaker
// second checker. Business/private scopes require DDL + TABLE DATA presence; managed
// provider scopes require provider-specific reconstruction and are not blindly replayed.
const appSchemas=['pin_private','pos_private','session_guard','private','demo_cleanup_archive'];
const businessSchemas=['public','auth','storage',...appSchemas];
const managedSchemas=['cron','net','realtime','supabase_migrations','vault',
 'extensions','graphql','graphql_public','pgsodium'];
for(const s of appSchemas){
 need('TOC: app schema '+s,schema(s),'application/private/archive schema missing from full continuity backup');
 need('TOC: app data '+s,new RegExp('\\bTABLE DATA '+s+'\\b').test(toc),'no TABLE DATA entries for application/private/archive schema');
}
const result=missing.length?'BACKUP_SCOPE_INCOMPLETE':'BACKUP_SCOPE_METADATA_PRESENT';
console.log(JSON.stringify({result,checks_total:checks.length,checks_passed:checks.filter(c=>c.ok).length,missing,
 warning:'Metadata declarations and user-provided TOC only. Does NOT verify encrypted archive bytes, manifest authenticity, snapshots, provider-managed schemas, or service restore. Perform digest verification + real isolated restore separately.',
 business_schemas_required_in_backup:businessSchemas,
 provider_managed_schemas_require_separate_provisioning:managedSchemas},null,2));
process.exit(missing.length?1:0);
