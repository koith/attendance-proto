// Synchronize a migration-free Supabase GitHub Integration working directory.
// Usage: node scripts/sync_supabase_native_edge_release.mjs --check
//        node scripts/sync_supabase_native_edge_release.mjs --sync
// The default is CHECK, never a production API deploy.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';

const root=process.cwd();
const src=path.join(root,'supabase/functions/server-sync-sheet');
const output=path.join(root,'edge-release/supabase/functions/server-sync-sheet');
const base=path.join(root,'edge-release/supabase');
const names=['index.ts','engine.mjs','payroll_policy.mjs',
 'sheet_minute_reconciliation.mjs','sheet_working_payable.mjs'];
const args=process.argv.slice(2);
assert.ok(args.length===0||(args.length===1&&['--check','--sync'].includes(args[0])),
 'Only --check or --sync is supported');
const sync=args[0]==='--sync';
assert.ok(!fs.existsSync(path.join(base,'migrations')),
 'Native integration must never read the historical supabase/migrations directory');
const config=fs.readFileSync(path.join(base,'config.toml'),'utf8');
assert.match(config,/\[functions\.server-sync-sheet\][\s\S]*?verify_jwt\s*=\s*false/,
 'Keep existing custom-authorization boundary (live Edge JWT gateway is off)');
assert.doesNotMatch(config,/SUPABASE_ACCESS_TOKEN|SERVICE_ROLE_KEY|sbp_[a-z0-9]/i,
 'No credentials belong in release config');
if(sync) fs.mkdirSync(output,{recursive:true});
for(const name of names){
 const original=fs.readFileSync(path.join(src,name));
 if(sync)fs.writeFileSync(path.join(output,name),original);
 assert.ok(fs.existsSync(path.join(output,name)),'Missing mirrored Edge dependency: '+name);
 assert.deepEqual(fs.readFileSync(path.join(output,name)),original,
  'Native GitHub integration must deploy exact canonical source: '+name);
}
const entries=fs.readdirSync(output).sort();
assert.deepEqual(entries,names.slice().sort(),'Unexpected function dependency in release mirror');
console.log((sync?'SYNCHRONIZED':'PASS')+
 ' tokenless native Supabase Edge mirror: 5 exact files, no historical migrations, no secrets');
