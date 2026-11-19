import assert from 'node:assert/strict';
import {chromium,webkit,devices} from 'playwright';

// Public, read-only test: no authentication, payroll, owner or attendance writes.
const base='https://koith.github.io/attendance-proto/index.html';
const expected=[
 [1,'인하대학교점'],[80,'1호점'],[94,'구로고척점'],[100,'낙성대점'],
 [131,'신길점'],[133,'신대방삼거리점'],[139,'암사중앙점'],
 [187,'산본역점'],[200,'아주대점'],[230,'하남풍산점'],
 [260,'청주가경점'],[290,'구미비산점'],[325,'수원시청역점'],
 [326,'광교상현점'],[327,'동해효가점'],[328,'용인역북점'],
 [329,'용인양지점'],[330,'봉천현대점']
];
assert.equal(expected.length,18);
assert.equal(new Set(expected.map(x=>x[0])).size,18);
const modes=[
 {name:'desktop-chromium',type:chromium,options:{viewport:{width:1365,height:900}}},
 {name:'iphone-webkit',type:webkit,options:{...devices['iPhone 13'],locale:'ko-KR'}}
];
const failures=[];
for(const mode of modes){
 const browser=await mode.type.launch({headless:true});
 try{
  for(let offset=0;offset<expected.length;offset+=3){
   await Promise.all(expected.slice(offset,offset+3).map(async ([id,name])=>{
    const context=await browser.newContext(mode.options),page=await context.newPage();
    const errors=[],listStoreRpcStatus=[];
    page.on('pageerror',err=>errors.push(err.name));
    page.on('response',resp=>{
      if(resp.url().includes('/rest/v1/rpc/list_stores'))listStoreRpcStatus.push(resp.status());
    });
    try{
      const url=base+'?mode=store&store='+id+'#pos';
      const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:25000});
      assert.equal(response?.status(),200,'Page HTTP status '+response?.status());
      await page.waitForFunction(([expectedId,expectedName])=>{
        const conn=document.getElementById('conn');
        const label=document.getElementById('lockedStoreName');
        const view=document.getElementById('view');
        return conn?.textContent?.includes('클라우드 연결됨') &&
          label?.textContent?.trim()===expectedName &&
          sessionStorage.getItem('baekeok_store_id')===String(expectedId) &&
          view&&!view.textContent.includes('지점 연결 확인 중');
      },[id,name],{timeout:18000});
      const state=await page.evaluate(()=>{
        const view=document.getElementById('view')?.textContent||'';
        return {
          store:sessionStorage.getItem('baekeok_store_id'),
          label:document.getElementById('lockedStoreName')?.textContent?.trim(),
          connection:document.getElementById('conn')?.textContent?.trim(),
          failureScreen:/지점 운영 준비 중|지점 서버 연결이 지연|지점 확인 필요|관리자 권한을 확인할 수 없습니다/.test(view),
          horizontalOverflow:document.documentElement.scrollWidth-window.innerWidth
        };
      });
      assert.ok(listStoreRpcStatus.some(s=>s===200),'list_stores read RPC not HTTP 200');
      assert.equal(state.store,String(id));
      assert.equal(state.label,name);
      assert.equal(state.failureScreen,false,'Failure screen displayed');
      assert.equal(errors.length,0,'Fatal JS page errors: '+errors.join(','));
      if(mode.name==='iphone-webkit')
        assert.ok(state.horizontalOverflow<=6,'iPhone horizontal overflow '+state.horizontalOverflow+'px');
      console.log('PASS',mode.name,id,name,'store-list',listStoreRpcStatus.join(','),'overflow',state.horizontalOverflow);
    }catch(error){
      const observation=await page.evaluate(()=>({
        store:sessionStorage.getItem('baekeok_store_id'),
        label:document.getElementById('lockedStoreName')?.textContent?.trim(),
        conn:document.getElementById('conn')?.textContent?.trim(),
        failureScreen:/지점 운영 준비 중|지점 서버 연결이 지연|지점 확인 필요/.test(document.getElementById('view')?.textContent||'')
      })).catch(()=>({}));
      const message=mode.name+' '+id+' '+name+': '+error.message+' '+JSON.stringify({observation,listStoreRpcStatus,errorTypes:errors});
      failures.push(message);console.error('FAIL',message);
    }finally{await context.close()}
   }));
  }
 }finally{await browser.close()}
}
console.log('LIVE_STORE_SHARE_QA',JSON.stringify({checked:expected.length*modes.length,failures:failures.length}));
if(failures.length)process.exitCode=1;
