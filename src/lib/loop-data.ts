// Liczby dla pętli SOP – wyłącznie z prawdziwych danych. Brak danych = luka (null), nigdy szacunek.
import { q } from "./db";
import { dataSources, type SourceStatus } from "./dashboard";
import { periodStats, prepare, type EconAd, type Prepared } from "./economics";
import { runFunnelAnalysis } from "./funnel-analysis";
import { loadAds, loadOrders, loadSettings } from "./project-data";
import type { ProjectSettings } from "./settings";

const DAY = 86400_000;
export const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const today = () => iso(Date.now());
const d = (s: string) => Date.parse(`${s}T00:00:00Z`);
export const addDays = (s: string, n: number) => iso(d(s) + n * DAY);
export const daysBetween = (a: string, b: string) => Math.round((d(b) - d(a)) / DAY) + 1; // włącznie

export interface Money {
  from: string;
  to: string;
  revenue: number; // brutto
  net: number;
  spend: number;
  variableCosts: number;
  fixedCosts: number;
  tax: number;
  /** Profit po wszystkim: przychód netto − reklamy − koszty zmienne − stałe (proporcjonalnie do dni) − podatek. */
  profit: number;
  orders: number;
  visitors: number | null;
}

interface Ctx {
  s: ProjectSettings;
  p: Prepared;
  ads: EconAd[];
  visitorsByDay: Map<string, Set<string>>;
  lastOrder: string | null;
  lastAd: string | null;
}

async function ctx(projectId: string, from: string): Promise<Ctx> {
  const [s, orders, ads, vis] = await Promise.all([
    loadSettings(projectId),
    loadOrders(projectId),
    loadAds(projectId),
    q<{ day: string; visitor_id: string }>(
      `SELECT DISTINCT to_char(ts, 'YYYY-MM-DD') AS day, visitor_id FROM events
       WHERE project_id = $1 AND NOT is_test AND type = 'pageview' AND ts >= $2::date`,
      [projectId, from],
    ),
  ]);
  const visitorsByDay = new Map<string, Set<string>>();
  for (const v of vis) {
    const set = visitorsByDay.get(v.day) ?? new Set<string>();
    set.add(v.visitor_id);
    visitorsByDay.set(v.day, set);
  }
  const p = prepare(orders, s);
  return {
    s, p, ads, visitorsByDay,
    lastOrder: p.lastDataTs ? iso(p.lastDataTs) : null,
    lastAd: ads.map((a) => a.end).sort().pop() ?? null,
  };
}

function money(c: Ctx, from: string, to: string): Money {
  const st = periodStats(c.p, c.ads, c.s, { name: "", from, to });
  const days = daysBetween(from, to);
  const fixedCosts = (c.s.costs.monthlyFixed || 0) * (days / 30.4375);
  const before = st.profit.netRevenue - st.profit.spend - st.profit.variableCosts - fixedCosts;
  const tax = before > 0 ? before * ((c.s.costs.incomeTaxRate || 0) / 100) : 0;
  const people = new Set<string>();
  let anyVisit = false;
  for (let t = d(from); t <= d(to); t += DAY) {
    const set = c.visitorsByDay.get(iso(t));
    if (set) {
      anyVisit = true;
      for (const v of set) people.add(v);
    }
  }
  return {
    from, to, revenue: st.gross, net: st.net, spend: st.spend, variableCosts: st.profit.variableCosts, fixedCosts, tax,
    profit: before - tax, orders: st.orders, visitors: anyVisit ? people.size : null,
  };
}

export interface Gaps {
  /** Opisy luk w danych – widoczne na ekranie, nie zastępowane szacunkiem. */
  list: string[];
}

function dataGaps(c: Ctx, sources: SourceStatus[], to: string): string[] {
  const out: string[] = [];
  for (const s of sources) if (s.state !== "ok") out.push(`${s.label}: ${s.detail}`);
  if (c.lastAd && c.lastAd < addDays(to, -2)) out.push(`Koszty reklam są tylko do ${c.lastAd} – późniejsze dni mają 0 zł wydatków.`);
  if (!c.lastAd) out.push("Brak kosztów reklam – profit jest zawyżony o całe wydatki.");
  if (!c.lastOrder) out.push("Brak zamówień – przychód = 0.");
  if (!c.s.costs.monthlyFixed && !c.s.costs.variableCostRates.length) out.push("Brak kosztów stałych i zmiennych w Ustawieniach – profit liczony tylko po reklamach i podatku.");
  return out;
}

/** Krok 2: te same liczby w trzech skalach + źródła + zdarzenia z osi czasu. */
export async function reality(projectId: string) {
  const t = today();
  const wideFrom = addDays(t, -59);
  const c = await ctx(projectId, addDays(wideFrom, -60));
  const sources = await dataSources(projectId);
  const wide = money(c, wideFrom, t);
  const widePrev = money(c, addDays(wideFrom, -60), addDays(wideFrom, -1));
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const to = addDays(t, -7 * i);
    return money(c, addDays(to, -6), to);
  }).reverse();
  const days = Array.from({ length: 14 }, (_, i) => money(c, addDays(t, -i), addDays(t, -i))).reverse();
  const daily60 = Array.from({ length: 60 }, (_, i) => money(c, addDays(t, -i), addDays(t, -i))).reverse();
  const events = await q<{ day: string; title: string; type: string }>(
    "SELECT to_char(day, 'YYYY-MM-DD') AS day, title, type FROM timeline_events WHERE project_id = $1 AND day >= $2::date ORDER BY day",
    [projectId, wideFrom],
  );
  return {
    today: t,
    wide, widePrev, weeks, days, daily60, events, sources,
    gaps: dataGaps(c, sources, t),
    lastOrder: c.lastOrder, lastAd: c.lastAd,
    sourceOf: { revenue: c.lastOrder ? "zamówienia (sklep / import)" : null, spend: c.lastAd ? "koszty reklam (Meta API / import)" : null, visitors: c.visitorsByDay.size ? "skrypt na stronach" : null },
  };
}

