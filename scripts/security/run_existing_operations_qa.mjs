import {spawnSync} from 'node:child_process';
const suites=[
 ['attendance','qa_actual_attendance_store_scope_v1.mjs'],
 ['attendance','qa_store_night_test_v1.mjs'],
 ['payroll','qa_multistore_payroll_isolation_v1.mjs'],
 ['payroll','qa_payroll_contract_authority_v1.mjs'],
 ['payroll','qa_payroll_close_server_authority_v1.mjs'],
 ['sheets','qa_sheet_store_isolation_v1.mjs'],
 ['sheets','qa_sheet_snapshot_store_scope_v1.mjs'],
 ['delegation','qa_store_delegated_manager_v1.mjs']
];
const minimalEnvironment={PATH:process.env.PATH||'/usr/bin:/bin',HOME:process.env.HOME||'/tmp',TMPDIR:'/tmp'};
const results=suites.map(([group,test])=>{
 const r=spawnSync(process.execPath,[test],{cwd:process.cwd(),env:minimalEnvironment,encoding:'utf8',timeout:45000,maxBuffer:1048576});
 return {group,test,result:r.status===0?'PASS':'FAIL',exit:r.status};
});
console.log(JSON.stringify({level:'OFFLINE_REGRESSION',results,pass:results.filter(x=>x.result==='PASS').length,total:results.length}));
if(results.some(x=>x.result==='FAIL'))process.exitCode=1;
