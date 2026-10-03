import fs from "node:fs";
const s=fs.readFileSync("index.html","utf8");
const must=['const APP_VERSION="v0.143"','break-cal-cell','const byDay=new Map()','byDay.get(day).push({x,i})','휴게 확인 대상 ${items.length}건','id="breakBack">달력으로','renderDay(Number(b.dataset.day))'];
for(const x of must) if(!s.includes(x)) throw new Error("missing calendar contract: "+x);
if(s.includes('rec.breakDecisions.map((x,i)=>{const s=x.session')) throw new Error("legacy full-month vertical list remains");
console.log("PASS payroll break calendar v0.143");
