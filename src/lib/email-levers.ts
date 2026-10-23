// Dźwignie maili: wysyłki/mies. × osoby na wysyłkę × otwarcia × kliknięcia z otwartych × zakupy po kliknięciu × wartość zakupu.
// Czysty moduł (bez bazy) – testy w tests/email-levers.test.ts. Zamówienia z maili = zamówienia z UTM maila.
import { wilson, type Econ, type Thresholds } from "./levers.ts";

export type EmailKey = "e_freq" | "e_list" | "e_open" | "e_ctor" | "e_cr";

export const EMAIL_METRICS: { key: EmailKey; label: string; stage: string; unit: "%" | "szt." | "os." }[] = [
  { key: "e_list", label: "Osoby na wysyłkę", stage: "Maile – lista", unit: "os." },
  { key: "e_freq", label: "Wysyłki / mies.", stage: "Maile – częstotliwość", unit: "szt." },
  { key: "e_open", label: "Otwarcia (open rate)", stage: "Maile – otwarcie", unit: "%" },
  { key: "e_ctor", label: "Kliknięcia z otwartych (CTOR)", stage: "Maile – kliknięcie", unit: "%" },
  { key: "e_cr", label: "Zakupy po kliknięciu z maila", stage: "Maile – zakup", unit: "%" },
];

export interface EmailDay {
  day: string;
  /** liczba wysyłek (kampanii) tego dnia */
  sends: number;
  sent: number;
  opens: number;
  clicks: number;
  /** zamówienia z UTM maila */
  orders: number;
  net: number;
}

export interface EmailTotals { from: string; to: string; days: number; sends: number; sent: number; opens: number; clicks: number; orders: number; net: number }

export function sumEmail(days: EmailDay[], from: string, to: string): EmailTotals {
  const t: EmailTotals = { from, to, days: 0, sends: 0, sent: 0, opens: 0, clicks: 0, orders: 0, net: 0 };
  for (const d of days) {
    if (d.day < from || d.day > to) continue;
    t.days++;
    t.sends += d.sends;
    t.sent += d.sent;
    t.opens += d.opens;
    t.clicks += d.clicks;
    t.orders += d.orders;
    t.net += d.net;
  }
  return t;
}

export type EmailMetrics = Record<EmailKey, number | null> & { aov: number | null };

export function emailMetricsOf(t: EmailTotals): EmailMetrics {
  return {
    e_list: t.sends > 0 ? t.sent / t.sends : null,
    e_freq: t.days > 0 ? (t.sends / t.days) * 30 : null,
    e_open: t.sent > 0 ? t.opens / t.sent : null,
    e_ctor: t.opens > 0 ? t.clicks / t.opens : null,
    e_cr: t.clicks > 0 ? t.orders / t.clicks : null,
    aov: t.orders > 0 ? t.net / t.orders : null,
  };
}

/** Zysk z maili na miesiąc (przychód netto po kosztach zmiennych i podatku); null gdy brakuje którejś metryki. */
export function emailProfit(m: EmailMetrics, e: Econ, over: Partial<Record<EmailKey, number>> = {}): number | null {
  const x = { ...m, ...over };
  if (x.e_freq == null || x.e_list == null || x.e_open == null || x.e_ctor == null || x.e_cr == null || x.aov == null) return null;
  const orders = x.e_freq * x.e_list * x.e_open * x.e_ctor * x.e_cr;
  return orders * (x.aov + (e.ltvExtra ?? 0)) * (1 - e.varRate) * (1 - e.taxRate);
}

export function emailEnough(key: EmailKey, t: EmailTotals, th: Thresholds): boolean {
  if (key === "e_list" || key === "e_freq") return t.sends >= 2;
  if (key === "e_open") return t.opens >= th.minClicks;
  if (key === "e_ctor") return t.clicks >= th.minClicks;
  return t.clicks >= th.minClicks && t.orders >= th.minOrders;
}

export function emailRange(key: EmailKey, t: EmailTotals): [number, number] | null {
  if (key === "e_open") return wilson(t.opens, t.sent);
  if (key === "e_ctor") return wilson(t.clicks, t.opens);
  if (key === "e_cr") return wilson(t.orders, t.clicks);
  return null;
}

export const BEST_EMAIL_DAYS = 14;

/** Najlepsze okno 14 dni (spełniające próg) dla każdej metryki maili – kroczące, dzień po dniu. */
export function bestEmailWindows(days: EmailDay[], from: string, to: string, th: Thresholds, addDays: (d: string, n: number) => string) {
  const out: Partial<Record<EmailKey, { value: number; from: string; to: string; totals: EmailTotals }>> = {};
  for (let end = addDays(from, BEST_EMAIL_DAYS - 1); end <= to; end = addDays(end, 1)) {
    const t = sumEmail(days, addDays(end, -(BEST_EMAIL_DAYS - 1)), end);
    const m = emailMetricsOf(t);
    for (const { key } of EMAIL_METRICS) {
      const v = m[key];
      if (v == null || !emailEnough(key, t, th)) continue;
      const cur = out[key];
      if (!cur || v > cur.value) out[key] = { value: v, from: t.from, to: t.to, totals: t };
    }
  }
  return out;
}

