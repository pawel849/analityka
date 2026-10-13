// Silnik analizy lejka: liczy przepływy na węzłach i strzałkach ze zdarzeń trackingu
// oraz danych ręcznych. Czysty moduł (bez I/O), testowany w tests/analysis.test.ts.
import type { Category, NodeData, NodeFilter } from "./catalog";

export interface GraphNode {
  id: string;
  data: NodeData;
}
export type ConnectionType = "direct" | "indirect" | "none";

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  data?: { connection?: ConnectionType; line?: "curved" | "straight" };
}
export interface TrackedEvent {
  id: number | string;
  ts: number; // ms
  type: string;
  name: string;
  visitor_id: string;
  url: string;
  path: string;
  referrer: string;
  utm_source: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  country?: string;
  element: string;
  value: number | null;
  scroll: number | null;
}
export interface ManualRow {
  node_id: string;
  metric: string;
  value: number;
}

export interface NodeStats {
  category: Category;
  /** Liczba unikalnych osób na węźle (po uwzględnieniu danych ręcznych). */
  people: number;
  tracked: boolean;
  pageviews?: number;
  ctaClicks?: number;
  ctrPage?: number | null;
  scroll?: { p25: number; p50: number; p75: number; p100: number } | null;
  conversions?: number;
  revenue?: number;
  spend?: number;
  impressions?: number;
  adClicks?: number;
  video3s?: number;
  ctrAds?: number | null;
  hookRate?: number | null;
  cpc?: number | null;
  /** Cel: liczba konwersji i ich łączna wartość (wartość celu × konwersje). */
  goalCount?: number;
  goalValue?: number;
}

export interface EdgeStats {
  connection: ConnectionType;
  people: number;
  rate: number | null;
  estimated: boolean;
}

/** Ruch: każdy krok liczy wszystkich. Lejek: krok liczy tylko osoby, które doszły do niego strzałkami. */
export type DataMode = "traffic" | "funnel";

export interface Totals {
  spend: number;
  revenue: number;
  sales: number;
  leads: number;
  visitors: number;
  pageviews: number;
  page_clicks: number;
  impressions: number;
  clicks: number;
  video_3s: number;
  goals: number;
  goal_value: number;
  roas: number | null;
  cpl: number | null;
  cpa: number | null;
  aov: number | null;
  hook_rate: number | null;
  ctr_ads: number | null;
  ctr_page: number | null;
  conv_rate: number | null;
}

export interface AnalysisResult {
  nodes: Record<string, NodeStats>;
  edges: Record<string, EdgeStats>;
  totals: Totals;
}

const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

function normPath(p: string): string {
  let s = (p || "/").toLowerCase().split("?")[0].split("#")[0];
  if (s.length > 1 && s.endsWith("/")) s = s.slice(0, -1);
  return s || "/";
}

/**
 * Dopasowanie adresu strony:
 *  - "/oferta"   → dokładnie ścieżka /oferta (z ukośnikiem na końcu lub bez)
 *  - "/kurs/*"   → każda ścieżka zaczynająca się od /kurs/
 *  - inne        → pełny adres URL zawiera podany fragment
 */
export function matchesPage(pattern: string | undefined, ev: { url: string; path: string }): boolean {
  const p = (pattern ?? "").trim().toLowerCase();
  if (!p) return false;
  if (p.startsWith("/")) {
    const path = normPath(ev.path);
    if (p.endsWith("*")) {
      const prefix = p.slice(0, -1);
      return path.startsWith(prefix) || path === normPath(prefix);
    }
    return path === normPath(p);
  }
  return ev.url.toLowerCase().includes(p);
}

export function eventSource(ev: { utm_source: string; referrer: string }): string {
  if (ev.utm_source) return ev.utm_source.toLowerCase();
  if (ev.referrer) {
    try {
      return new URL(ev.referrer).hostname.toLowerCase().replace(/^www\./, "");
    } catch {
      return ev.referrer.toLowerCase();
    }
  }
  return "(direct)";
}

function urlParam(url: string, key: string): string {
  try {
    return new URL(url).searchParams.get(key) ?? "";
  } catch {
    return "";
  }
}

