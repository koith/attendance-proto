(()=>{
if(window.__nightPayV1)return;window.__nightPayV1=true;
if(typeof computeMonthPayroll!=='function')return;
const base=computeMonthPayroll;
const min=s=>{const a=String(s||'').slice(0,5).split(':').map(Number);return a.length===2?a[0]*60+a[1]:null};
function overlap(sessions,start,end){const sm=min(start),em=min(end);if(sm==null||em==null)return 0;let sec=0;for(const x of sessions||[]){if(x.status!=='COMPLETE'||!x.in||!x.out)continue;for(let d=new Date(x.in.getFullYear(),x.in.getMonth(),x.in.getDate()-1);d<=x.out;d.setDate(d.getDate()+1)){const a=new Date(d.getFullYear(),d.getMonth(),d.getDate(),Math.floor(sm/60),sm%60),b=new Date(d.getFullYear(),d.getMonth(),d.getDate()+(em<=sm?1:0),Math.floor(em/60),em%60),lo=Math.max(x.in,a),hi=Math.min(x.out,b);if(hi>lo)sec+=(hi-lo)/1000}}return sec}
computeMonthPayroll=async function(ym){const R=await base(ym);let tg=0,tn=0;for(const row of R.rows||[]){const c=row.contract,p=row.pay;if(p&&c?.night_allowance_enabled){const h=overlap(row.sessions,c.night_allowance_start||'22:00',c.night_allowance_end||'06:00')/3600,v=Number(c.night_allowance_value||0);const add=c.night_allowance_mode==='FLAT'?Math.round(h*v):Math.round(h*Number(p.wage||0)*v/100);p.nightHours=h;p.night=add;p.gross+=add;p.net=xrounddown(p.gross*(1-p.rate),-1)}if(p){tg+=p.gross;tn+=p.net}}R.totalGross=tg;R.totalNet=tn;window.__nightPayrollResult=R;return R};
})();