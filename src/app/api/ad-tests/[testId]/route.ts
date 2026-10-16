import { body, guarded, json, notFound, type Params } from "@/lib/api";
import { one } from "@/lib/db";
import { loadTests, projectOfTest } from "@/lib/ad-tests-data";

export const dynamic = "force-dynamic";
const STATUS = new Set(["planowany", "w toku", "zakończony"]);

export const GET = guarded(async (_req, { params }: Params<"testId">) => {
  const { testId } = await params;
  const pid = await projectOfTest(testId);
  if (!pid) return notFound();
  const r = await loadTests(pid, testId);
  return json({ settings: r.settings, test: r.tests[0] });
});

export const PATCH = guarded(async (req, { params }: Params<"testId">) => {
  const { testId } = await params;
  const b = await body<{ angle?: string; status?: string; notes?: string }>(req);
  if (b.status && !STATUS.has(b.status)) return json({ error: "Status: planowany / w toku / zakończony" }, 400);
  const row = await one(
    `UPDATE ad_tests SET angle = COALESCE($2, angle), status = COALESCE($3, status), notes = COALESCE($4, notes) WHERE id = $1 RETURNING id`,
    [testId, b.angle?.trim() || null, b.status ?? null, b.notes ?? null],
  );
  return row ? json({ ok: true }) : notFound();
});

export const DELETE = guarded(async (_req, { params }: Params<"testId">) => {
  const { testId } = await params;
  const row = await one("DELETE FROM ad_tests WHERE id = $1 RETURNING id", [testId]);
  return row ? json({ ok: true }) : notFound();
});
