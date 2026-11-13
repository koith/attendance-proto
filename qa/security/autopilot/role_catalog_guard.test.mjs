import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {summarizeRoleCatalog} from '../../../scripts/security/autopilot/role_catalog_guard.mjs';

test('synthetic fixture',()=>assert.deepEqual(summarizeRoleCatalog([{name:'A'}]),{count:1}));
test('accepts lower-case synthetic role identifiers',()=>assert.deepEqual(summarizeRoleCatalog([{id:'staff',privileges:['read']}],{expectedRoleIds:['staff']}),{count:1}));
test('rejects duplicate synthetic role identifiers',()=>assert.throws(()=>summarizeRoleCatalog([{id:'A',privileges:['read']},{id:'A',privileges:['write']}],{expectedRoleIds:['A']}),/ROLE_ID_DUPLICATE/));
test('rejects case-folded duplicate synthetic role identifiers',()=>assert.throws(()=>summarizeRoleCatalog([{id:'staff',privileges:['read']},{id:'STAFF',privileges:['write']}],{expectedRoleIds:['staff','STAFF']}),/CATALOG_INVALID|ROLE_ID_DUPLICATE/));
test('rejects privileged role name confusion',()=>assert.throws(()=>summarizeRoleCatalog([{id:'staff',name:'ADMIN',privileges:['read']},{id:'admin',name:'admin',privileges:['write']}],{expectedRoleIds:['staff','admin']}),/ROLE_NAME_CONFUSION/));
test('rejects missing synthetic role identifiers',()=>assert.throws(()=>summarizeRoleCatalog([],{expectedRoleIds:['A']}),/ROLE_ID_MISSING/));
test('rejects unexpected synthetic role identifiers',()=>assert.throws(()=>summarizeRoleCatalog([{id:'B',privileges:['read']}],{expectedRoleIds:['A']}),/ROLE_ID_UNEXPECTED/));
test('rejects missing required synthetic privilege metadata',()=>assert.throws(()=>summarizeRoleCatalog([{id:'A'}],{expectedRoleIds:['A']}),/PRIVILEGE_METADATA_MISSING/));
test('rejects malformed required synthetic privilege metadata',()=>assert.throws(()=>summarizeRoleCatalog([{id:'A',privileges:['read',' ']}],{expectedRoleIds:['A']}),/PRIVILEGE_METADATA_MISSING/));
