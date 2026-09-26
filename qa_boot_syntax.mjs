import fs from "node:fs";
const html=fs.readFileSync("index.html","utf8");
const scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)].filter(m=>! /\bsrc\s*=/.test(m[1]));
let failed=false;
for(let i=0;i<scripts.length;i++){
  try{ new Function(scripts[i][2]); }
  catch(e){ failed=true; console.error("inline script "+i+" syntax error:",e.message); }
}
if(/;\\\\n\s+[A-Za-z_$]/.test(html)){failed=true;console.error("literal \\\\n found in executable-looking source");}
if(failed)process.exit(1);
console.log("boot syntax QA passed:",scripts.length,"inline script(s)");
