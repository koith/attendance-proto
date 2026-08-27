// M8.7 Edge Function: sync-sheet
// 배포: supabase functions deploy sync-sheet
// Secrets 필요:
//   supabase secrets set SHEET_WEBAPP_URL="https://script.google.com/.../exec"
//   supabase secrets set SHEET_SHARED_SECRET="<Apps Script와 동일한 긴 랜덤>"
//   (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 기본 제공)
//
// 원칙:
//  - 마감된 월(payroll_snapshot 존재)은 클라이언트 payload를 신뢰하지 않고
//    snapshot을 직접 읽어 급여 시트를 만든다. (조건 3)
//  - 마감 전 월은 앱이 buildSheetSyncPayload(ym)로 만든 payload(기존 계산함수 재사용)를 그대로 포맷.
//  - 근태/세션은 항상 앱이 보낸 effective projection 사용. (조건 1,4)
//  - Google 호출 실패는 여기서 에러 반환만. DB는 절대 안 건드림(읽기 전용). (punch 분리)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { ym, payload } = await req.json(); // payload = 앱이 만든 마감전 projection
    if (!ym || !/^\d{4}-\d{2}$/.test(ym)) {
      return json({ ok: false, error: "BAD_YM" }, 400);
    }

    // 관리자 인증: 호출자의 JWT가 authenticated 여야 함
    const authHeader = req.headers.get("Authorization") || "";
    const supa = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supa.auth.getUser();
    if (!userData?.user) return json({ ok: false, error: "NOT_AUTHORIZED" }, 401);

    // 마감 여부 + snapshot 조회 (service role로 직접 읽기)
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: snap } = await admin
      .from("payroll_snapshot")
      .select("employee_name,hours,wage,weeks,base_pay,juhyu_pay,adjust,gross_pay,net_pay,closed_at")
      .eq("ym", ym)
      .order("employee_name");

    const isClosed = Array.isArray(snap) && snap.length > 0;
    const now = new Date();
    const syncedAt = now.toISOString().slice(0, 16).replace("T", " ");

    // ---- 근태/세션: 항상 앱 projection (effective) ----
    const attendance = payload?.attendance ?? { header: [], rows: [] };
    const sessions = payload?.sessions ?? { header: [], rows: [] };

    // ---- 급여: 마감이면 snapshot, 아니면 앱 payload ----
    let payroll, statusLabel;
    if (isClosed) {
      statusLabel = "마감완료";
      payroll = {
        header: ["직원명", "총 실근무시간", "시급", "기본급", "주휴", "조정", "확정 세전급여", "마감시각"],
        rows: snap!.map((s) => [
          s.employee_name,
          fmtHours(s.hours),
          won(s.wage),
          won(s.base_pay),
          won(s.juhyu_pay),
          won(s.adjust),
          won(s.gross_pay),
          (s.closed_at ?? "").toString().slice(0, 16).replace("T", " "),
        ]),
      };
    } else {
      statusLabel = "예상 · 미마감";
      payroll = payload?.payroll ?? { header: [], rows: [] };
    }

    // ---- Apps Script 호출 (실패해도 DB 무관) ----
    const webappUrl = Deno.env.get("SHEET_WEBAPP_URL")!;
    const secret = Deno.env.get("SHEET_SHARED_SECRET")!;
    const gsBody = {
      secret, ym, synced_at: syncedAt, status_label: statusLabel,
      attendance, sessions, payroll,
    };
    const gsRes = await fetch(webappUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gsBody),
    });
    const gsText = await gsRes.text();
    let gsJson: any = null;
    try { gsJson = JSON.parse(gsText); } catch { /* keep text */ }

    if (!gsRes.ok || (gsJson && gsJson.ok === false)) {
      return json({ ok: false, error: "SHEET_WRITE_FAILED", detail: gsJson?.error ?? gsText.slice(0, 200) }, 502);
    }

    return json({ ok: true, ym, closed: isClosed, status: statusLabel, result: gsJson });
  } catch (err) {
    return json({ ok: false, error: String(err) }, 500);
  }
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...cors, "Content-Type": "application/json" },
  });
}
function won(n: number | null) { return (n ?? 0).toLocaleString("ko-KR") + "원"; }
function fmtHours(h: number | null) {
  const t = h ?? 0; const H = Math.floor(t); const M = Math.round((t - H) * 60);
  return M ? `${H}시간 ${M}분` : `${H}시간`;
}
