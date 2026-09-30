import fs from "node:fs";
const index=fs.readFileSync("index.html","utf8"),js=fs.readFileSync("recipe_access_v220.js","utf8"),rc=fs.readFileSync("recipe_access_v220.css","utf8"),ac=fs.readFileSync("actual_attendance_correction.css","utf8");
const checks={
 version:(()=>{const m=index.match(/APP_VERSION="v0\.(\d+)"/);return !!m&&Number(m[1])>=90})(),
 singleRecipe:js.includes('has-focused-recipe')&&js.includes('is-search-hidden')&&js.includes('x!==card'),
 restoreResults:js.includes('classList.remove("has-focused-recipe")')&&js.includes('classList.remove("is-search-hidden")'),
 fallbackTwoTier:rc.includes('font-size:2.45rem')&&rc.includes('font-size:.88rem')&&rc.includes('font-size:3.4rem'),
 iosFieldCenter:ac.includes('::-webkit-date-and-time-value')&&ac.includes('::-webkit-datetime-edit')&&ac.includes('align-items:center')
};for(const [k,v] of Object.entries(checks)){console.log(k,v?"PASS":"FAIL");if(!v)process.exitCode=1}
