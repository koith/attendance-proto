// Exact, one-time static release. No SQL, Edge, Auth, Google or business writer.
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
export const INHA_STOCKTAKE_BASE='28176492b4453b40482f3ebaa77ed14839df1577';
export const INHA_STOCKTAKE_BYTES=Object.freeze({"index.html": "678aeb9225cdad56d70d27bd9e314c7ffeac02a48f4e2c7d56fa07781606a56d", "operations_staff_stocktake_v1.js": "b5b8485d205f615a74f54cc21ad352c0bc93d838b198ade80dd2901c8127fa35"});
const allowed=new Set(["qa_staff_stocktake_fast_mobile_entry_v350.mjs","qa_staff_stocktake_ui_v1.mjs","index.html", "operations_staff_stocktake_v1.js", "tests/inha_staff_stocktake_scope.test.mjs", "qa_inha_staff_stocktake_browser.mjs", "qa_staff_stocktake_pin_race_v1.mjs", "qa_staff_stocktake_dialog_v374.mjs", "scripts/inha_staff_stocktake_release.mjs", "scripts/inha_staff_stocktake_readback.mjs", ".github/workflows/inha-staff-stocktake.yml", ".github/workflows/p0-pages-deploy.yml", ".github/workflows/qa1243-live-e2e.yml", ".github/workflows/qa1243-owner-ready-pages-independent.yml", "PROJECT_BACKLOG_20261017.md"]);
export function assertInhaStocktakeRelease(files,message,before,{read=p=>readFileSync(p)}={}){
 for(const m of ['[INHA-STAFF-STOCKTAKE]','[QA1243-APP-PAGES]','[QA1243-NO-OPERATING-WRITE]','[QA1243-NO-GOOGLE-RERUN]'])if(!message.includes(m))throw Error('INHA_STOCKTAKE_MARKER');
 if(before!==INHA_STOCKTAKE_BASE)throw Error('INHA_STOCKTAKE_PARENT');
 if(!files?.length||files.length>=100||files.some(f=>!allowed.has(f.filename)||['removed','renamed'].includes(f.status)))throw Error('INHA_STOCKTAKE_SCOPE');
 for(const [p,h] of Object.entries(INHA_STOCKTAKE_BYTES)){
  if(!files.some(f=>f.filename===p))throw Error('INHA_STOCKTAKE_MISSING_RUNTIME');
  if(createHash('sha256').update(read(p)).digest('hex')!==h)throw Error('INHA_STOCKTAKE_BYTES');
 }
 return true;
}
