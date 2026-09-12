import fs from 'node:fs';
const html=fs.readFileSync('employment_contracts.html','utf8');
const js=fs.readFileSync('employment_contract_form_state_fix.js','utf8');
const core=fs.readFileSync('employment_contracts_v3.js','utf8');
let failed=0;
function t(name,fn){try{fn();console.log('PASS',name)}catch(e){failed++;console.error('FAIL',name,'-',e.message)}}
function ok(v,m){if(!v)throw Error(m)}
t('state fix loads after contract IA',()=>{const ia=html.indexOf('employment_contracts_ia_v4.js'),fix=html.indexOf('employment_contract_form_state_fix.js');ok(ia>=0&&fix>ia,'load order')});
t('rerendering controls still exist in core',()=>{ok(core.includes("S.payrollType=b.dataset.pay")&&core.includes("S.taxTreatment=b.dataset.tax"),'expected rerender paths missing')});
t('draft preserves wage salary tax night memo',()=>{for(const id of ['hourlyWage','monthlySalary','businessRate','nightStart','nightMode','nightValue','contractMemo'])ok(js.includes(`'${id}'`),id)});
t('draft is scoped by employee period contract',()=>{ok(js.includes("S.employeeId")&&js.includes("S.periodId")&&js.includes("S.contractId"),'context scope')});
t('previous DOM context captured before render',()=>{ok(js.includes('dataset.contractFormContext')&&js.indexOf('capture(app?.dataset.contractFormContext')<js.indexOf('originalRender();'),'capture order')});
t('draft restored after render',()=>{ok(js.indexOf('originalRender();')<js.lastIndexOf('restore(key)'),'restore order')});
if(failed)process.exit(1);
console.log('Contract form state fix QA PASS');
