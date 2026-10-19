// Liczby dla pętli SOP – wyłącznie z prawdziwych danych. Brak danych = luka (null), nigdy szacunek.
import { q } from "./db";
import { dataSources, type SourceStatus } from "./dashboard";
import { periodStats, prepare, type Prepared } from "./economics";
import { fold } from "./csv";
import { netOf } from "./settings";
import { bestWindows, levers, metricsOf, sumDays, unitValues, worstStage, type DayAgg, type Econ, type MetricKey, type Totals } from "./levers";
import { loadAds, loadOrders, loadSettings, type AdRecord } from "./project-data";
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
  ads: AdRecord[];
  onlyMain: boolean;
  scope: { campaigns: string[]; products: string[] };
  visitorsByDay: Map<string, Set<string>>;
  lastOrder: string | null;
  lastAd: string | null;
}

/** Zakres sesji: wybrane kampanie (wydatki) i produkty (zamówienia). Brak wyboru w sesji = zakres Ekonomii. */
export function scopeOf(s: ProjectSettings) {
  return s.analysisScope ?? s.economicsScope;
}

async function ctx(projectId: string, from: string): Promise<Ctx> {
  const [s, orders, allAds, vis] = await Promise.all([
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
  const scope = scopeOf(s);
  const camps = new Set(scope.campaigns.map((c) => fold(c)));
  const ads = camps.size ? allAds.filter((a) => camps.has(fold(a.campaign.trim()))) : allAds;
  const prods = new Set(scope.products.map((x) => fold(x)));
  const match = prods.size ? (name: string) => prods.has(fold(name.trim())) : undefined;
  const settings = match ? { ...s, mainCategory: "wybrane produkty" } : s;
  const p = prepare(orders, settings, match);
  return {
    s: settings, p, ads, onlyMain: !!match, scope, visitorsByDay,
    lastOrder: p.lastDataTs ? iso(p.lastDataTs) : null,
    lastAd: ads.map((a) => a.end).sort().pop() ?? null,
  };
}

function money(c: Ctx, from: string, to: string): Money {
  const st = periodStats(c.p, c.ads, c.s, { name: "", from, to }, c.onlyMain);
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
  // profit narastająco dzień po dniu (do wykresu celu)
  const series: { day: string; cum: number }[] = [];
  if (started) {
    let cum = 0;
    for (let t = d(goal.date_from); t <= d(end); t += DAY) {
      cum += money(c, iso(t), iso(t)).profit;
      series.push({ day: iso(t), cum });
    }
  }
  return {
    goal,
    series,
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

/* ---------- Silnik „Kwota na stole” na danych projektu ---------- */

/** Dni w zakresie sesji: reklamy (wiersze dzielone po równo na dni) + zamówienia (netto). */
function dailyAgg(c: Ctx, from: string, to: string): DayAgg[] {
  const m = new Map<string, DayAgg>();
  for (let t = d(from); t <= d(to); t += DAY) {
    const k = iso(t);
    m.set(k, { day: k, spend: 0, impressions: 0, clicks: 0, orders: 0, net: 0, sq: 0 });
  }
  for (const a of c.ads) {
    const s = d(a.start);
    const e = d(a.end);
    const n = Math.round((e - s) / DAY) + 1;
    if (n <= 0) continue;
    for (let t = s; t <= e; t += DAY) {
      const x = m.get(iso(t));
      if (!x) continue;
      x.spend += a.spend / n;
      x.impressions += a.impressions / n;
      x.clicks += a.clicks / n;
    }
  }
  for (const o of c.p.orders) {
    if (c.onlyMain && !o.hasMain) continue;
    const x = m.get(iso(o.ts));
    if (!x) continue;
    const net = netOf(o.gross, c.s.vat);
    x.orders++;
    x.net += net;
    x.sq += net * net;
  }
  return [...m.values()];
}

/** LTV 30 ponad pierwszy zakup: średni przychód netto z kolejnych zamówień w 30 dni (klienci z pełnym oknem, start w ostatnich 120 dniach). */
function ltvExtra(c: Ctx, to: string): { value: number | null; matured: number } {
  const last = c.p.lastDataTs;
  const f = d(addDays(to, -119));
  const byKey = new Map<string, number[]>();
  for (const o of c.p.orders) byKey.set(o.key, [...(byKey.get(o.key) ?? []), o.ts]);
  const gross = new Map<string, number>();
  for (const o of c.p.orders) gross.set(`${o.key}|${o.ts}`, o.gross);
  let sum = 0;
  let n = 0;
  for (const [k, first] of c.p.firstMain) {
    if (first < f || first + 30 * DAY > last) continue;
    n++;
    for (const ts of byKey.get(k) ?? []) if (ts > first && ts <= first + 30 * DAY) sum += gross.get(`${k}|${ts}`) ?? 0;
  }
  return n ? { value: netOf(sum / n, c.s.vat), matured: n } : { value: null, matured: 0 };
}

function econOf(c: Ctx, win: Money, ltv: number | null): Econ {
  return {
    varRate: win.net > 0 ? win.variableCosts / win.net : 0,
    fixedMonth: (c.s.costs.monthlyFixed || 0) * (30 / 30.4375),
    taxRate: (c.s.costs.incomeTaxRate || 0) / 100,
    ltvExtra: ltv,
  };
}

export interface EngineResult {
  window: Totals;
  prev: Totals;
  metricsPrev: Record<MetricKey, number | null>;
  ranking: ReturnType<typeof levers>;
  units: ReturnType<typeof unitValues>;
  econ: Econ;
  ltv: { value: number | null; matured: number };
  benchWindows: Partial<Record<MetricKey, { from: string; to: string }>>;
  benchmarkMode: "best7" | "targets";
  th: { minClicks: number; minOrders: number };
  scope: { campaigns: string[]; products: string[] };
  events: { day: string; title: string }[];
  gaps: string[];
}

/** Ranking dźwigni: okno bieżące = ostatnie 30 pełnych dni; benchmark = najlepsze 7 dni z 60 (albo cele z ustawień). */
export async function engine(projectId: string): Promise<EngineResult> {
  const end = addDays(today(), -1);
  const from60 = addDays(end, -59);
  const c = await ctx(projectId, from60);
  const days = dailyAgg(c, from60, end);
  const window = sumDays(days, addDays(end, -29), end);
  const prev = sumDays(days, from60, addDays(end, -30));
  const th = { minClicks: c.s.session.minClicks, minOrders: c.s.session.minOrders };
  const ltv = ltvExtra(c, end);
  const econ = econOf(c, money(c, window.from, window.to), ltv.value);
  const bench: Parameters<typeof levers>[0]["bench"] = {};
  const benchWindows: EngineResult["benchWindows"] = {};
  if (c.s.session.benchmark === "targets") {
    for (const [k, v] of Object.entries(c.s.session.targets)) if (v) bench[k as MetricKey] = { value: v, source: "cel z ustawień" };
  } else {
    const best = bestWindows(days, from60, end, th, addDays);
    for (const [k, b] of Object.entries(best)) {
      bench[k as MetricKey] = { value: b.value, source: `najlepsze 7 dni: ${b.from} – ${b.to}`, totals: b.totals };
      benchWindows[k as MetricKey] = { from: b.from, to: b.to };
    }
  }
  const ranking = levers({ current: window, bench, econ, th });
  const sources = await dataSources(projectId);
  const events = await q<{ day: string; title: string }>(
    "SELECT to_char(day, 'YYYY-MM-DD') AS day, title FROM timeline_events WHERE project_id = $1 AND day >= $2::date ORDER BY day",
    [projectId, from60],
  );
  const gaps = dataGaps(c, sources, end);
  if (ltv.value == null) gaps.push("Brak danych: LTV 30 (żaden klient nie ma jeszcze pełnych 30 dni) – wartość zakupu = sam AOV.");
  if (window.impressions <= 0) gaps.push("Brak danych: wyświetlenia i kliknięcia reklam w zakresie – CPM i CTR nie do policzenia.");
  return {
    window, prev, metricsPrev: metricsOf(prev), ranking, units: unitValues(ranking.base, econ), econ, ltv, benchWindows,
    benchmarkMode: c.s.session.benchmark, th, scope: c.scope, events, gaps,
  };
}

/** Okno pomiaru (do rozstrzygnięcia decyzji) w zakresie sesji. */
export async function measure(projectId: string, from: string, to: string) {
  const c = await ctx(projectId, from);
  const days = dailyAgg(c, from, to);
  return { totals: sumDays(days, from, to), money: money(c, from, to), th: { minClicks: c.s.session.minClicks, minOrders: c.s.session.minOrders } };
}

/** Prawdziwe wartości do porównania z predykcją: profit ostatnich 7 pełnych dni i etap, który się pogorszył. */
export async function predictionActuals(projectId: string) {
  const end = addDays(today(), -1);
  const c = await ctx(projectId, addDays(end, -13));
  const days = dailyAgg(c, addDays(end, -13), end);
  const last = sumDays(days, addDays(end, -6), end);
  const prev = sumDays(days, addDays(end, -13), addDays(end, -7));
  const th = { minClicks: c.s.session.minClicks, minOrders: c.s.session.minOrders };
  return { from: addDays(end, -6), to: end, profit: money(c, addDays(end, -6), end).profit, stage: worstStage(last, prev, th), last, prev };
}
