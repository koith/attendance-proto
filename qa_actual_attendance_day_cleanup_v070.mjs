import fs from 'node:fs';
import assert from 'node:assert/strict';
const js=fs.readFileSync('actual_attendance.js','utf8');
const css=fs.readFileSync('actual_attendance.css','utf8');
const html=fs.readFileSync('actual_attendance.html','utf8');
const main=fs.readFileSync('index.html','utf8');

assert(main.includes('const APP_VERSION="v0.70";'),'app version must be v0.70');
assert(js.includes("employees=await rpc('admin_list_all_employees')"),'historical employees must resolve by name');
assert(!js.includes('||`#${id}`'),'month view must not expose raw employee ids');
assert(!js.includes('||`#${empId}`'),'day view must not expose raw employee ids');
assert(js.includes('const labels=[0,4,8,12,16,20,24]'),'day detail must show full 24-hour axis');
assert(js.includes('a/24*100') && js.includes('b/24*100'),'timeline bars must use 24-hour scale');
assert(js.includes('<section class="records-group"><h3>근무 기록 및 정정</h3>'),'lower section title required');
assert(js.includes('정정은 원본 출퇴근 기록을 변경하지 않고 정정 이력을 추가합니다.'),'correction note must be at the lower group');
assert(!js.includes('자정을 넘긴 근무는 날짜별로 나누어 표시합니다.'),'redundant midnight explanation must be removed');
assert(css.includes('.axis{width:100%;min-width:0!important}'),'timeline must fit available width');
assert(css.includes('overflow-x:hidden!important'),'timeline must not horizontally scroll');
assert(css.includes('grid-template-columns:60px minmax(0,1fr)'),'mobile portrait timeline must reserve compact name column');
assert(html.includes('actual_attendance.css?v=20260924d'),'actual attendance CSS cache key must be bumped');
assert(html.includes('actual_attendance.js?v=20260924c'),'actual attendance JS cache key must be bumped');

assert(main.includes('.att-card-head{display:grid;grid-template-columns:minmax(0,1fr) auto'),'admin today attendance cards must use employee-card style header');
assert(main.includes('class="att-edit-icon" data-fix="${e.id}"'),'admin attendance edit action must be icon-only');
assert(main.includes('aria-label="${safeHtml(e.name)} 근태 수정"'),'edit icon must retain accessible label');
assert(!main.includes('data-fix="${e.id}">수정</button>'),'text edit button must be removed from today attendance cards');
assert(main.includes('att-name">${safeHtml(e.name)}<small>(No.${safeHtml(e.id)})</small>'),'admin attendance card must match name/No hierarchy');
assert(main.includes('class="payroll-total-value" style="width:100%;text-align:center;'),'payroll total amount must be centered');

new Function(js);
console.log('actual attendance day cleanup v0.70: PASS');