import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const src=fs.readFileSync('version_test_toggle_982.js','utf8');
const real=fs.readFileSync('test_mode_ui_v1.js','utf8');
assert(real.includes("wrap.id='testModeControls'"));
const controls={id:'testModeControls',style:{display:'',setProperty(k,v){if(k==='display')this.display=v}}};
const button={textContent:'v0.314',attrs:{},setAttribute(k,v){this.attrs[k]=v},addEventListener(k,fn){if(k==='click')this.click=fn}};
const document={body:{},getElementById(id){return id==='appVersion'?button:id==='testModeControls'?controls:null}};
class MutationObserver{constructor(fn){this.callback=fn}observe(){}}
vm.runInNewContext(src,{document,MutationObserver});
assert.equal(controls.style.display,'flex','initial visible');
button.click();assert.equal(controls.style.display,'none','click hides');
button.click();assert.equal(controls.style.display,'flex','second click restores');
button.click();assert.equal(controls.style.display,'none','third click hides again');
console.log('Exact #testModeControls toggle: 4/4 PASS');
