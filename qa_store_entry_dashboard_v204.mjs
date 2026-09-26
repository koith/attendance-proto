import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');

assert.ok(/const APP_VERSION="v\d+"/.test(html),'app version must be present');
assert.ok(html.includes('.store-context-selector-hidden,.store-context-selector-hidden #storeSelect{display:none!important}'),'locked selector CSS must override legacy important rules');
assert.ok(html.includes('shell.classList.toggle("store-context-selector-hidden",hideSelector)'),'selector shell must be hidden for store lock and dashboard');
assert.ok(html.includes('sel.hidden=hideSelector'),'native selector must also use the hidden attribute');
assert.ok(html.includes('if(STORE_ENTRY_LOCK)return;'),'store-only entry must reject HQ navigation');
assert.ok(html.includes('history.pushState(null,"",location.pathname+location.search+"#dashboard")'),'HQ navigation must not depend on a hashchange event');
assert.ok(/function openHqDashboard\(\)[\s\S]*?route\(\);\n}/.test(html),'HQ navigation must route immediately');

const start=html.indexOf('const STORE_ENTRY_PARAMS=');
const end=html.indexOf('function syncStoreSelectDisplay()',start);
assert.ok(start>0&&end>start,'store entry routing source must be extractable');
const source=html.slice(start,end);

function scenario({search='',hash='#pos'}){
  const makeEl=()=>({
    hidden:false,disabled:false,title:'',style:{},attrs:{},
    classList:{values:new Set(),toggle(name,on){on?this.values.add(name):this.values.delete(name)}},
    setAttribute(name,value){this.attrs[name]=value}
  });
  const els={storeSelect:makeEl(),storeCrumb:makeEl(),lockedStoreName:makeEl(),hqHome:makeEl(),shell:makeEl(),tabs:makeEl()};
  const location={search,hash,pathname:'/index.html'};
  const sessionStorage={data:new Map(),getItem(k){return this.data.get(k)||null},setItem(k,v){this.data.set(k,String(v))}};
  const document={
    getElementById(id){return els[id]||null},
    querySelector(sel){return sel==='.store-select-shell'?els.shell:sel==='.tabwrap'?els.tabs:null}
  };
  let routes=0;
  const history={pushState(_a,_b,url){location.hash=url.slice(url.indexOf('#'))}};
  const api=new Function('location','sessionStorage','document','history','route',source+';return {syncStoreContextUI,openHqDashboard,getLock:()=>STORE_ENTRY_LOCK};')(location,sessionStorage,document,history,()=>routes++);
  return {api,els,location,get routes(){return routes}};
}

const locked=scenario({search:'?mode=store&store=1'});
locked.api.syncStoreContextUI();
assert.equal(locked.api.getLock(),true);
assert.equal(locked.els.storeSelect.hidden,true);
assert.equal(locked.els.shell.hidden,true);
assert.equal(locked.els.storeCrumb.hidden,false);
assert.equal(locked.els.lockedStoreName.hidden,false);
assert.equal(locked.els.hqHome.disabled,true);
locked.api.openHqDashboard();
assert.equal(locked.routes,0,'locked store entry must not open HQ');

const hq=scenario({search:''});
hq.api.syncStoreContextUI();
assert.equal(hq.els.storeSelect.hidden,false);
assert.equal(hq.els.hqHome.disabled,false);
hq.api.openHqDashboard();
assert.equal(hq.location.hash,'#dashboard');
assert.equal(hq.routes,1,'general entry must route to HQ immediately');
hq.api.syncStoreContextUI();
assert.equal(hq.els.storeSelect.hidden,true,'HQ dashboard does not need the store selector');
assert.equal(hq.els.tabs.style.display,'none');

console.log('store entry/dashboard v204 QA PASS');
