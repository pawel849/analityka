// Silnik „Kwota na stole”: model lejka CPM → CTR → CR → wartość zakupu i dźwignie w zł/mies.
// Czysty moduł (bez bazy) – testy w tests/levers.test.ts.

export type MetricKey = "cpm" | "ctr" | "cr" | "aov";

export const METRICS: { key: MetricKey; label: string; stage: string; better: "up" | "down"; unit: "zł" | "%" }[] = [
  { key: "cpm", label: "CPM", stage: "Reklama – wyświetlenia", better: "down", unit: "zł" },
  { key: "ctr", label: "CTR (kliknięcia w link)", stage: "Reklama – kliknięcie", better: "up", unit: "%" },
  { key: "cr", label: "CR (kliknięcie → zakup)", stage: "Strona – zakup", better: "up", unit: "%" },
  { key: "aov", label: "Wartość zakupu (AOV netto)", stage: "Zakup – koszyk", better: "up", unit: "zł" },
];

/** Dzień w zakresie sesji: reklamy z wybranych kampanii, zamówienia z wybranych produktów. */
export interface DayAgg {
  day: string;
  spend: number;
  impressions: number;
  clicks: number;
  orders: number;
  /** przychód netto zamówień */
  net: number;
  /** suma kwadratów przychodu netto pojedynczych zamówień (do zakresu AOV) */
  sq: number;
}

export interface Totals { from: string; to: string; days: number; spend: number; impressions: number; clicks: number; orders: number; net: number; sq: number }

export function sumDays(days: DayAgg[], from: string, to: string): Totals {
  const t: Totals = { from, to, days: 0, spend: 0, impressions: 0, clicks: 0, orders: 0, net: 0, sq: 0 };
  for (const d of days) {
    if (d.day < from || d.day > to) continue;
    t.days++;
    t.spend += d.spend;
    t.impressions += d.impressions;
    t.clicks += d.clicks;
    t.orders += d.orders;
    t.net += d.net;
    t.sq += d.sq;
  }
  return t;
}

export type Metrics = Record<MetricKey, number | null>;

export function metricsOf(t: Totals): Metrics {
  return {
    cpm: t.impressions > 0 ? (t.spend / t.impressions) * 1000 : null,
    ctr: t.impressions > 0 ? t.clicks / t.impressions : null,
    cr: t.clicks > 0 ? t.orders / t.clicks : null,
    aov: t.orders > 0 ? t.net / t.orders : null,
  };
}

/** Koszty po wszystkim – parametry z ustawień i z okresu bazowego. */
export interface Econ {
  /** koszty zmienne jako udział przychodu netto */
  varRate: number;
  fixedMonth: number;
  /** stawka podatku 0–1 */
  taxRate: number;
  /** dodatkowy przychód netto na kupującego w 30 dni po pierwszym zakupie (LTV 30 − pierwszy zakup); null = brak danych */
  ltvExtra: number | null;
}

/** Profit miesięczny z modelu: budżet stały, reszta lejka z `m`. */
export function profitMonth(budget: number, m: Record<MetricKey, number>, e: Econ): number {
  const purchases = m.cpm > 0 ? (budget / m.cpm) * 1000 * m.ctr * m.cr : 0;
  const revenue = purchases * (m.aov + (e.ltvExtra ?? 0));
  const before = revenue * (1 - e.varRate) - budget - e.fixedMonth;
  return before > 0 ? before * (1 - e.taxRate) : before;
}

