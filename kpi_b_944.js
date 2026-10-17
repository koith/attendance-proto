/* #944 Resize-aware KPI text fitting. Preserve exact values in title. */
(()=>{'use strict';let scheduled=false;
function fit(){scheduled=false;document.querySelectorAll('.ops-kpis .ops-kpi b,.hq-summary>div b').forEach(el=>{
if(!el.dataset.kpiExact)el.dataset.kpiExact=el.textContent||'';
const exact=el.dataset.kpiExact;if(el.textContent!==exact)el.textContent=exact;
el.style.removeProperty('--kpi-fit-font');const primary=!!el.closest('.ops-kpi.primary')||!!el.closest('.hq-summary>div:nth-child(2)');
let size=primary?34:19;el.style.setProperty('--kpi-fit-font',size+'px');
while(el.scrollWidth>el.clientWidth+1&&size>10){size--;el.style.setProperty('--kpi-fit-font',size+'px')}
if(el.scrollWidth>el.clientWidth+1){const m=exact.replace(/,/g,'').match(/^(-?\d+(?:\.\d+)?)(원|개|건)$/);
if(m){const n=Number(m[1]),a=Math.abs(n);let short=a>=1e12?(n/1e12).toFixed(2)+'조':a>=1e8?(n/1e8).toFixed(2)+'억':a>=1e4?(n/1e4).toFixed(1)+'만':null;if(short){el.textContent=short.replace(/\.00(?=[조억])|\.0(?=만)/,'')+m[2];size=primary?34:19;el.style.setProperty('--kpi-fit-font',size+'px');while(el.scrollWidth>el.clientWidth+1&&size>10){size--;el.style.setProperty('--kpi-fit-font',size+'px')}}}}
el.title=exact;
})}
function schedule(){if(!scheduled){scheduled=true;requestAnimationFrame(fit)}}
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
if(typeof ResizeObserver!=='undefined')new ResizeObserver(schedule).observe(document.documentElement);
addEventListener('resize',schedule);document.readyState==='loading'?addEventListener('DOMContentLoaded',schedule):schedule();
})();