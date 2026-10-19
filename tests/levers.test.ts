import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bestWindows, hypothesisValue, levers, metricsOf, profitMonth, sumDays, unitValues, verdictImpact, wilson, worstStage, type DayAgg, type Econ,
} from "../src/lib/levers.ts";

const add = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const E: Econ = { varRate: 0, fixedMonth: 0, taxRate: 0, ltvExtra: null };

function days(n: number, f: (i: number) => Partial<DayAgg>): DayAgg[] {
  return Array.from({ length: n }, (_, i) => ({ day: add("2026-01-01", i), spend: 100, impressions: 10000, clicks: 100, orders: 2, net: 400, sq: 2 * 200 * 200, ...f(i) }));
}

test("model: profit = zakupy × AOV − budżet", () => {
  // 3000 zł / CPM 10 → 300 000 wyśw. × 1% → 3000 kliknięć × 2% → 60 zakupów × 200 zł = 12 000
  assert.equal(Math.round(profitMonth(3000, { cpm: 10, ctr: 0.01, cr: 0.02, aov: 200 }, E)), 9000);
  // podatek i koszty zmienne
  assert.equal(Math.round(profitMonth(3000, { cpm: 10, ctr: 0.01, cr: 0.02, aov: 200 }, { varRate: 0.5, fixedMonth: 1000, taxRate: 0.19, ltvExtra: 50 })), Math.round((15000 * 0.5 - 3000 - 1000) * 0.81));
});

test("metryki i suma okna", () => {
  const t = sumDays(days(30, () => ({})), "2026-01-01", "2026-01-30");
  assert.deepEqual(metricsOf(t), { cpm: 10, ctr: 0.01, cr: 0.02, aov: 200 });
});

test("benchmark = najlepsze okno 7 dni spełniające próg", () => {
  // dni 10–16: CTR 2%, ale tylko w dniach 14–16 wystarczy kliknięć (próg sumaryczny 700)
  const d = days(40, (i) => (i >= 10 && i <= 16 ? { clicks: 200 } : {}));
  const b = bestWindows(d, "2026-01-01", "2026-02-09", { minClicks: 700, minOrders: 10 }, add);
  assert.equal(b.ctr?.from, "2026-01-11");
  assert.equal(Math.round(b.ctr!.value * 1000) / 1000, 0.02);
  // za wysoki próg → brak okna
  const none = bestWindows(d, "2026-01-01", "2026-02-09", { minClicks: 100000, minOrders: 10 }, add);
  assert.equal(none.ctr, undefined);
});

test("dźwignie: ranking w zł, brak danych, niska pewność", () => {
  const cur = sumDays(days(30, () => ({})), "2026-01-01", "2026-01-30");
  const r = levers({ current: cur, bench: { ctr: { value: 0.015, source: "okno" }, cr: { value: 0.021, source: "okno" } }, econ: E, th: { minClicks: 100, minOrders: 10 } });
  assert.equal(r.levers[0].key, "ctr");
  // budżet 3000/mies., CTR 1% → 1,5%: +50% zakupów = +6000 zł
  assert.equal(Math.round(r.levers[0].value!), 6000);
  assert.equal(r.levers.find((l) => l.key === "cpm")!.missing, "okno 7 dni spełniające próg próby");
  assert.equal(r.levers[0].lowConfidence, false);
  const small = sumDays(days(3, () => ({ clicks: 10, orders: 1 })), "2026-01-01", "2026-01-03");
  const s = levers({ current: small, bench: { ctr: { value: 0.002, source: "okno" } }, econ: E, th: { minClicks: 100, minOrders: 10 } });
  assert.ok(s.levers.every((l) => l.lowConfidence));
});

test("hipoteza i rozstrzygnięcie", () => {
  const base = { cpm: 10, ctr: 0.01, cr: 0.02, aov: 200 };
  assert.equal(Math.round(hypothesisValue(3000, base, E, "cr", 0.03)!), 6000);
  assert.ok(hypothesisValue(3000, base, E, "cr", 0.01)! < 0);
  const w = sumDays(days(14, () => ({ orders: 3 })), "2026-01-01", "2026-01-14");
  const v = verdictImpact(3000, base, E, "cr", w, { minClicks: 100, minOrders: 10 });
  assert.equal(Math.round(v.impact!), 6000);
  assert.equal(v.lowConfidence, false);
  assert.ok(v.range![0] < v.impact! && v.range![1] > v.impact!);
});

test("Wilson, wartość jednostki, pogorszony etap", () => {
  const [lo, hi] = wilson(10, 100)!;
  assert.ok(lo > 0.05 && lo < 0.1 && hi > 0.1 && hi < 0.17);
  const u = unitValues({ cpm: 10, ctr: 0.01, cr: 0.02, aov: 200 }, E);
  assert.equal(u.perOrder, 200);
  assert.equal(u.perClick, 4);
  const last = sumDays(days(7, () => ({ orders: 1 })), "2026-01-01", "2026-01-07");
  const prev = sumDays(days(7, () => ({})), "2026-01-01", "2026-01-07");
  assert.equal(worstStage(last, prev, { minClicks: 100, minOrders: 5 }), "cr");
  assert.equal(worstStage(prev, prev, { minClicks: 100, minOrders: 5 }), "żaden");
  assert.equal(worstStage(last, prev, { minClicks: 100000, minOrders: 5 }), null);
});
