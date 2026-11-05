// SEC continuity C: service-independence dependency inventory. OFFLINE, read-only.
// Scans the repo and emits the dependency surface needed to rebuild the service in a SEPARATE
// environment: GitHub, Supabase (DB/Auth/Storage/Edge), Google Apps Script + Sheets, Pages
// deploy, and recovery-key material. Lists secret/var NAMES only — never values. Does not
// contact any service, change any permission, or transfer ownership.
//
// Usage: node service_dependency_inventory.mjs [repoRoot]  -> JSON on stdout
import {readdirSync,readFileSync,existsSync,statSync} from 'node:fs';
import {join} from 'node:path';

const ROOT=process.argv[2]||process.cwd();
const wf=join(ROOT,'.github','workflows');

function listDir(p){try{return readdirSync(p);}catch{return [];}}
function read(p){try{return readFileSync(p,'utf8');}catch{return '';}}

// Secret/var NAMES referenced across workflows (names only, no values).
const secretNames=new Set(), varNames=new Set();
for(const f of listDir(wf)){
 const t=read(join(wf,f));
 for(const m of t.matchAll(/secrets\.([A-Z0-9_]+)/g))secretNames.add(m[1]);
 for(const m of t.matchAll(/vars\.([A-Z0-9_]+)/g))varNames.add(m[1]);
}

// Edge Functions present in the repo.
const edgeFns=listDir(join(ROOT,'supabase','functions')).filter(n=>{
 try{return statSync(join(ROOT,'supabase','functions',n)).isDirectory();}catch{return false;}
});

// Migrations count (DDL/data rebuild source of truth).
const migrations=listDir(join(ROOT,'supabase','migrations')).filter(n=>n.endsWith('.sql'));

// Deploy workflows (Pages / Edge / Apps Script release paths).
const deployWf=listDir(wf).filter(n=>/deploy|pages|release|apps-script/i.test(n));

// Recovery key material (public pems only; private keys must live OUTSIDE the repo).
const secDir=join(ROOT,'security');
const pems=listDir(secDir).filter(n=>n.endsWith('.pem'));

const inventory={
 generated_at:new Date().toISOString(),
 repo_root_basename:ROOT.split('/').pop(),
 components:[
  {name:'GitHub repository + Actions', rebuild:'Source of truth for app (index.html), migrations, Edge fns, workflows. Independent rebuild = fork/clone to a new owner, re-create Actions secrets (names below), re-enable Pages.', blocking:['GitHub org access','Actions secrets re-entry']},
  {name:'Supabase project (DB/Auth/Storage)', rebuild:'Isolated new project; reconcile '+migrations.length+' repo migrations against live migration history BEFORE choosing schema restore vs migration replay (never blindly do both); restore actual encrypted full dump with a separate verified PostgreSQL restore procedure. The synthetic runner cannot restore production data. Rebuild Auth and Storage services; rotate service keys.', blocking:['New project (free tier OK; no paid infra)','Decrypted escrow for data','Storage bucket recreation']},
  {name:'Supabase Edge Functions', rebuild:'Repository contains '+edgeFns.length+' Edge function directories: '+edgeFns.join(', ')+'. Validate against live Edge function inventory; this repo-only list is NOT exhaustive. Redeploy approved versions and reconfigure secrets without exposing values.', blocking:['supabase functions deploy','per-fn secrets']},
  {name:'Google Apps Script + Sheets', rebuild:'Re-create the standalone Apps Script web app and target Sheet; re-authorize Google OAuth; update APPS_SCRIPT_ID/DEPLOYMENT_ID and sheet id. Server-sync Edge fn depends on this.', blocking:['Google account access','OAuth re-consent','new Sheet + Apps Script project']},
  {name:'GitHub Pages deploy', rebuild:'Static single-file app deploys from main via Pages. Deploy workflows: '+deployWf.join(', ')+'.', blocking:['Pages enabled on new repo']},
  {name:'Auth service (GoTrue hosted config)', rebuild:'Hosted Auth config may be captured in encrypted backup (hosted_config_only). Recreate project configuration, verify users and app login in isolated environment; revoke/reissue JWT, OAuth and service secrets. Do not migrate live refresh tokens/sessions as valid new-environment credentials.', blocking:['New project Auth config','token re-issue']},
  {name:'Recovery key material', rebuild:'Public recipient pem(s) in repo: '+(pems.join(', ')||'(none)')+'. PRIVATE decryption key MUST be held outside the repo (operator escrow). Without it, sealed backups cannot be decrypted.', blocking:['Operator-held private key (off-repo)']}
 ],
 required_secret_names:[...secretNames].sort(),
 required_var_names:[...varNames].sort(),
 counts:{migrations:migrations.length, edge_functions:edgeFns.length, deploy_workflows:deployWf.length, recovery_pems:pems.length},
 coverage:'REPOSITORY-ONLY snapshot. Live DB schemas, runtime Edge functions, migrations, Google Apps Script deployment and provider-owned services MUST be inventoried independently before declaring restoration ready.',
 safety:'Inventory only. No service contacted, no permission changed, no ownership transferred. Secret VALUES are never read or emitted — names only.'
};
console.log(JSON.stringify(inventory,null,2));