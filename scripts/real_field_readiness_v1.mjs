#!/usr/bin/env node
// Read-only snapshot evaluator. A candidate is NEVER a real-data acceptance.
// Run SQL via authorized tools and pipe aggregate JSON here. No DB credentials.
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const num=(obj,key)=>{
 if(!obj||typeof obj!=='object'||!Object.hasOwn(obj,key)||
    typeof obj[key]!=='number'||!Number.isSafeInteger(obj[key])||obj[key]<0)
    throw Error('INVALID_SNAPSHOT_COUNT:'+key);
 return obj[key];
};
export function evaluateReadiness(s){
 if(!s||s.schema_version!==1||typeof s.captured_at!=='string'||
    !Number.isFinite(Date.parse(s.captured_at)))
   throw Error('INVALID_SNAPSHOT_METADATA');
 const p=s.payroll,st=s.stores,op=s.operations;
 const closed=num(p,'closed_periods');
 const snapshots=num(p,'closed_periods_with_snapshots');
 const weeks=num(p,'approved_weeks');
 const owners=num(st,'qualified_owner_links');
 const staged=num(st,'staged_count');
 const imports=num(op,'completed_imports');
 const linked=num(op,'confirmed_linked_real_transactions');
 const unresolved=num(op,'unresolved_reconciliations');
 const stock=num(op,'real_stock_movements');
 if(snapshots>closed)throw Error('IMPOSSIBLE_PAYROLL_COUNTS');
 const status=(candidate,missing,checks)=>({
   state:candidate?'READY_FOR_AUTHORIZED_FIELD_QA':'WAITING_REAL_EVIDENCE',
   // Field QA requires the actual authorized owner/payroll/POS operator, not CI.
   verified:false,missing,checks
 });
 return {
  source:'aggregate_read_only_snapshot',captured_at:s.captured_at,
  status:{
   'PAY-01':status(closed>0&&snapshots>0&&weeks>0,
     [closed===0&&'CLOSED_PAYROLL_PERIOD',snapshots===0&&'IMMUTABLE_SNAPSHOT',weeks===0&&'WEEKLY_APPROVAL'].filter(Boolean),
     {closed_periods:closed,snapshot_periods:snapshots,approved_weeks:weeks}),
   'STORE-01':status(owners>0,
     owners===0?['VERIFIED_READY_STORE_PRIMARY_OWNER_AND_MATCHING_MEMBERSHIP']:[],
     {qualified_owner_links:owners,staged_count:staged}),
   'FEATURE-01':status(imports>0&&linked>0&&unresolved===0,
     [imports===0&&'AUTHORIZED_COMPLETED_SOURCE_IMPORT',linked===0&&'CONFIRMED_NON_DEMO_RAW_LINKED_TRANSACTION',unresolved>0&&'UNRESOLVED_RECONCILIATIONS'].filter(Boolean),
     {completed_imports:imports,linked_confirmed:linked,unresolved_reconciliations:unresolved,real_stock_movements:stock})
  },
  conclusion:'DEVELOPMENT_COMPLETE_FIELD_EVIDENCE_PENDING'
 };
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const arg=process.argv[2];
 if(!arg)throw Error('Pass one authorized aggregate snapshot JSON path (never service keys)');
 const input=JSON.parse(readFileSync(arg,'utf8'));
 const report=evaluateReadiness(input);
 process.stdout.write(JSON.stringify(report,null,2)+'\n');
}
