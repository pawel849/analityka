import { body, guarded, json, notFound, type Params } from "@/lib/api";
import { one } from "@/lib/db";

export const GET = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const row = await one("SELECT * FROM funnels WHERE id = $1", [id]);
  return row ? json(row) : notFound();
});

export const PATCH = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const { name, graph } = await body<{ name?: string; graph?: { nodes: unknown[]; edges: unknown[]; meta?: unknown } }>(req);
  if (graph && (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges))) {
    return json({ error: "Niepoprawny format mapy" }, 400);
  }
  const row = await one(
    `UPDATE funnels SET name = COALESCE($2, name), graph = COALESCE($3::jsonb, graph), updated_at = now()
     WHERE id = $1 RETURNING id, name, updated_at`,
    [id, name?.trim() || null, graph ? JSON.stringify({ nodes: graph.nodes, edges: graph.edges, meta: graph.meta && typeof graph.meta === "object" ? graph.meta : {} }) : null],
  );
  return row ? json(row) : notFound();
});

export const DELETE = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const row = await one("DELETE FROM funnels WHERE id = $1 RETURNING id", [id]);
  return row ? json({ ok: true }) : notFound();
});
