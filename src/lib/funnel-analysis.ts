import { analyze, type AnalysisResult, type GraphEdge, type GraphNode, type ManualRow, type TrackedEvent } from "./analysis";
import { evaluate } from "./formula";
import { one, q } from "./db";

export interface CustomMetric {
  id: string;
  name: string;
  formula: string;
  format: string;
}

export interface FullAnalysis extends AnalysisResult {
  from: string;
  to: string;
  eventCount: number;
  truncated: boolean;
  custom: (CustomMetric & { value: number | null; error?: string })[];
}

const MAX_EVENTS = 300_000;

export function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 86400_000);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

export async function runFunnelAnalysis(funnelId: string, from: string, to: string): Promise<FullAnalysis | null> {
  const funnel = await one<{ project_id: string; graph: { nodes: GraphNode[]; edges: GraphEdge[] } }>(
    "SELECT project_id, graph FROM funnels WHERE id = $1",
    [funnelId],
  );
  if (!funnel) return null;
  const graph = typeof funnel.graph === "string" ? JSON.parse(funnel.graph) : funnel.graph;
  const nodes: GraphNode[] = (graph.nodes ?? []).map((n: GraphNode) => ({ id: n.id, data: n.data }));
  const edges: GraphEdge[] = (graph.edges ?? []).map((e: GraphEdge) => ({ id: e.id, source: e.source, target: e.target }));

  const fromTs = `${from}T00:00:00Z`;
  const toTs = `${to}T23:59:59.999Z`;
  const rawEvents = await q<{
    id: string;
    ts: Date | string;
    type: string;
    name: string;
    visitor_id: string;
    url: string;
    path: string;
    referrer: string;
    utm_source: string;
    element: string;
    value: number | null;
    scroll: number | null;
  }>(
    `SELECT id, ts, type, name, visitor_id, url, path, referrer, utm_source, element, value, scroll
     FROM events WHERE project_id = $1 AND ts >= $2 AND ts <= $3 ORDER BY ts LIMIT ${MAX_EVENTS + 1}`,
    [funnel.project_id, fromTs, toTs],
  );
  const truncated = rawEvents.length > MAX_EVENTS;
  const events: TrackedEvent[] = rawEvents.slice(0, MAX_EVENTS).map((e) => ({
    ...e,
    ts: new Date(e.ts).getTime(),
    value: e.value == null ? null : Number(e.value),
    scroll: e.scroll == null ? null : Number(e.scroll),
  }));

  const manual = (
    await q<{ node_id: string; metric: string; value: number }>(
      `SELECT node_id, metric, SUM(value) AS value FROM manual_data
       WHERE funnel_id = $1 AND day >= $2 AND day <= $3 GROUP BY node_id, metric`,
      [funnelId, from, to],
    )
  ).map((m): ManualRow => ({ ...m, value: Number(m.value) }));

  const result = analyze(nodes, edges, events, manual);

  const metrics = await q<CustomMetric>(
    "SELECT id, name, formula, format FROM custom_metrics WHERE funnel_id = $1 ORDER BY created_at",
    [funnelId],
  );
  const byLabel = (label: string) => nodes.find((n) => n.data.label.trim().toLowerCase() === label.trim().toLowerCase());
  const custom = metrics.map((m) => {
    try {
      const value = evaluate(m.formula, {
        vars: { ...result.totals },
        node: (label, field) => {
          const n = byLabel(label);
          if (!n) throw new Error(`Brak węzła „${label}”`);
          const v = (result.nodes[n.id] as unknown as Record<string, unknown>)[field];
          if (v === undefined) throw new Error(`Węzeł nie ma pola „${field}”`);
          return typeof v === "number" ? v : null;
        },
        edge: (a, b) => {
          const na = byLabel(a);
          const nb = byLabel(b);
          const e = na && nb ? edges.find((x) => x.source === na.id && x.target === nb.id) : undefined;
          if (!e) throw new Error(`Brak strzałki „${a}” → „${b}”`);
          return result.edges[e.id]?.people ?? null;
        },
      });
      return { ...m, value };
    } catch (err) {
      return { ...m, value: null, error: err instanceof Error ? err.message : String(err) };
    }
  });

  return { ...result, from, to, eventCount: events.length, truncated, custom };
}
