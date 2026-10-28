// Real route/auth/PIN handlers and real recipe module; synthetic sessions only.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
const index=readFileSync('index.html','utf8');
const cut=(a,b)=>{const i=index.indexOf(a),j=index.indexOf(b,i);assert.ok(i>0&&j>i,a);return index.slice(i,j)};
const router=cut('function setTab(', '/* ---------------------- POS 화면');
const staff=cut('async function openMyRecord(){','// STEP 2: 내 기록');
const styles=index.match(/<style>([\s\S]*?)<\/style>/)[1];
const setup=`
const view=document.getElementById('view'),LIVE=true,CURRENT_STORE_ID=1;
let STORE_ENTRY_LOADING=false,STORE_ENTRY_UNAVAILABLE=false,STORE_ENTRY_LOCK=false,_posTimer=null;
window.QA={logged:false,role:'STORE_MANAGER',scope:{limited:false},delay:'',fail:''};window.pending={};
async function waitForFixture(key){if(QA.delay===key)await new Promise(resolve=>pending[key]=resolve);if(QA.fail===key)throw Error('synthetic failure');}
const Auth={isLoggedIn:()=>QA.logged,login:async()=>{await waitForFixture('login');QA.logged=true},clear:()=>{QA.logged=false}};
const BE={adminContext:async()=>{await waitForFixture('context');return {role:QA.role,store_id:1}},
 delegatedPermissionsSelf:async()=>{await waitForFixture('scope');return QA.scope},
 tempOwnerPreflight:async()=>({ok:false}),isAdmin:async()=>false,
 posPublicStaffCards:async()=>{await waitForFixture('staff');return [{id:11,name:'합성 직원'}]},
 publicStoreRecipeList:async()=>{await waitForFixture('recipe');return []},storeRecipeList:async()=>[],
 myEvents:async()=>{window.privateRead=true;return {ok:false,error:'BAD_PIN'}}};
function safeHtml(v){return String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}
function syncStoreContextUI(){}function toast(){}function showStoreStartup(){}
function attendanceEntryUrl(staff=false){return '/actual_attendance.html?store=1'+(staff?'&mode=staff':'')}
function STORE_ENTRY_URL(id){return '/?mode=store&store='+id+'#admin'}
function renderPos(){view.innerHTML='<h2>출퇴근</h2>'}
function renderAdmin(){view.innerHTML='<h2 id="qaAdmin">직원 관리</h2>'}
function renderPay(){view.innerHTML='<h2>급여</h2>'}function renderStoreHours(){view.innerHTML='<h2>운영시간</h2>'}
function renderOperations(){view.innerHTML='<h2>운영</h2>'}function renderDashboard(){view.innerHTML='<h2>본사</h2>'}
function mrRange(){return {fs:'',ts:''}}function openAddVeil(){document.getElementById('addVeil').classList.add('show')}
window.mountScopedManagerPortal=async()=>{view.innerHTML='<h2 id="qaLimited">내 업무</h2>'};
`;
const html=`<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style><div class="wrap"><nav class="tabwrap tabs"><a id="tabPos" href="#pos">출퇴근</a><a id="tabAttendance" href="#attendance">근무현황</a><a id="tabRecipe" href="#recipe">레시피</a><a id="tabAdmin" href="#admin">관리</a></nav><main id="view"></main></div><div id="addVeil" class="modal-veil"><div class="modal"></div></div><script>${setup}\n${router}\n${staff}</script><script src="/recipe_access_v220.js"></script><script>document.getElementById('addVeil').onclick=e=>{if(e.target.id==='addVeil')e.currentTarget.classList.remove('show')};route()</script>`;
new Function(setup+'\n'+router+'\n'+staff);
if(process.argv.includes('--syntax-only')){console.log('PASS extracted canonical route/auth/PIN browser fixture parses');process.exit(0)}
const server=createServer((req,res)=>{const path=new URL(req.url,'http://local').pathname;res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':'text/html; charset=utf-8');res.end(path==='/recipe_access_v220.js'?readFileSync('recipe_access_v220.js'):path==='/actual_attendance.html'?'<h1 id="actual">근무현황</h1>':html)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,proof=[];
mkdirSync('qa-results/protected-tab-entry-v378',{recursive:true});
try{for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await type.launch({headless:true});try{for(const width of [393,1280]){
  const context=await browser.newContext({viewport:{width,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.route('**/*',route=>{assert.equal(new URL(route.request().url()).origin,base,'No external operating API');return route.continue()});
  const pass=name=>proof.push({engine,width,name,result:'PASS',operatingWrite:false});
  const recipe=async()=>{await page.goto(base+'/?fixture='+Date.now()+'#recipe');await page.locator('.recipe-v220').waitFor()};
  const closePicker=async()=>{await page.locator('#mrEmp').waitFor();await page.locator('#addVeil').click({position:{x:2,y:2}});await page.waitForFunction(()=>!document.getElementById('addVeil').classList.contains('show'))};
  const release=async key=>{await page.waitForFunction(k=>!!window.pending[k],key);await page.evaluate(k=>{QA.delay='';pending[k]()},key)};
  await recipe();await page.locator('#tabAttendance').click();await closePicker();
  assert.equal(await page.locator('#tabAttendance.on').count(),1);assert.equal(await page.locator('.recipe-v220').count(),0);
  await page.locator('#attendanceAdminLogin').waitFor();pass('attendance keeps its login entry after PIN popup closes');
  await page.locator('#attendanceStaffLogin').click();await page.locator('#mrView').click();
  assert.match(await page.locator('#mrHint').innerText(),/비밀번호 4자리/);assert.equal(await page.evaluate(()=>!!window.privateRead),false);await closePicker();pass('staff can reopen PIN entry; empty PIN never reads private records');
  await page.locator('#attendanceAdminLogin').click();await page.evaluate(()=>QA.fail='login');
  await page.locator('#loginEmail').fill('manager@synthetic.invalid');await page.locator('#loginPw').fill('fixture-password');await page.locator('#loginBtn').click();
  await page.getByText('로그인 실패: 이메일/비밀번호를 확인하세요.').waitFor();assert.equal(await page.locator('#tabAttendance.on').count(),1);assert.equal(await page.locator('.recipe-v220').count(),0);pass('failed manager login remains on selected attendance tab');
  await page.evaluate(()=>{QA.fail='';QA.scope={limited:true,attendance_view:true}});await page.locator('#loginBtn').click();await page.waitForURL(/actual_attendance\.html\?store=1/);pass('permitted assistant login resumes requested attendance route');
  for(const hash of ['admin','pay','hours','report','sales','inventory']){
   await recipe();await page.evaluate(h=>location.hash='#'+h,hash);await page.locator('#loginBtn').waitFor();assert.equal(await page.locator('#tabAdmin.on').count(),1);assert.equal(await page.locator('.recipe-v220').count(),0);
  }pass('all protected management routes replace prior recipe with login form');
  await recipe();await page.evaluate(()=>{QA.delay='recipe';window.renderRecipeHub()});await page.locator('#tabAdmin').click();await page.locator('#loginBtn').waitFor();await release('recipe');
  await page.waitForTimeout(30);assert.equal(await page.locator('#loginBtn').count(),1);assert.equal(await page.locator('.recipe-v220').count(),0);pass('late recipe success cannot overwrite selected management login');
  await recipe();await page.evaluate(()=>{QA.delay='recipe';QA.fail='recipe';window.renderRecipeHub()});await page.locator('#tabAdmin').click();await page.locator('#loginBtn').waitFor();await release('recipe');await page.waitForTimeout(30);assert.equal(await page.locator('#loginBtn').count(),1);pass('late recipe failure cannot overwrite selected management login');
  await recipe();await page.evaluate(()=>QA.delay='staff');await page.locator('#tabAttendance').click();await page.locator('#attendanceEntry').waitFor();await page.locator('#tabRecipe').click();await page.locator('.recipe-v220').waitFor();await release('staff');await page.waitForTimeout(30);assert.equal(await page.locator('#addVeil.show').count(),0);pass('late staff roster cannot open PIN popup over another tab');
  await page.evaluate(()=>{QA.logged=true;QA.delay='context';location.hash='#admin'});await page.getByText('관리자 권한을 확인하는 중…').waitFor();await page.locator('#tabRecipe').click();await page.locator('.recipe-v220').waitFor();await release('context');await page.waitForTimeout(30);assert.equal(await page.locator('#qaAdmin,#qaLimited').count(),0);pass('late admin context cannot mount previous protected screen');
  await recipe();await page.locator('#tabAdmin').click();await page.locator('#loginBtn').waitFor();await page.evaluate(()=>QA.delay='login');await page.locator('#loginEmail').fill('manager@synthetic.invalid');await page.locator('#loginPw').fill('fixture-password');await page.locator('#loginBtn').click();await page.locator('#tabRecipe').click();await page.locator('.recipe-v220').waitFor();await release('login');await page.waitForTimeout(30);assert.equal(await page.locator('#qaAdmin,#qaLimited').count(),0);pass('late successful login does not replace newly selected recipe tab');
  await page.evaluate(()=>{QA.scope={limited:true,attendance_view:true};QA.delay='scope';location.hash='#attendance'});await page.locator('#attendanceEntry').waitFor();await page.locator('#tabRecipe').click();await page.locator('.recipe-v220').waitFor();await release('scope');await page.waitForTimeout(30);assert.equal(new URL(page.url()).hash,'#recipe');pass('late attendance permission response does not redirect away from current tab');
  await page.evaluate(()=>{QA.scope={limited:true,attendance_view:false,attendance_approve:false};location.hash='#attendance'});await page.getByText('근태 조회 권한이 없습니다. 대표 관리자에게 권한을 요청하세요.').waitFor();assert.equal(await page.locator('#tabAttendance.on').count(),1);assert.equal(await page.locator('.recipe-v220').count(),0);pass('denied assistant sees attendance permission state without stale content');
  assert.deepEqual(errors,[]);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`qa-results/protected-tab-entry-v378/${engine}-${width}.png`});await context.close();
 }}finally{await browser.close()}
}}finally{await new Promise(r=>server.close(r))}
writeFileSync('qa-results/protected-tab-entry-v378/report.json',JSON.stringify(proof,null,2));console.log('PROTECTED_TAB_ENTRY_BROWSER_PASS '+proof.length);