export interface GoalRow {
  id: string;
  period: string;
  date_from: string;
  date_to: string;
  profit_target: number;
  diag: Record<string, number>;
  approved_by: string;
}

/** Pasek celu + Krok 3: tempo potrzebne vs obecne, luka, prognoza (tylko informacyjnie), dźwignie z prawdziwych danych. */
export async function gap(projectId: string, goal: GoalRow) {
  const t = today();
  const c = await ctx(projectId, goal.date_from);
  const end = t < goal.date_to ? t : goal.date_to;
  const started = t >= goal.date_from;
  const done = started ? money(c, goal.date_from, end) : null;
  const totalDays = daysBetween(goal.date_from, goal.date_to);
  const elapsed = started ? daysBetween(goal.date_from, end) : 0;
  const left = Math.max(0, totalDays - elapsed);
  const achieved = done?.profit ?? 0;
  const needPerDay = goal.profit_target / totalDays;
  const needFromNow = left > 0 ? (goal.profit_target - achieved) / left : null;
  const pacePerDay = elapsed > 0 ? achieved / elapsed : null;
  const sources = await dataSources(projectId);
  return {
    goal,
    achieved,
    money: done,
    totalDays, elapsed, left,
    target: goal.profit_target,
    gap: goal.profit_target - achieved,
    needPerDay, needPerWeek: needPerDay * 7,
    needFromNow,
    pacePerDay,
    /** Prognoza „duch”: jeśli obecne tempo się utrzyma (prosta ekstrapolacja, nie model). */
    forecast: pacePerDay == null ? null : achieved + pacePerDay * left,
    levers: done
      ? {
          traffic: done.visitors,
          conversion: done.visitors ? done.orders / done.visitors : null,
          aov: done.orders ? done.revenue / done.orders : null,
          spend: done.spend,
          otherCosts: done.variableCosts + done.fixedCosts + done.tax,
          orders: done.orders,
        }
      : null,
    gaps: dataGaps(c, sources, end),
  };
}

/** Krok 4: etapy lejka (kolejność z mapy), osoby, przejście do następnego, koszt na osobę, zmiana vs poprzednie 30 dni. */
export async function funnelStages(funnelId: string) {
  const t = today();
  const from = addDays(t, -29);
  const [cur, prev, raw] = await Promise.all([
    runFunnelAnalysis(funnelId, from, t),
    runFunnelAnalysis(funnelId, addDays(from, -30), addDays(from, -1)),
    q<{ graph: unknown }>("SELECT graph FROM funnels WHERE id = $1", [funnelId]),
  ]);
  if (!cur || !raw[0]) return null;
  const graph = (typeof raw[0].graph === "string" ? JSON.parse(raw[0].graph) : raw[0].graph) as {
    nodes: { id: string; type?: string; position?: { x: number; y: number }; data?: { label?: string; category?: string; eventType?: string } }[];
    edges?: { source: string; target: string }[];
  };
  const nodes = (graph.nodes ?? [])
    .filter((n) => (n.type ?? "funnel") === "funnel" && n.data?.category && n.data.category !== "offline")
    .sort((a, b) => (a.position?.x ?? 0) - (b.position?.x ?? 0) || (a.position?.y ?? 0) - (b.position?.y ?? 0));
  const value = (st: { people: number; conversions?: number; category: string } | undefined, purchase: boolean) =>
    st ? (purchase ? st.conversions ?? st.people : st.people) : null;
  const spend = cur.totals.spend;
  const stages = nodes.map((n, i) => {
    const purchase = n.data?.eventType === "purchase";
    const st = cur.nodes[n.id];
    const pv = prev?.nodes[n.id];
    const people = st && st.tracked ? value(st, purchase) : null;
    const before = pv && pv.tracked ? value(pv, purchase) : null;
    return { id: n.id, label: n.data?.label ?? `Etap ${i + 1}`, category: n.data?.category ?? "", people, before, gap: !st || !st.tracked || !people };
  });
  return {
    from, to: t, spend,
    stages: stages.map((s) => {
      // przejście liczone po strzałkach z mapy: suma osób na etapach, do których prowadzi ten etap
      const targets = (graph.edges ?? []).filter((e) => e.source === s.id).map((e) => stages.find((x) => x.id === e.target)).filter((x): x is (typeof stages)[number] => !!x);
      const reach = targets.filter((x) => x.people != null).reduce((a, x) => a + (x.people ?? 0), 0);
      return {
        ...s,
        nextLabel: targets.map((x) => x.label).join(", ") || null,
        toNext: targets.length && s.people && targets.some((x) => x.people != null) ? reach / s.people : null,
        costPerPerson: s.people && spend ? spend / s.people : null,
        change: s.people != null && s.before ? s.people / s.before - 1 : null,
      };
    }),
  };
}
