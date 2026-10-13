import { body, guarded, json, notFound, type Params } from "@/lib/api";
import { newId, one, q } from "@/lib/db";
import { evaluate } from "@/lib/formula";
import { TOTAL_LABELS } from "@/lib/analysis";

const FORMATS = new Set(["number", "percent", "money", "ratio"]);

export const GET = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  return json(await q("SELECT * FROM custom_metrics WHERE funnel_id = $1 ORDER BY created_at", [id]));
});

export const POST = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const { name, formula, format } = await body<{ name?: string; formula?: string; format?: string }>(req);
  if (!name?.trim() || !formula?.trim()) return json({ error: "Podaj nazwę i wzór" }, 400);
  // Walidacja składni na danych próbnych
  try {
    const vars = Object.fromEntries(Object.keys(TOTAL_LABELS).map((k) => [k, 1]));
    evaluate(formula, { vars, node: () => 1, edge: () => 1 });
  } catch (e) {
    return json({ error: `Błąd we wzorze: ${e instanceof Error ? e.message : e}` }, 400);
  }
  const row = await one(
    "INSERT INTO custom_metrics (id, funnel_id, name, formula, format) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [newId(), id, name.trim(), formula.trim(), FORMATS.has(format ?? "") ? format : "number"],
  );
  return json(row, 201);
});

export const DELETE = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const mid = new URL(req.url).searchParams.get("metric");
  const row = await one("DELETE FROM custom_metrics WHERE funnel_id = $1 AND id = $2 RETURNING id", [id, mid]);
  return row ? json({ ok: true }) : notFound();
});