/** 90% przedział Wilsona dla proporcji. */
export function wilson(k: number, n: number, z = 1.645): [number, number] | null {
  if (n <= 0) return null;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const c = (p + (z * z) / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

/** 90% zakres metryki w oknie (z próby). */
export function rangeOf(key: MetricKey, t: Totals): [number, number] | null {
  if (key === "ctr") return wilson(t.clicks, t.impressions);
  if (key === "cr") return wilson(t.orders, t.clicks);
  if (key === "aov") {
    if (t.orders < 2) return null;
    const mean = t.net / t.orders;
    const sd = Math.sqrt(Math.max(0, t.sq / t.orders - mean * mean));
    const h = (1.645 * sd) / Math.sqrt(t.orders);
    return [Math.max(0, mean - h), mean + h];
  }
  if (t.impressions <= 0) return null;
  const h = 1.645 * Math.sqrt(t.impressions);
  return [(t.spend / (t.impressions + h)) * 1000, (t.spend / Math.max(1, t.impressions - h)) * 1000];
}

export interface Thresholds { minClicks: number; minOrders: number }

/** Czy okno spełnia próg dla danej metryki. */
export function enoughFor(key: MetricKey, t: Totals, th: Thresholds): boolean {
  if (key === "cpm" || key === "ctr") return t.clicks >= th.minClicks;
  return t.clicks >= th.minClicks && t.orders >= th.minOrders;
}

const better = (key: MetricKey, a: number, b: number) => (METRICS.find((m) => m.key === key)!.better === "up" ? a > b : a < b);

/** Najlepsze okno 7-dniowe (spełniające próg) dla każdej metryki – kroczące, dzień po dniu. */
export function bestWindows(days: DayAgg[], from: string, to: string, th: Thresholds, addDays: (d: string, n: number) => string) {
  const out: Partial<Record<MetricKey, { value: number; from: string; to: string; totals: Totals }>> = {};
  for (let end = addDays(from, 6); end <= to; end = addDays(end, 1)) {
    const t = sumDays(days, addDays(end, -6), end);
    const m = metricsOf(t);
    for (const { key } of METRICS) {
      const v = m[key];
      if (v == null || !enoughFor(key, t, th)) continue;
      const cur = out[key];
      if (!cur || better(key, v, cur.value)) out[key] = { value: v, from: t.from, to: t.to, totals: t };
    }
  }
  return out;
}

export interface Lever {
  key: MetricKey;
  label: string;
  stage: string;
  current: number | null;
  benchmark: number | null;
  /** skąd benchmark: okno 7 dni albo wartość docelowa z ustawień */
  benchmarkSource: string;
  /** zł/mies. przy budżecie stałym i reszcie lejka bez zmian */
  value: number | null;
  range: [number, number] | null;
  lowConfidence: boolean;
  /** brak danych: czego */
  missing: string | null;
  /** zł/mies. za poprawę metryki o 10% na korzyść – ekwiwalent każdej liczby diagnostycznej */
  per10: number | null;
}

export interface EngineInput {
  current: Totals;
  /** benchmark per metryka (okno albo cel z ustawień) */
  bench: Partial<Record<MetricKey, { value: number; source: string; totals?: Totals }>>;
  econ: Econ;
  th: Thresholds;
}

/** Profit miesięczny po podstawieniu metryk; null gdy brakuje którejś metryki. */
export function modelProfit(budget: number, base: Metrics, e: Econ, over: Partial<Record<MetricKey, number>> = {}): number | null {
  const m = { ...base, ...over };
  if (m.cpm == null || m.ctr == null || m.cr == null || m.aov == null) return null;
  return profitMonth(budget, m as Record<MetricKey, number>, e);
}

/** Budżet miesięczny z okna (stały w modelu). */
export const monthBudget = (t: Totals) => (t.days > 0 ? (t.spend / t.days) * 30 : 0);

export function improve(key: MetricKey, v: number, share: number): number {
  return METRICS.find((m) => m.key === key)!.better === "up" ? v * (1 + share) : v * (1 - share);
}

export function levers(inp: EngineInput): { levers: Lever[]; budget: number; base: Metrics; profitNow: number | null; lowSample: boolean } {
  const { current, bench, econ, th } = inp;
  const base = metricsOf(current);
  const budget = monthBudget(current);
  const profitNow = modelProfit(budget, base, econ);
  const missingBase = METRICS.filter((m) => base[m.key] == null).map((m) => m.label);
  const out: Lever[] = METRICS.map((m) => {
    const cur = base[m.key];
    const b = bench[m.key];
    const low = !enoughFor(m.key, current, th);
    let missing: string | null = null;
    if (budget <= 0) missing = "koszt reklam w zakresie (0 zł)";
    else if (missingBase.length) missing = missingBase.join(", ");
    else if (!b) missing = "okno 7 dni spełniające próg próby";
    let value: number | null = null;
    let range: [number, number] | null = null;
    if (!missing && cur != null && b && profitNow != null) {
      const at = (bv: number, cv: number) => {
        const p1 = modelProfit(budget, { ...base, [m.key]: cv }, econ);
        const p2 = modelProfit(budget, { ...base, [m.key]: bv }, econ, { [m.key]: bv });
        return p1 == null || p2 == null ? null : Math.max(0, p2 - p1);
      };
      value = at(b.value, cur);
      const rb = b.totals ? rangeOf(m.key, b.totals) : null;
      const rc = rangeOf(m.key, current);
      const up = m.better === "up";
      const bLo = rb ? (up ? rb[0] : rb[1]) : b.value;
      const bHi = rb ? (up ? rb[1] : rb[0]) : b.value;
      const cLo = rc ? (up ? rc[0] : rc[1]) : cur;
      const cHi = rc ? (up ? rc[1] : rc[0]) : cur;
      const lo = at(bLo, cHi);
      const hi = at(bHi, cLo);
      range = lo != null && hi != null ? [Math.min(lo, hi), Math.max(lo, hi)] : null;
    }
    const per10 = cur != null && profitNow != null ? (modelProfit(budget, base, econ, { [m.key]: improve(m.key, cur, 0.1) }) ?? profitNow) - profitNow : null;
    return {
      key: m.key, label: m.label, stage: m.stage, current: cur, benchmark: b?.value ?? null, benchmarkSource: b?.source ?? "",
      value, range, lowConfidence: low || !!(b?.totals && !enoughFor(m.key, b.totals, th)), missing, per10,
    };
  });
  out.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  return { levers: out, budget, base, profitNow, lowSample: current.clicks < th.minClicks || current.orders < th.minOrders };
}

/** Zł za jednostkę wolumenu (ekwiwalent liczb typu „kliknięcia”, „zamówienia”) – marginalnie, przy stałym budżecie. */
export function unitValues(base: Metrics, e: Econ) {
  const perOrder = base.aov == null ? null : (base.aov + (e.ltvExtra ?? 0)) * (1 - e.varRate) * (1 - e.taxRate);
  const perClick = perOrder == null || base.cr == null ? null : perOrder * base.cr;
  const perMille = perClick == null || base.ctr == null ? null : perClick * base.ctr * 1000;
  return { perOrder, perClick, perMille };
}

/** Wartość oczekiwana hipotezy „metryka M z A do B” (zł/mies.). Ujemna, gdy B gorsze od A. */
export function hypothesisValue(budget: number, base: Metrics, e: Econ, key: MetricKey, to: number): number | null {
  const now = modelProfit(budget, base, e);
  const then = modelProfit(budget, base, e, { [key]: to });
  return now == null || then == null ? null : then - now;
}

/** Etap, który się pogorszył najbardziej (>5%, ostatnie 7 dni vs poprzednie 7), tylko z metryk spełniających próg. */
export function worstStage(last: Totals, prev: Totals, th: Thresholds): MetricKey | "żaden" | null {
  const a = metricsOf(last);
  const b = metricsOf(prev);
  let worst: { key: MetricKey; drop: number } | null = null;
  let all = true;
  for (const m of METRICS) {
    const x = a[m.key];
    const y = b[m.key];
    if (x == null || y == null || !y || !enoughFor(m.key, last, th) || !enoughFor(m.key, prev, th)) {
      all = false;
      continue;
    }
    const drop = m.better === "up" ? (y - x) / y : (x - y) / y;
    if (drop > 0.05 && (!worst || drop > worst.drop)) worst = { key: m.key, drop };
  }
  // „żaden” tylko, gdy wszystkie etapy dało się zmierzyć; inaczej brak danych
  return worst ? worst.key : all ? "żaden" : null;
}

/** Wynik hipotezy: wartość metryki w oknie sprawdzenia i jej wpływ w zł/mies. względem stanu z dnia decyzji. */
export function verdictImpact(budget: number, base: Metrics, e: Econ, key: MetricKey, window: Totals, th: Thresholds) {
  const actual = metricsOf(window)[key];
  if (actual == null) return { actual: null, impact: null, range: null as [number, number] | null, lowConfidence: true };
  const impact = hypothesisValue(budget, base, e, key, actual);
  const r = rangeOf(key, window);
  const rr = r ? [hypothesisValue(budget, base, e, key, r[0]), hypothesisValue(budget, base, e, key, r[1])] : null;
  return {
    actual,
    impact,
    range: rr && rr[0] != null && rr[1] != null ? ([Math.min(rr[0], rr[1]), Math.max(rr[0], rr[1])] as [number, number]) : null,
    lowConfidence: !enoughFor(key, window, th),
  };
}
