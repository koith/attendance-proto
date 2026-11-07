// SEC-S17: ordered, executable independent-recovery plan derived from the repository inventory
// (service_dependency_inventory.mjs). Offline; contacts nothing; changes no permission/ownership.
// Each step says AUTO (runs from this repo with disposable/isolated targets) or OPERATOR
// (needs a human with provider access / consent), its verification command and its rollback.
// Usage: node recovery_plan.mjs [repoRoot] [--markdown]
import {execFileSync} from 'node:child_process';
import {dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const HERE=dirname(fileURLToPath(import.meta.url));

export function plan(root=process.cwd()){
 const inv=JSON.parse(execFileSync(process.execPath,[join(HERE,'service_dependency_inventory.mjs'),root],{encoding:'utf8'}));
 const S=(id,mode,title,run,verify,rollback,needs=[])=>({id,mode,title,run,verify,rollback,needs});
 const steps=[
  S('K1','OPERATOR','Retrieve an offline-held recovery private key (never into the repo)','operator custody',
   'node scripts/security/recovery/key_custody.mjs check .','none (read-only)'),
  S('K2','AUTO','Key drill: rotation / revocation / single-key loss on synthetic keys',
   'node scripts/security/recovery/key_custody.mjs drill','result=DRILL_PASS','none (temp only)'),
  S('B1','OPERATOR','Obtain the newest sealed backup (Actions artifact "sealed-attendance-recovery" or Drive mirror)',
   'gh run download <run-id> -n sealed-attendance-recovery (operator token)','sha256sum attendance-live.sealed recorded','none (copy only)',['K1']),
  S('B2','AUTO','Isolated restore + verification of that archive (disposable cluster, no TCP)',
   'node scripts/security/recovery/restore_verify.mjs --sealed attendance-live.sealed --key <offline.pem> --expected-scope prod-scope.json --report restore.json',
   'restore.json result=PASS; stages digests/scope/pg_restore/sequences/storage_roster ok','automatic: temp dir + cluster disposed; source archive hash re-checked',['B1']),
  S('D1','OPERATOR','Create a NEW isolated Supabase project (free tier) — no change to the live project',
   'Supabase dashboard / CLI by owner','project ref recorded','delete the new project only',['B2']),
  S('D2','OPERATOR','Decide schema path: migration replay ('+inv.counts.migrations+' repo migrations) XOR dump restore — never both',
   'compare supabase_migrations history in restore.json vs supabase/migrations','decision recorded','none',['D1']),
  S('D3','OPERATOR','Restore roles globals, then business schemas (public, auth, storage, pin_private, pos_private, session_guard, private, demo_cleanup_archive) into the NEW project',
   'psql -f roles.globals.sql; pg_restore --use-list <business list> (same list restore_verify builds)',
   'node scripts/security/recovery/db_inventory.mjs <new-db> > new.json && node scripts/security/recovery/compare_inventory.mjs src.json new.json',
   'drop and recreate the NEW project database only',['D2']),
  S('D4','OPERATOR','Provider-managed schemas (cron, net, realtime, vault, supabase_migrations, graphql …): recreate via provider features, not replay',
   'enable extensions / re-create cron jobs from reviewed list','compare_inventory managed section reviewed','disable re-created jobs',['D3']),
  S('A1','OPERATOR','Auth: apply captured hosted Auth config; re-issue JWT secret, OAuth client secrets; users re-authenticate (no session migration)',
   'Management API / dashboard','test login with a QA account in the NEW project','revert config of the NEW project',['D3']),
  S('ST1','OPERATOR','Storage: recreate buckets/policies, upload verified object bytes from the archive',
   'upload storage/NNNNN.bin by manifest name','per-object SHA-256 equals manifest (restore_verify digests stage)','delete NEW buckets',['D3']),
  S('E1','OPERATOR','Edge Functions: deploy approved versions ('+inv.counts.edge_functions+' in repo; live list must be compared) and set secrets by NAME',
   'supabase functions deploy <fn> --project-ref <new>','function smoke calls against NEW project','undeploy from NEW project',['A1','ST1']),
  S('G1','OPERATOR','Google Apps Script + Sheet: new script/sheet owned by the recovery owner; OAuth re-consent; update IDs',
   'clasp push / deploy (owner)','server-sync Edge function round-trip with a test row','disable the new deployment',['E1']),
  S('P1','OPERATOR','GitHub repo/Actions/Pages in the recovery owner account; re-enter secrets by name ('+inv.required_secret_names.length+' names)',
   'fork/clone + secrets set','Pages build + app version badge','disable Pages on the new repo',['E1']),
  S('C1','OPERATOR','Cutover rehearsal with SEC-S16 delta re-apply (records written after the backup)',
   'scripts/security/autopilot/reapply_guard.mjs (PR #1506) on an isolated copy','compare_inventory MATCH after delta','keep the live system authoritative; discard the copy',['G1','P1']),
 ];
 return {format:'attendance-recovery-plan-v1',generated_at:new Date().toISOString(),
  inventory_counts:inv.counts,required_secret_names:inv.required_secret_names,steps,
  auto_steps:steps.filter(s=>s.mode==='AUTO').map(s=>s.id),
  safety:'Plan only. No account ownership/permission change. Live project is never a restore target.'};
}

export function validatePlan(p){
 const ids=p.steps.map(s=>s.id),pos=Object.fromEntries(ids.map((id,i)=>[id,i]));
 const errors=[];
 for(const s of p.steps){
  if(!s.verify||!s.rollback)errors.push(s.id+': verify/rollback missing');
  for(const n of s.needs){if(!(n in pos))errors.push(s.id+': unknown dependency '+n);else if(pos[n]>=pos[s.id])errors.push(s.id+': runs before its dependency '+n)}
 }
 if(new Set(ids).size!==ids.length)errors.push('duplicate ids');
 return errors;
}

if(import.meta.url===pathToFileURL(process.argv[1]||'').href){
 const p=plan(process.argv[2]&&!process.argv[2].startsWith('--')?process.argv[2]:process.cwd());
 const errors=validatePlan(p);
 if(process.argv.includes('--markdown')){
  console.log('| # | mode | step | verify | rollback |\n|---|---|---|---|---|');
  for(const s of p.steps)console.log(`| ${s.id} | ${s.mode} | ${s.title} | \`${s.verify}\` | ${s.rollback} |`);
 }else console.log(JSON.stringify({...p,errors},null,1));
 process.exit(errors.length?1:0);
}
