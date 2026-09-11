import fs from 'node:fs';
const src=fs.readFileSync('index.html','utf8');
const names=['fromIso','xround','xrounddown','calcPayroll','applyCorrections','pairEvents','idOrder','fingerprintOf'];
function extract(name){
  const token=`function ${name}(`;const start=src.indexOf(token);if(start<0)throw new Error(`MISSING_FUNCTION:${name}`);
  const brace=src.indexOf('{',start);let depth=0,quote=null,escape=false,lineComment=false,blockComment=false;
  for(let i=brace;i<src.length;i++){
    const c=src[i],n=src[i+1];
    if(lineComment){if(c==='\n')lineComment=false;continue}
    if(blockComment){if(c==='*'&&n==='/'){blockComment=false;i++}continue}
    if(quote){if(escape){escape=false;continue}if(c==='\\'){escape=true;continue}if(c===quote)quote=null;continue}
    if(c==='/'&&n==='/'){lineComment=true;i++;continue}
    if(c==='/'&&n==='*'){blockComment=true;i++;continue}
    if(c==='"'||c==="'"||c==='`'){quote=c;continue}
    if(c==='{')depth++;
    else if(c==='}'){depth--;if(depth===0)return src.slice(start,i+1)}
  }
  throw new Error(`UNCLOSED_FUNCTION:${name}`);
}
const body=names.map(extract).join('\n\n')+`\n\nmodule.exports={${names.join(',')}};\n`;
fs.writeFileSync('extracted_logic.js_module',body);
console.log(`extracted ${names.length} functions`);
