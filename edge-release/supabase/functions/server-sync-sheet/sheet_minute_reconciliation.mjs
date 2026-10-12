// Display-only minute reconciliation for a Google Sheet that shows HH:MM.
// Payroll is computed in raw seconds by the canonical engine; we never change those
// seconds, the calculated amounts, or the source attendance events.
//
// Example: five complete 1:00:58 shifts total 5:04:50. Rendering each with
// Math.floor(seconds / 60) would show 5:00, while the monthly salary report
// correctly shows 5:04. Allocate the four carried minutes to the shifts with
// the largest sub-minute remainders, using stable row order for ties.
// Each row differs by less than one minute from its true duration.
export function reconcileSheetPayableMinutes(rows, metadata) {
  const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  if (!Array.isArray(rows) || !Array.isArray(metadata) || rows.length !== metadata.length)
    throw new Error("SHEET_PAYABLE_RECONCILIATION_SHAPE");
  const groups = new Map();
  for (let i = 0; i < rows.length; i++) {
    const m = metadata[i];
    // Do not adjust unfinished or unmatched shifts, including live WORKING time.
    if (!m || !Number.isSafeInteger(m.employeeId) || m.isWorking ||
        !Number.isFinite(m.seconds) || m.seconds < 0) continue;
    const group = groups.get(m.employeeId) || [];
    const seconds = Math.max(0, Math.round(m.seconds));
    group.push({index:i, seconds, minutes:Math.floor(seconds/60), fraction:seconds%60});
    groups.set(m.employeeId, group);
  }
  const result = rows.map(row => Array.isArray(row) ? [...row] : row);
  for (const group of groups.values()) {
    const totalSeconds = group.reduce((sum,x)=>sum+x.seconds,0);
    const totalMinutes = Math.floor(totalSeconds/60);
    const visibleMinutes = group.reduce((sum,x)=>sum+x.minutes,0);
    let carry = totalMinutes-visibleMinutes;
    const priority = [...group].sort((a,b)=>b.fraction-a.fraction||a.index-b.index);
    for (const x of priority) {
      if (carry>0 && x.fraction>0) {x.minutes++;carry--;}
    }
    if (carry!==0) throw new Error("SHEET_PAYABLE_RECONCILIATION_INVARIANT");
    for (const x of group) result[x.index][10] = hhmm(x.minutes);
  }
  return result;
}
