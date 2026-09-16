/* Coordinate the legacy 60s and senior 10s refresh loops so they cannot overlap. */
(()=>{
  if(window.__payrollRefreshCoordinatorV1||typeof drawPay!=='function')return;
  window.__payrollRefreshCoordinatorV1=true;
  const base=drawPay;let active=null,lastYm='',lastStarted=0;
  drawPay=function(ym,...args){
    const now=Date.now();
    if(active&&String(ym)===lastYm)return active;
    if(String(ym)===lastYm&&now-lastStarted<1500)return Promise.resolve();
    lastYm=String(ym);lastStarted=now;
    active=Promise.resolve(base.call(this,ym,...args)).finally(()=>{active=null});
    return active;
  };
})();