import fs from "node:fs";
const index=fs.readFileSync("index.html","utf8"),js=fs.readFileSync("actual_attendance.js","utf8"),css=fs.readFileSync("actual_attendance.css","utf8"),sql=fs.readFileSync("supabase/migrations/20260930103500_employee_today_work_summary_v089.sql","utf8");
const checks={
 version:(()=>{const m=index.match(/APP_VERSION="v0\.(\d+)"/);return !!m&&Number(m[1])>=89})(),
 completedCard:index.includes('today_work_seconds')&&index.includes('근무 완료')&&index.includes('오늘 ${fmtDur(Number(e.today_work_seconds))} 근무'),
 sixPeople:js.includes('people.slice(0,6)'),
 dayNav:js.includes('id="prevDay"')&&js.includes('id="nextDay"')&&js.includes('navigateDay(day,-1)')&&js.includes('navigateDay(day,1)'),
 crossMonth:js.includes('if(ym!==S.ym){S.ym=ym;await loadMonth()}renderDay(target)'),
 calendarHeight:css.includes('min-height:122px')&&css.includes('grid-auto-rows:minmax(122px'),
 canonicalSql:sql.includes("event_corrections")&&sql.includes("action='VOID'")&&sql.includes("today_work_seconds"),
 preopen:sql.includes('open_minute')&&sql.includes('-60')
};for(const [k,v] of Object.entries(checks)){console.log(k,v?"PASS":"FAIL");if(!v)process.exitCode=1}
