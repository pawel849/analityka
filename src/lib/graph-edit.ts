// Edycja mapy lejka operacjami (dla asystenta AI): dodaj/zmień/usuń węzły i strzałki.
import { CATALOG_BY_KIND, type NodeData, type NodeFilter } from "./catalog.ts";

export interface NodeFields {
  label?: string;
  url?: string;
  urls?: string[];
  source_match?: string;
  ads_match?: string;
  event_type?: string;
  event_name?: string;
  page_url?: string;
  filters?: NodeFilter[];
  goal?: boolean;
  goal_name?: string;
  goal_value?: number;
  notes?: string;
  checklist?: string[];
}

export interface GraphEdits {
  add_nodes?: (NodeFields & { ref?: string; kind: string; x?: number; y?: number })[];
  update_nodes?: (NodeFields & { id: string; x?: number; y?: number })[];
  remove_nodes?: string[];
  add_edges?: { source: string; target: string; connection?: "direct" | "indirect" | "none" }[];
  remove_edges?: string[];
}

interface GNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data: NodeData & Record<string, unknown>;
  [k: string]: unknown;
}
interface GEdge {
  id: string;
  source: string;
  target: string;
  [k: string]: unknown;
}
export interface Graph {
  nodes: GNode[];
  edges: GEdge[];
  meta?: Record<string, unknown>;
}

const rid = () => Math.random().toString(36).slice(2, 9);

function patchFrom(f: NodeFields): Partial<NodeData> {
  const p: Partial<NodeData> = {};
  if (f.label !== undefined) p.label = f.label;
  if (f.url !== undefined) p.url = f.url;
  if (f.urls !== undefined) p.urls = f.urls;
  if (f.source_match !== undefined) p.sourceMatch = f.source_match;
  if (f.ads_match !== undefined) p.adsMatch = f.ads_match;
  if (f.event_type !== undefined) p.eventType = f.event_type;
  if (f.event_name !== undefined) p.eventName = f.event_name;
  if (f.page_url !== undefined) p.pageUrl = f.page_url;
  if (f.filters !== undefined) p.filters = f.filters;
  if (f.goal !== undefined) p.goal = f.goal;
  if (f.goal_name !== undefined) p.goalName = f.goal_name;
  if (f.goal_value !== undefined) p.goalValue = f.goal_value;
  if (f.notes !== undefined) p.notes = f.notes;
  if (f.checklist !== undefined) p.checklist = f.checklist.map((text) => ({ id: rid(), text, done: false }));
  return p;
}

/** Zwraca nową mapę; `ids` = identyfikatory nadane nowym węzłom (po polu ref lub kolejności). Błędy przerywają całość. */
export function applyGraphEdits(input: Graph, e: GraphEdits): { graph: Graph; ids: Record<string, string>; summary: string[] } {
  const g: Graph = { nodes: input.nodes.map((n) => ({ ...n, data: { ...n.data } })), edges: input.edges.map((x) => ({ ...x })), meta: input.meta };
  const summary: string[] = [];
  const ids: Record<string, string> = {};

  const removeN = new Set(e.remove_nodes ?? []);
  for (const id of removeN) if (!g.nodes.some((n) => n.id === id)) throw new Error(`Nie ma węzła ${id}`);
  if (removeN.size) {
    g.nodes = g.nodes.filter((n) => !removeN.has(n.id));
    const before = g.edges.length;
    g.edges = g.edges.filter((x) => !removeN.has(x.source) && !removeN.has(x.target));
    summary.push(`Usunięto węzłów: ${removeN.size} (i strzałek z nimi połączonych: ${before - g.edges.length})`);
  }
  const removeE = new Set(e.remove_edges ?? []);
  if (removeE.size) {
    g.edges = g.edges.filter((x) => !removeE.has(x.id));
    summary.push(`Usunięto strzałek: ${removeE.size}`);
  }

  for (const u of e.update_nodes ?? []) {
    const n = g.nodes.find((x) => x.id === u.id);
    if (!n) throw new Error(`Nie ma węzła ${u.id}`);
    n.data = { ...n.data, ...patchFrom(u) };
    if (u.x !== undefined || u.y !== undefined) n.position = { x: u.x ?? n.position.x, y: u.y ?? n.position.y };
  }
  if (e.update_nodes?.length) summary.push(`Zmieniono węzłów: ${e.update_nodes.length}`);

  // Nowe węzły bez pozycji: kolumna na prawo od mapy.
  const funnelNodes = g.nodes.filter((n) => (n.type ?? "funnel") === "funnel");
  let nextX = funnelNodes.length ? Math.max(...funnelNodes.map((n) => n.position.x)) + 260 : 0;
  let row = 0;
  (e.add_nodes ?? []).forEach((a, i) => {
    const item = CATALOG_BY_KIND[a.kind];
    if (!item) throw new Error(`Nieznany rodzaj elementu „${a.kind}” – sprawdź get_catalog`);
    const id = `n_${rid()}`;
    const pos = a.x !== undefined && a.y !== undefined ? { x: a.x, y: a.y } : { x: nextX, y: row++ * 170 };
    if (a.x === undefined && row > 3) {
      nextX += 260;
      row = 0;
    }
    g.nodes.push({ id, type: "funnel", position: pos, data: { kind: a.kind, category: item.category, label: item.label, ...item.defaults, ...patchFrom(a) } as GNode["data"] });
    ids[a.ref ?? String(i)] = id;
  });
  if (e.add_nodes?.length) summary.push(`Dodano węzłów: ${e.add_nodes.length}`);

  const resolve = (k: string) => ids[k] ?? k;
  for (const a of e.add_edges ?? []) {
    const source = resolve(a.source);
    const target = resolve(a.target);
    for (const end of [source, target]) if (!g.nodes.some((n) => n.id === end)) throw new Error(`Strzałka: nie ma węzła ${end}`);
    if (g.edges.some((x) => x.source === source && x.target === target)) continue;
    g.edges.push({
      id: `e_${rid()}`,
      source,
      target,
      type: "flow",
      markerEnd: { type: "arrowclosed" },
      ...(a.connection ? { data: { connection: a.connection } } : {}),
    });
  }
  if (e.add_edges?.length) summary.push(`Dodano strzałek: ${e.add_edges.length}`);
  return { graph: g, ids, summary };
}

/** Zwięzły opis mapy dla asystenta. */
export function describeGraph(g: Graph) {
  return {
    nodes: g.nodes
      .filter((n) => (n.type ?? "funnel") === "funnel")
      .map((n) => {
        const d = n.data;
        const out: Record<string, unknown> = { id: n.id, kind: d.kind, category: d.category, label: d.label, x: n.position.x, y: n.position.y };
        for (const [k, v] of Object.entries({
          url: d.url, urls: d.urls, source_match: d.sourceMatch, ads_match: d.adsMatch, event_type: d.eventType, event_name: d.eventName,
          page_url: d.pageUrl, filters: d.filters, goal: d.goal, goal_name: d.goalName, goal_value: d.goalValue, notes: d.notes,
        })) {
          if (v !== undefined && v !== "" && !(Array.isArray(v) && !v.length)) out[k] = v;
        }
        return out;
      }),
    annotations: g.nodes.filter((n) => (n.type ?? "funnel") !== "funnel").length,
    edges: g.edges.map((x) => ({ id: x.id, source: x.source, target: x.target, connection: (x.data as { connection?: string } | undefined)?.connection ?? "direct" })),
  };
}
