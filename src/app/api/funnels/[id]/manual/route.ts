import { body, guarded, json, notFound, type Params } from "@/lib/api";
import { newId, one, q } from "@/lib/db";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const GET = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const node = new URL(req.url).searchParams.get("node_id");
  const rows = await q(
    `SELECT id, node_id, to_char(day, 'YYYY-MM-DD') AS day, metric, value FROM manual_data
     WHERE funnel_id = $1 AND ($2::text IS NULL OR node_id = $2) ORDER BY day DESC, created_at DESC LIMIT 500`,
    [id, node],
  );
  return json(rows);
});

export const POST = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const { node_id, day, metric, value } = await body<{ node_id?: string; day?: string; metric?: string; value?: number }>(req);
  const v = Number(value);
  if (!node_id || !metric || !day || !DAY.test(day) || !Number.isFinite(v)) {
    return json({ error: "Uzupełnij datę, metrykę i wartość" }, 400);
  }
  const row = await one(
    `INSERT INTO manual_data (id, funnel_id, node_id, day, metric, value) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, node_id, to_char(day, 'YYYY-MM-DD') AS day, metric, value`,
    [newId(), id, node_id, day, metric, v],
  );
  return json(row, 201);
});

export const DELETE = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const rowId = new URL(req.url).searchParams.get("row");
  const row = await one("DELETE FROM manual_data WHERE funnel_id = $1 AND id = $2 RETURNING id", [id, rowId]);
  return row ? json({ ok: true }) : notFound();
});
