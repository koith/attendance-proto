import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const won = (n: number | null) => (n ?? 0).toLocaleString("ko-KR") + "원";
const fmtH = (h: number | null) => { const t = h ?? 0, H = Math.floor(t), M = Math.round((t - H) * 60); return M ? `${H}시간 ${M}분` : `${H}시간`; };
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { ym, payload } = await req.json();
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return J({ ok: false, error: "BAD_YM" }, 400);
    const url = Deno.env.get("SUPABASE_URL")!, key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supa = createClient(url, key, { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } });
    const { data: u } = await supa.auth.getUser();
    if (!u?.user) return J({ ok: false, error: "NOT_AUTHORIZED" }, 401);
    const admin = createClient(url, key);
    const { data: snap } = await admin.from("payroll_snapshot").select("employee_name,hours,wage,base_pay,juhyu_pay,adjust,gross_pay,closed_at").eq("ym", ym).order("employee_name");
    const closed = Array.isArray(snap) && snap.length > 0;
    const syncedAt = new Date().toISOString().slice(0, 16).replace("T", " ");
    const attendance = payload?.attendance ?? { header: [], rows: [] };
    const sessions = payload?.sessions ?? { header: [], rows: [] };
    let payroll, statusLabel;
    if (closed) {
      statusLabel = "마감완료";
      payroll = { header: ["직원명", "총 실근무시간", "시급", "기본급", "주휴", "조정", "확정 세전급여", "마감시각"], rows: snap!.map((s) => [s.employee_name, fmtH(s.hours), won(s.wage), won(s.base_pay), won(s.juhyu_pay), won(s.adjust), won(s.gross_pay), (s.closed_at ?? "").toString().slice(0, 16).replace("T", " ")]) };
    } else { statusLabel = "예상 · 미마감"; payroll = payload?.payroll ?? { header: [], rows: [] }; }
    const gsRes = await fetch(Deno.env.get("SHEET_WEBAPP_URL")!, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret: Deno.env.get("SHEET_SHARED_SECRET")!, ym, synced_at: syncedAt, status_label: statusLabel, attendance, sessions, payroll }) });
    const t = await gsRes.text(); let g: any = null; try { g = JSON.parse(t); } catch {}
    if (!gsRes.ok || (g && g.ok === false)) return J({ ok: false, error: "SHEET_WRITE_FAILED", detail: g?.error ?? t.slice(0, 200) }, 502);
    return J({ ok: true, ym, closed, status: statusLabel, result: g });
  } catch (e) { return J({ ok: false, error: String(e) }, 500); }
});