export interface EmailLever {
  key: EmailKey;
  label: string;
  stage: string;
  current: number | null;
  benchmark: number | null;
  benchmarkSource: string;
  value: number | null;
  range: [number, number] | null;
  lowConfidence: boolean;
  missing: string | null;
  per10: number | null;
}

/** Czego brakuje do policzenia modelu maili (opisy, nie szacunki). */
export function emailMissing(t: EmailTotals): string | null {
  if (t.sends <= 0) return "kampanie mailowe w zakresie (import CSV)";
  if (t.opens <= 0) return "otwarcia maili";
  if (t.clicks <= 0) return "kliknięcia w mailach";
  if (t.orders <= 0) return "zamówienia z UTM maila";
  return null;
}

export function emailLevers(inp: { current: EmailTotals; bench: Partial<Record<EmailKey, { value: number; source: string; totals?: EmailTotals }>>; econ: Econ; th: Thresholds }) {
  const { current, bench, econ, th } = inp;
  const base = emailMetricsOf(current);
  const profitNow = emailProfit(base, econ);
  const baseMissing = emailMissing(current);
  const levers: EmailLever[] = EMAIL_METRICS.map((m) => {
    const cur = base[m.key];
    const b = bench[m.key];
    const missing = baseMissing ?? (!b ? `okno ${BEST_EMAIL_DAYS} dni spełniające próg próby` : null);
    let value: number | null = null;
    let range: [number, number] | null = null;
    if (!missing && cur != null && b && profitNow != null) {
      const at = (bv: number, cv: number) => {
        const p1 = emailProfit(base, econ, { [m.key]: cv });
        const p2 = emailProfit(base, econ, { [m.key]: bv });
        return p1 == null || p2 == null ? null : Math.max(0, p2 - p1);
      };
      value = at(b.value, cur);
      const rb = b.totals ? emailRange(m.key, b.totals) : null;
      const rc = emailRange(m.key, current);
      const lo = at(rb ? rb[0] : b.value, rc ? rc[1] : cur);
      const hi = at(rb ? rb[1] : b.value, rc ? rc[0] : cur);
      range = lo != null && hi != null ? [Math.min(lo, hi), Math.max(lo, hi)] : null;
    }
    const per10 = cur != null && profitNow != null ? (emailProfit(base, econ, { [m.key]: cur * 1.1 }) ?? profitNow) - profitNow : null;
    return {
      key: m.key, label: m.label, stage: m.stage, current: cur, benchmark: b?.value ?? null, benchmarkSource: b?.source ?? "",
      value, range, lowConfidence: !emailEnough(m.key, current, th) || !!(b?.totals && !emailEnough(m.key, b.totals, th)), missing, per10,
    };
  });
  levers.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  return { levers, base, profitNow };
}

/** Wartość hipotezy (zł/mies.): metryki maili `to` zamiast obecnych. */
export function emailHypothesisValue(base: EmailMetrics, e: Econ, to: Partial<Record<EmailKey, number>>): number | null {
  const now = emailProfit(base, e);
  const then = emailProfit(base, e, to);
  return now == null || then == null ? null : then - now;
}

/** Wynik hipotezy w oknie sprawdzenia: wartości metryk i wpływ w zł/mies. względem stanu z dnia decyzji. */
export function emailVerdictImpact(base: EmailMetrics, e: Econ, keys: EmailKey[], window: EmailTotals, th: Thresholds) {
  const m = emailMetricsOf(window);
  const to: Partial<Record<EmailKey, number>> = {};
  for (const k of keys) {
    const v = m[k];
    if (v == null) return { actual: null, impact: null, range: null as [number, number] | null, lowConfidence: true };
    to[k] = v;
  }
  const impact = emailHypothesisValue(base, e, to);
  let range: [number, number] | null = null;
  if (keys.length === 1) {
    const r = emailRange(keys[0], window);
    const rr = r ? [emailHypothesisValue(base, e, { [keys[0]]: r[0] }), emailHypothesisValue(base, e, { [keys[0]]: r[1] })] : null;
    range = rr && rr[0] != null && rr[1] != null ? [Math.min(rr[0], rr[1]), Math.max(rr[0], rr[1])] : null;
  }
  return { actual: keys.length === 1 ? to[keys[0]]! : null, impact, range, lowConfidence: keys.some((k) => !emailEnough(k, window, th)) };
}

/** Czy źródło/medium zamówienia wskazuje na maila (lista fragmentów oddzielonych „|”, bez wielkości liter). */
export function isEmailOrder(source: string, medium: string, patterns: string): boolean {
  const parts = patterns.split("|").map((p) => p.trim().toLowerCase()).filter(Boolean);
  const s = `${source} ${medium}`.toLowerCase();
  return parts.some((p) => s.includes(p));
}
