import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const target=new URL('./isolated_recovery_runner.mjs',import.meta.url).pathname;
test('non-fixture database refused without invoking psql',()=>{
 const output=(()=>{try{execFileSync(process.execPath,[target],{
  env:{...process.env,PGDATABASE:'postgres',PIN_QA_PSQL:'/does/not/exist'},stdio:'pipe'});return '';}
  catch(e){assert.equal(e.status,2);return e.stderr.toString();}})();
 assert.match(output,/ISOLATION_REFUSED/);
});
test('every SQL process has same-session backend+marker guards and explicit db',()=>{
 const s=readFileSync(target,'utf8');
 assert.match(s,/guard\+' '\+sql/);
 assert.match(s,/--dbname',DB/);
 assert.match(s,/ISOLATION_ABORT_FIXTURE_MISMATCH/);
 assert.match(s,/ISOLATION_ABORT_DIRTY_DATABASE/);
 assert.doesNotMatch(s,/^\s*psql\(`?\s*drop\s+(?:schema|table)/im);
});