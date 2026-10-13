// Silnik analizy lejka: liczy przepływy na węzłach i strzałkach ze zdarzeń trackingu
// oraz danych ręcznych. Czysty moduł (bez I/O), testowany w tests/analysis.test.ts.
import type { Category, NodeData } from "./catalog";

export interface GraphNode {
  id: string;
  data: NodeData;
}
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
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
}

export interface EdgeStats {
  people: number;
  rate: number | null;
  estimated: boolean;
}

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

function matchesSource(tokens: string[], ev: TrackedEvent): boolean {
  if (ev.type !== "pageview") return false;
  const src = eventSource(ev);
  return tokens.some((t) => (t === "(direct)" ? src === "(direct)" : src === t || src.includes(t)));
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

interface Span {
  first: number;
  last: number;
}

export function analyze(
  nodes: GraphNode[],
  edges: GraphEdge[],
  events: TrackedEvent[],
  manual: ManualRow[],
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

  for (const n of nodes) {
    const d = n.data;
    const visitors = new Map<string, Span>();
    const touch = (v: string, ts: number) => {
      const s = visitors.get(v);
      if (!s) visitors.set(v, { first: ts, last: ts });
      else {
        if (ts < s.first) s.first = ts;
        if (ts > s.last) s.last = ts;
      }
    };
    const st: NodeStats = { category: d.category, people: 0, tracked: false };

    if (d.category === "source") {
      const tokens = (d.sourceMatch ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
      if (tokens.length) {
        st.tracked = true;
        for (const ev of events) if (matchesSource(tokens, ev)) touch(ev.visitor_id, ev.ts);
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
      if (d.url) {
        st.tracked = true;
        let pv = 0;
        let clicks = 0;
        const scrollMax = new Map<string, number>();
        for (const ev of events) {
          if (!matchesPage(d.url, ev)) continue;
          if (ev.type === "pageview") {
            pv++;
            touch(ev.visitor_id, ev.ts);
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
          if (!matchesAction(d, ev)) continue;
          touch(ev.visitor_id, ev.ts);
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
    nodeStats[n.id] = st;
  }

  const edgeStats: Record<string, EdgeStats> = {};
  for (const e of edges) {
    const s = nodeStats[e.source];
    const t = nodeStats[e.target];
    if (!s || !t) continue;
    let people: number;
    let estimated = false;
    if (s.tracked && t.tracked) {
      const a = spans.get(e.source)!;
      const b = spans.get(e.target)!;
      people = 0;
      for (const [v, sa] of a) {
        const sb = b.get(v);
        if (sb && sb.last >= sa.first) people++;
      }
    } else {
      people = Math.min(t.people, s.people || t.people);
      estimated = true;
    }
    edgeStats[e.id] = { people, rate: div(people, s.people), estimated };
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
