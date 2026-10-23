import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bestEmailWindows, emailHypothesisValue, emailLevers, emailMetricsOf, emailProfit, emailVerdictImpact, isEmailOrder, sumEmail, type EmailDay,
} from "../src/lib/email-levers.ts";
import { normalizeEmails, autoMap } from "../src/lib/importing.ts";
import type { Econ } from "../src/lib/levers.ts";

const add = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const E: Econ = { varRate: 0, fixedMonth: 0, taxRate: 0, ltvExtra: null };
const TH = { minClicks: 100, minOrders: 5 };

/** Wysyłka co 7 dni: 10 000 osób, 30% otwarć, 10% kliknięć z otwartych, 2% zakupów, 200 zł. */
function days(n: number, f: (i: number) => Partial<EmailDay> = () => ({})): EmailDay[] {
  return Array.from({ length: n }, (_, i) => {
    const send = i % 7 === 0;
    return { day: add("2026-01-01", i), sends: send ? 1 : 0, sent: send ? 10000 : 0, opens: send ? 3000 : 0, clicks: send ? 300 : 0, orders: send ? 6 : 0, net: send ? 1200 : 0, ...(send ? f(i) : {}) };
  });
}

test("model maili: wysyłki × osoby × otwarcia × kliknięcia × zakupy × koszyk", () => {
  const m = emailMetricsOf(sumEmail(days(28), "2026-01-01", "2026-01-28"));
  assert.equal(m.e_list, 10000);
  assert.ok(Math.abs(m.e_freq! - (4 / 28) * 30) < 1e-9);
  assert.equal(m.e_open, 0.3);
  assert.equal(m.e_ctor, 0.1);
  assert.equal(m.e_cr, 0.02);
  assert.equal(m.aov, 200);
  // 4,2857 wysyłki × 10 000 × 0,3 × 0,1 × 0,02 × 200 zł
  assert.equal(Math.round(emailProfit(m, E)!), Math.round((4 / 28) * 30 * 10000 * 0.3 * 0.1 * 0.02 * 200));
  assert.equal(Math.round(emailProfit(m, { ...E, varRate: 0.5, taxRate: 0.19 })!), Math.round((4 / 28) * 30 * 1200 * 0.5 * 0.81));
});

test("brak zamówień z UTM = brak modelu, dźwignie z opisem luki zamiast kwoty", () => {
  const d = days(56, () => ({ orders: 0, net: 0 }));
  const r = emailLevers({ current: sumEmail(d, "2026-01-29", "2026-02-25"), bench: {}, econ: E, th: TH });
  assert.equal(r.profitNow, null);
  for (const l of r.levers) {
    assert.equal(l.value, null);
    assert.equal(l.missing, "zamówienia z UTM maila");
  }
});

test("najlepsze okno 14 dni i wartość dźwigni otwarć", () => {
  // w dniach 0–13 otwarcia 40%, potem 30%
  const d = days(56, (i) => (i < 14 ? { opens: 4000, clicks: 400 } : {}));
  const best = bestEmailWindows(d, "2026-01-01", "2026-02-25", TH, add);
  assert.equal(best.e_open?.value, 0.4);
  const cur = sumEmail(d, "2026-01-29", "2026-02-25");
  const r = emailLevers({ current: cur, bench: { e_open: { value: 0.4, source: "x", totals: best.e_open!.totals } }, econ: E, th: TH });
  const open = r.levers.find((l) => l.key === "e_open")!;
  const base = emailMetricsOf(cur);
  assert.equal(Math.round(open.value!), Math.round(emailProfit(base, E, { e_open: 0.4 })! - emailProfit(base, E)!));
  assert.ok(open.value! > 0);
  assert.equal(r.levers[0].key, "e_open");
  assert.ok(open.range && open.range[0] <= open.value! && open.value! <= open.range[1]);
});

test("hipoteza i rozstrzygnięcie: jedna metryka albo cała kategoria", () => {
  const base = emailMetricsOf(sumEmail(days(28), "2026-01-01", "2026-01-28"));
  const v = emailHypothesisValue(base, E, { e_open: 0.33 })!;
  assert.ok(Math.abs(v - emailProfit(base, E)! * 0.1) < 1e-6);
  const win = sumEmail(days(28, () => ({ opens: 3300, clicks: 330 })), "2026-01-01", "2026-01-28");
  const one = emailVerdictImpact(base, E, ["e_open"], win, TH);
  assert.ok(Math.abs(one.actual! - 0.33) < 1e-9);
  assert.ok(Math.abs(one.impact! - v) < 1e-6);
  const all = emailVerdictImpact(base, E, ["e_list", "e_freq", "e_open", "e_ctor", "e_cr"], win, TH);
  assert.equal(all.actual, null);
  // więcej otwarć i kliknięć, ale tyle samo zamówień → cała kategoria bez zmiany w zł
  assert.ok(Math.abs(all.impact!) < 1e-6);
});

test("UTM maila i import CSV kampanii", () => {
  assert.ok(isEmailOrder("mailerlite", "", "mail|newsletter"));
  assert.ok(isEmailOrder("", "Newsletter", "mail|newsletter"));
  assert.ok(!isEmailOrder("facebook", "cpc", "mail|newsletter"));
  const headers = ["Campaign name", "Sent on", "Recipients", "Unique opens", "Unique clicks", "Unsubscribed"];
  const map = autoMap("emails", headers);
  assert.deepEqual(map, { sent_at: 1, name: 0, sent: 2, opens: 3, clicks: 4, unsubscribes: 5 });
  const r = normalizeEmails([["Nowość", "2026-03-02", "1 000", "35%", "40", "2"], ["Pusty", "", "10", "1", "1", "0"]], map);
  assert.equal(r.skipped, 1);
  assert.deepEqual(r.rows[0], { sent_at: "2026-03-02", name: "Nowość", sent: 1000, opens: 350, clicks: 40, unsubscribes: 2 });
});

test("kwota kategorii: tylko wskaźniki lepsze w najlepszym okresie, nigdy mniej niż najlepsza pojedyncza dźwignia", async () => {
  const { categoryValue } = await import("../src/lib/money-map.ts");
  const cur = sumEmail(days(28), "2026-01-01", "2026-01-28");
  const base = emailMetricsOf(cur);
  // otwarcia lepsze w najlepszym okresie, wysyłki/mies. „gorsze” (okno 14 dni) – nie mogą obniżyć kwoty
  const r = emailLevers({ current: cur, bench: { e_open: { value: 0.4, source: "x" }, e_freq: { value: base.e_freq! * 0.8, source: "x" } }, econ: E, th: { minClicks: 1, minOrders: 1 } });
  const eng = { ranking: { levers: [], base: {}, budget: 0, profitNow: null }, econ: E, email: { ranking: r } } as never;
  const open = r.levers.find((l) => l.key === "e_open")!.value!;
  assert.ok(Math.abs(categoryValue(eng, "email")! - open) < 1e-6);
});
