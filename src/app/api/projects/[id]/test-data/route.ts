import { body, guarded, json, notFound, type Params } from "@/lib/api";
import { one } from "@/lib/db";
import { insertEvents } from "@/lib/collect";
import { generateTestEvents } from "@/lib/testdata";
import type { NodeData } from "@/lib/catalog";

/** Generuje dane testowe na podstawie mapy wskazanego lejka. */
export const POST = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const { funnel_id } = await body<{ funnel_id?: string }>(req);
  const project = await one<{ domain: string }>("SELECT domain FROM projects WHERE id = $1", [id]);
  const funnel = await one<{ graph: { nodes: { id: string; data: NodeData }[]; edges: { source: string; target: string }[] } }>(
    "SELECT graph FROM funnels WHERE id = $1 AND project_id = $2",
    [funnel_id, id],
  );
  if (!project || !funnel) return notFound();
  const graph = typeof funnel.graph === "string" ? JSON.parse(funnel.graph) : funnel.graph;
  const host = (project.domain || "przyklad.pl").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const events = generateTestEvents(graph.nodes ?? [], graph.edges ?? [], host);
  await insertEvents(id, events, true);
  return json({ inserted: events.length });
});

export const DELETE = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const row = await one<{ n: string }>(
    "WITH d AS (DELETE FROM events WHERE project_id = $1 AND is_test RETURNING 1) SELECT count(*) AS n FROM d",
    [id],
  );
  return json({ deleted: Number(row?.n ?? 0) });
});
