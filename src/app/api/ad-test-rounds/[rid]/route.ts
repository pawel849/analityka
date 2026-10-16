import { body, guarded, json, notFound, type Params } from "@/lib/api";
import { one } from "@/lib/db";

export const dynamic = "force-dynamic";
const STATUS = new Set(["planowana", "w toku", "werdykt", "zamknięta"]);
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const PATCH = guarded(async (req, { params }: Params<"rid">) => {
  const { rid } = await params;
  const b = await body<{ status?: string; start_date?: string; verdict_date?: string | null; page_url?: string }>(req);
  if (b.status && !STATUS.has(b.status)) return json({ error: "Nieznany status rundy" }, 400);
  if ((b.start_date && !DAY.test(b.start_date)) || (b.verdict_date && !DAY.test(b.verdict_date))) return json({ error: "Daty w formacie RRRR-MM-DD" }, 400);
  const row = await one(
    `UPDATE ad_test_rounds SET status = COALESCE($2, status), start_date = COALESCE($3::date, start_date),
       verdict_date = COALESCE($4::date, verdict_date), page_url = COALESCE($5, page_url) WHERE id = $1 RETURNING id`,
    [rid, b.status ?? null, b.start_date ?? null, b.verdict_date ?? null, b.page_url ?? null],
  );
  return row ? json({ ok: true }) : notFound();
});

export const DELETE = guarded(async (_req, { params }: Params<"rid">) => {
  const { rid } = await params;
  const row = await one("DELETE FROM ad_test_rounds WHERE id = $1 RETURNING id", [rid]);
  return row ? json({ ok: true }) : notFound();
});