/** Wartość atrybutu zdarzenia do warunków „klucz / wartość”. Klucz „param:xyz” czyta parametr z adresu. */
export function attrValue(ev: TrackedEvent, key: string): string {
  if (key.startsWith("param:")) return urlParam(ev.url, key.slice(6));
  switch (key) {
    case "utm_source":
      return ev.utm_source ?? "";
    case "utm_medium":
      return ev.utm_medium ?? "";
    case "utm_campaign":
      return ev.utm_campaign ?? "";
    case "utm_content":
      return ev.utm_content ?? "";
    case "utm_term":
      return ev.utm_term ?? "";
    case "source":
      return eventSource(ev);
    case "path":
      return ev.path;
    case "element":
      return ev.element;
    case "name":
      return ev.name;
    default:
      return urlParam(ev.url, key);
  }
}

export function matchesFilters(filters: NodeFilter[] | undefined, ev: TrackedEvent): boolean {
  if (!filters?.length) return true;
  return filters.every((f) => {
    if (!f.key) return true;
    const v = attrValue(ev, f.key).toLowerCase();
    const want = (f.value ?? "").toLowerCase();
    switch (f.op) {
      case "neq":
        return v !== want;
      case "contains":
        return v.includes(want);
      case "not_contains":
        return !v.includes(want);
      case "empty":
        return v === "";
      case "not_empty":
        return v !== "";
      default:
        return v === want;
    }
  });
}

export function pageUrls(d: NodeData): string[] {
  return [d.url, ...(d.urls ?? [])].map((u) => (u ?? "").trim()).filter(Boolean);
}

function matchesAnyPage(urls: string[], ev: TrackedEvent): boolean {
  return urls.some((u) => matchesPage(u, ev));
}

/** Zdarzenia oznaczające „obecność” osoby na węźle (do list osób i przepływów). */
export function presenceMatcher(d: NodeData): ((ev: TrackedEvent) => boolean) | null {
  if (d.category === "source") {
    const tokens = sourceTokens(d);
    // Źródło bez dopasowania, ale z warunkami (np. konkretna kampania) – dowolna odsłona spełniająca warunki.
    if (!tokens.length && d.filters?.some((f) => f.key)) return (ev) => ev.type === "pageview" && matchesFilters(d.filters, ev);
    return tokens.length ? (ev) => matchesSource(tokens, ev) && matchesFilters(d.filters, ev) : null;
  }
  if (d.category === "page") {
    const urls = pageUrls(d);
    return urls.length ? (ev) => ev.type === "pageview" && matchesAnyPage(urls, ev) && matchesFilters(d.filters, ev) : null;
  }
  if (d.category === "action") {
    return d.eventType ? (ev) => matchesAction(d, ev) && matchesFilters(d.filters, ev) : null;
  }
  return null;
}

function sourceTokens(d: NodeData): string[] {
  return (d.sourceMatch ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
}

function matchesSource(tokens: string[], ev: TrackedEvent): boolean {
  if (ev.type !== "pageview") return false;
  const src = eventSource(ev);
  return tokens.some((t) => (t === "*" ? true : t === "(direct)" ? src === "(direct)" : src === t || src.includes(t)));
}

function matchesAction(d: NodeData, ev: TrackedEvent): boolean {
  if (!d.eventType || ev.type !== d.eventType) return false;
  const name = (d.eventName ?? "").trim().toLowerCase();
  if (name) {
    if (d.eventType === "scroll") {
      if ((ev.scroll ?? 0) < Number(name)) return false;
    } else if (d.eventType === "custom") {
      if (ev.name.toLowerCase() !== name) return false;
    } else if (!ev.name.toLowerCase().includes(name) && !ev.element.toLowerCase().includes(name)) {
      return false;
    }
  }
  if (d.pageUrl && !matchesPage(d.pageUrl, ev)) return false;
  return true;
}

/**
 * Przejście bezpośrednie A → B: po którymś trafieniu w A najbliższym kolejnym krokiem z mapy
 * (pomijając źródła ruchu) jest B. Trafienia z tego samego zdarzenia co A, ale z innego węzła, też się liczą
 * (np. źródło i strona docelowa to ta sama odsłona).
 */
function directStep(hits: { ts: number; idx: number; node: string; source: boolean }[], from: string, to: string): boolean {
  if (!hits.length) return false;
  if (!(hits as unknown as { sorted?: boolean }).sorted) {
    hits.sort((x, y) => x.ts - y.ts || x.idx - y.idx || Number(y.source) - Number(x.source));
    (hits as unknown as { sorted?: boolean }).sorted = true;
  }
  for (let i = 0; i < hits.length; i++) {
    if (hits[i].node !== from) continue;
    for (let j = i + 1; j < hits.length; j++) {
      const h = hits[j];
      if (h.node === from || h.source) continue;
      if (h.node === to) return true;
      break;
    }
  }
  return false;
}

interface Span {
  first: number;
  last: number;
}

export function analyze(
  nodes: GraphNode[],
  edges: GraphEdge[],
  events: TrackedEvent[],
  manual: ManualRow[],
  opts: { mode?: DataMode } = {},
): AnalysisResult {
  const manualBy = new Map<string, Map<string, number>>();
  for (const m of manual) {
    const mm = manualBy.get(m.node_id) ?? new Map<string, number>();
    mm.set(m.metric, (mm.get(m.metric) ?? 0) + Number(m.value));
    manualBy.set(m.node_id, mm);
  }
  const man = (id: string, key: string) => manualBy.get(id)?.get(key);

  const spans = new Map<string, Map<string, Span>>();
  const nodeStats: Record<string, NodeStats> = {};
  const purchaseIds = new Set<string>();
  let trackedRevenue = 0;
  const leadVisitors = new Set<string>();
  const pageVisitors = new Set<string>();
  let manualLeads = 0;
  let manualRevenue = 0;
  let manualSales = 0;

  const totals = { spend: 0, pageviews: 0, page_clicks: 0, impressions: 0, clicks: 0, video_3s: 0 };
  const goals = { count: 0, value: 0 };
  // Oś czasu trafień w węzły dla każdej osoby (do przejść bezpośrednich).
  const evIndex = new Map<TrackedEvent, number>(events.map((e, i) => [e, i]));
  const timeline = new Map<string, { ts: number; idx: number; node: string; source: boolean }[]>();

  for (const n of nodes) {
    const d = n.data;
    const visitors = new Map<string, Span>();
    const touch = (ev: TrackedEvent) => {
      const v = ev.visitor_id;
      const ts = ev.ts;
      const hits = timeline.get(v) ?? [];
      hits.push({ ts, idx: evIndex.get(ev) ?? 0, node: n.id, source: d.category === "source" });
      timeline.set(v, hits);
      const s = visitors.get(v);
      if (!s) visitors.set(v, { first: ts, last: ts });
      else {
        if (ts < s.first) s.first = ts;
        if (ts > s.last) s.last = ts;
      }
    };
    const st: NodeStats = { category: d.category, people: 0, tracked: false };

    if (d.category === "source") {
      const match = presenceMatcher(d);
      if (match) {
        st.tracked = true;
        for (const ev of events) if (match(ev)) touch(ev);
      }
      st.spend = man(n.id, "spend") ?? 0;
      st.impressions = man(n.id, "impressions") ?? 0;
      st.adClicks = man(n.id, "clicks") ?? 0;
      st.video3s = man(n.id, "video_3s") ?? 0;
      st.ctrAds = div(st.adClicks, st.impressions);
      st.hookRate = div(st.video3s, st.impressions);
      st.cpc = div(st.spend, st.adClicks);
      totals.spend += st.spend;
      totals.impressions += st.impressions;
      totals.clicks += st.adClicks;
      totals.video_3s += st.video3s;
    } else if (d.category === "page") {
      const urls = pageUrls(d);
      if (urls.length) {
        st.tracked = true;
        let pv = 0;
        let clicks = 0;
        const scrollMax = new Map<string, number>();
        for (const ev of events) {
          if (!matchesAnyPage(urls, ev) || !matchesFilters(d.filters, ev)) continue;
          if (ev.type === "pageview") {
            pv++;
            touch(ev);
          } else if (ev.type === "click") clicks++;
          else if (ev.type === "scroll" && ev.scroll != null) {
            scrollMax.set(ev.visitor_id, Math.max(scrollMax.get(ev.visitor_id) ?? 0, ev.scroll));
          }
        }
        st.pageviews = pv;
        st.ctaClicks = clicks;
        const base = visitors.size;
        if (base > 0) {
          const reach = (t: number) => [...visitors.keys()].filter((v) => (scrollMax.get(v) ?? 0) >= t).length / base;
          st.scroll = { p25: reach(25), p50: reach(50), p75: reach(75), p100: reach(100) };
        } else st.scroll = null;
      }
      const mpv = man(n.id, "pageviews");
      const mcl = man(n.id, "cta_clicks");
      if (mpv !== undefined) st.pageviews = mpv;
      if (mcl !== undefined) st.ctaClicks = mcl;
      st.ctrPage = div(st.ctaClicks ?? 0, st.pageviews ?? 0);
      totals.pageviews += st.pageviews ?? 0;
      totals.page_clicks += st.ctaClicks ?? 0;
    } else if (d.category === "action") {
      if (d.eventType) {
        st.tracked = true;
        let rev = 0;
        let count = 0;
        for (const ev of events) {
          if (!matchesAction(d, ev) || !matchesFilters(d.filters, ev)) continue;
          touch(ev);
          count++;
          if (d.eventType === "purchase") {
            rev += ev.value ?? 0;
            const key = String(ev.id);
            if (!purchaseIds.has(key)) {
              purchaseIds.add(key);
              trackedRevenue += ev.value ?? 0;
            }
          }
        }
        st.conversions = d.eventType === "purchase" ? count : visitors.size;
        st.revenue = rev;
      }
      const mc = man(n.id, "conversions");
      const mr = man(n.id, "revenue");
      if (mc !== undefined) st.conversions = mc;
      if (mr !== undefined) {
        st.revenue = (st.revenue ?? 0) + mr;
        manualRevenue += mr;
      }
      if (d.eventType === "lead" || d.eventType === "form_submit") {
        if (mc !== undefined) manualLeads += mc;
        else for (const v of visitors.keys()) leadVisitors.add(v);
      }
      if (d.eventType === "purchase" && mc !== undefined) manualSales += mc;
    } else {
      // offline – wyłącznie dane ręczne
      st.conversions = man(n.id, "conversions") ?? 0;
      st.revenue = man(n.id, "revenue") ?? 0;
      st.spend = man(n.id, "spend") ?? 0;
      totals.spend += st.spend;
      manualRevenue += st.revenue;
    }

    if (d.category === "page") for (const v of visitors.keys()) pageVisitors.add(v);
    spans.set(n.id, visitors);
    const override = man(n.id, "visitors") ?? (d.category === "action" || d.category === "offline" ? man(n.id, "conversions") : undefined);
    st.people = override !== undefined ? override : visitors.size;
    if (override !== undefined) st.tracked = false;
    if (d.goal) {
      st.goalCount = d.category === "action" && d.eventType === "purchase" ? (st.conversions ?? 0) : st.people;
      st.goalValue = st.goalCount * (Number(d.goalValue) || 0);
      goals.count += st.goalCount;
      goals.value += st.goalValue;
    }
    nodeStats[n.id] = st;
  }

  const flowVisitors = (e: GraphEdge): Set<string> => {
    const out = new Set<string>();
    const a = spans.get(e.source);
    const b = spans.get(e.target);
    if (!a || !b) return out;
    const conn = e.data?.connection ?? "direct";
    if (conn === "none") return out;
    for (const [v, sa] of a) {
      const sb = b.get(v);
      if (!sb || sb.last < sa.first) continue;
      if (conn === "indirect" || directStep(timeline.get(v) ?? [], e.source, e.target)) out.add(v);
    }
    return out;
  };

  if (opts.mode === "funnel") {
    // Kolejność topologiczna; w cyklach węzły przetwarzane w kolejności z mapy.
    const incoming = new Map<string, GraphEdge[]>();
    for (const e of edges) incoming.set(e.target, [...(incoming.get(e.target) ?? []), e]);
    const done = new Set<string>();
    const order: string[] = [];
    let progress = true;
    while (order.length < nodes.length && progress) {
      progress = false;
      for (const n of nodes) {
        if (done.has(n.id)) continue;
        const inc = (incoming.get(n.id) ?? []).filter((e) => nodeStats[e.source]);
        if (inc.every((e) => done.has(e.source))) {
          done.add(n.id);
          order.push(n.id);
          progress = true;
        }
      }
    }
    for (const n of nodes) if (!done.has(n.id)) order.push(n.id);
    for (const id of order) {
      const st = nodeStats[id];
      const inc = (incoming.get(id) ?? []).filter((e) => nodeStats[e.source]?.tracked && (e.data?.connection ?? "direct") !== "none");
      if (!st?.tracked || !inc.length) continue;
      const allowed = new Set<string>();
      for (const e of inc) for (const v of flowVisitors(e)) allowed.add(v);
      const span = spans.get(id)!;
      for (const v of [...span.keys()]) if (!allowed.has(v)) span.delete(v);
      st.people = span.size;
    }
  }

  const edgeStats: Record<string, EdgeStats> = {};
  for (const e of edges) {
    const s = nodeStats[e.source];
    const t = nodeStats[e.target];
    if (!s || !t) continue;
    const connection: ConnectionType = e.data?.connection ?? "direct";
    let people: number;
    let estimated = false;
    if (connection === "none") {
      edgeStats[e.id] = { connection, people: 0, rate: null, estimated: false };
      continue;
    }
    if (s.tracked && t.tracked) {
      people = flowVisitors(e).size;
    } else {
      people = Math.min(t.people, s.people || t.people);
      estimated = true;
    }
    edgeStats[e.id] = { connection, people, rate: div(people, s.people), estimated };
  }

  // Sprzedaż: zdarzenia purchase, a jeśli w lejku nie ma węzła zakupu – wszystkie zakupy z projektu.
  const hasPurchaseNode = nodes.some((n) => n.data.eventType === "purchase");
  let sales = purchaseIds.size + manualSales;
  let revenue = trackedRevenue + manualRevenue;
  if (!hasPurchaseNode) {
    const all = events.filter((e) => e.type === "purchase");
    sales = all.length;
    revenue = all.reduce((acc, e) => acc + (e.value ?? 0), 0) + manualRevenue;
  }
  const leads = leadVisitors.size + manualLeads;
  const visitors = pageVisitors.size;

  return {
    nodes: nodeStats,
    edges: edgeStats,
    totals: {
      ...totals,
      revenue,
      sales,
      leads,
      visitors,
      goals: goals.count,
      goal_value: goals.value,
      roas: div(revenue, totals.spend),
      cpl: div(totals.spend, leads),
      cpa: div(totals.spend, sales),
      aov: div(revenue, sales),
      hook_rate: div(totals.video_3s, totals.impressions),
      ctr_ads: div(totals.clicks, totals.impressions),
      ctr_page: div(totals.page_clicks, totals.pageviews),
      conv_rate: div(sales, visitors),
    },
  };
}

export const TOTAL_LABELS: Record<keyof Totals, { label: string; format: "money" | "number" | "percent" | "ratio" }> = {
  spend: { label: "Wydatki", format: "money" },
  revenue: { label: "Przychód", format: "money" },
  sales: { label: "Sprzedaże", format: "number" },
  leads: { label: "Leady", format: "number" },
  visitors: { label: "Odwiedzający", format: "number" },
  pageviews: { label: "Odsłony", format: "number" },
  page_clicks: { label: "Kliknięcia CTA", format: "number" },
  impressions: { label: "Wyświetlenia reklam", format: "number" },
  clicks: { label: "Kliknięcia reklam", format: "number" },
  video_3s: { label: "Odtworzenia 3 s", format: "number" },
  goals: { label: "Konwersje celów", format: "number" },
  goal_value: { label: "Wartość celów", format: "money" },
  roas: { label: "ROAS", format: "ratio" },
  cpl: { label: "Koszt leada (CPL)", format: "money" },
  cpa: { label: "Koszt sprzedaży (CPA)", format: "money" },
  aov: { label: "Średnia wartość zamówienia", format: "money" },
  hook_rate: { label: "Hook rate", format: "percent" },
  ctr_ads: { label: "CTR reklam", format: "percent" },
  ctr_page: { label: "CTR stron", format: "percent" },
  conv_rate: { label: "Konwersja na sprzedaż", format: "percent" },
};

export function formatValue(v: number | null | undefined, format: string): string {
  if (v == null || !Number.isFinite(v)) return "—";
  switch (format) {
    case "money":
      return v.toLocaleString("pl-PL", { maximumFractionDigits: 2, minimumFractionDigits: 0 }) + " zł";
    case "percent":
      return (v * 100).toLocaleString("pl-PL", { maximumFractionDigits: 1 }) + "%";
    case "ratio":
      return v.toLocaleString("pl-PL", { maximumFractionDigits: 2 }) + "×";
    default:
      return v.toLocaleString("pl-PL", { maximumFractionDigits: 2 });
  }
}
