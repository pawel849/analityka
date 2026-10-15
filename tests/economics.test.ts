import { test } from "node:test";
import assert from "node:assert/strict";
import { detectEvents, monthly, periodStats, prepare, shapley, spendBetween, type EconOrder } from "../src/lib/economics.ts";
import { DEFAULT_SETTINGS } from "../src/lib/settings.ts";

const S = { ...DEFAULT_SETTINGS, vat: 23 };
const t = (d: string) => Date.parse(`${d}T12:00:00Z`);

test("spend proration", () => {
  const ads = [{ start: "2026-01-01", end: "2026-01-31", campaign: "A", spend: 3100 }];
  assert.equal(Math.round(spendBetween(ads, "2026-01-01", "2026-01-10")), 1000);
  assert.equal(spendBetween(ads, "2026-02-01", "2026-02-10"), 0);
});

test("cohort CAC, LTV maturity, bump, repeat", () => {
  const orders: EconOrder[] = [
    { ref: "1", ts: t("2026-01-05"), customer: "a", gross: 344, products: [{ name: "Kurs X", price: 297 }, { name: "Ebook", price: 47 }] },
    { ref: "2", ts: t("2026-01-10"), customer: "b", gross: 297, products: [{ name: "Kurs X", price: 297 }] },
    { ref: "3", ts: t("2026-02-01"), customer: "a", gross: 500, products: [{ name: "Warsztat", price: 500 }] },
    { ref: "4", ts: t("2026-06-01"), customer: "z", gross: 10, products: [{ name: "Ebook", price: 10 }] },
  ];
  const p = prepare(orders, S);
  const ads = [{ start: "2026-01-01", end: "2026-01-31", campaign: "A", spend: 1000 }];
  const st = periodStats(p, ads, S, { name: "I", from: "2026-01-01", to: "2026-01-31" });
  assert.equal(st.newMainCustomers, 2);
  assert.equal(st.cac, 500);
  const l90 = st.ltv.find((l) => l.days === 90)!;
  assert.equal(l90.matured, 2);
  assert.equal(l90.gross, (344 + 500 + 297) / 2);
  assert.equal(st.ltv.find((l) => l.days === 365)!.gross, null); // okno niedojrzałe
  assert.equal(st.orderBumpRate, 0.5);
  assert.equal(st.repeatRate, 0.5);
  assert.equal(st.mainPriceMedian, 297);
  const months = monthly(p, ads, S, "2026-01-01", "2026-02-28");
  assert.equal(months.length, 2);
  assert.equal(months[0].gross, 641);
  assert.equal(months[0].newMainCustomers, 2);
  assert.equal(Math.round(months[0].byCategory["tani produkt"]), 47);
});

test("shapley sums to total", () => {
  const base = { ltv: [{ days: 90, gross: 0, net: 600, matured: 1 }] } as never;
  const a = { ...(base as object), cac: 200, ltv: [{ days: 90, gross: 0, net: 600, matured: 1 }] } as never;
  const b = { ...(base as object), cac: 400, ltv: [{ days: 90, gross: 0, net: 500, matured: 1 }] } as never;
  const r = shapley(a, b)!;
  assert.equal(Math.round(r.cacEffect + r.ltvEffect), Math.round(r.total));
  assert.equal(Math.round(r.from), 30000);
  assert.equal(Math.round(r.to), 12500);
  assert.ok(r.cacEffect < 0 && r.ltvEffect < 0);
});

test("detect price change and campaigns", () => {
  const orders: EconOrder[] = [
    { ref: "1", ts: t("2026-01-05"), customer: "a", gross: 797, products: [{ name: "Kurs", price: 797 }] },
    { ref: "2", ts: t("2026-02-05"), customer: "b", gross: 297, products: [{ name: "Kurs", price: 297 }] },
  ];
  const ev = detectEvents(prepare(orders, S), [
    { start: "2026-01-01", end: "2026-01-31", campaign: "Stara", spend: 100 },
    { start: "2026-02-01", end: "2026-02-28", campaign: "Nowa", spend: 100 },
  ], S);
  assert.ok(ev.some((e) => e.type === "cena" && e.title.includes("797 → 297")));
  assert.ok(ev.some((e) => e.title === "Koniec kampanii: Stara"));
  assert.ok(!ev.some((e) => e.title === "Koniec kampanii: Nowa"));
});

test("order bump: darmowe bonusy za 0 zł się nie liczą", () => {
  const orders: EconOrder[] = [
    { ref: "1", ts: t("2026-01-05"), customer: "a", gross: 797, products: [{ name: "Kurs Dykcja", price: 797 }, { name: "Bonus PDF", price: 0 }] },
    { ref: "2", ts: t("2026-01-06"), customer: "b", gross: 1297, products: [{ name: "Kurs Dykcja", price: 797 }, { name: "Bonus PDF", price: 0 }, { name: "Sztuka Prezentacji", price: 500 }] },
  ];
  const st = periodStats(prepare(orders, S), [], S, { name: "I", from: "2026-01-01", to: "2026-01-31" });
  assert.equal(st.orderBumpRate, 0.5);
});

test("zawężenie do produktu: tylko pasujące zamówienia, LTV z późniejszych zakupów", () => {
  const orders: EconOrder[] = [
    { ref: "1", ts: t("2026-01-05"), customer: "a", gross: 797, products: [{ name: "Dykcja dla każdego", price: 797 }] },
    { ref: "2", ts: t("2026-01-06"), customer: "b", gross: 47, products: [{ name: "Minikurs oddechu", price: 47 }] },
    { ref: "3", ts: t("2026-01-20"), customer: "a", gross: 200, products: [{ name: "Warsztat", price: 200 }] },
    { ref: "4", ts: t("2026-06-01"), customer: "z", gross: 1, products: [{ name: "X", price: 1 }] },
  ];
  const match = (n: string) => n.toLowerCase().includes("dykcja dla");
  const s2 = { ...S, mainCategory: "produkt: dykcja" };
  const p = prepare(orders, s2, match);
  const st = periodStats(p, [{ start: "2026-01-01", end: "2026-01-31", campaign: "VSL", spend: 300 }], s2, { name: "I", from: "2026-01-01", to: "2026-01-31" }, true);
  assert.equal(st.newMainCustomers, 1, "minikurs nie jest produktem głównym, mimo reguły „kurs”");
  assert.equal(st.mainPriceMedian, 797);
  assert.equal(st.gross, 797, "przychód tylko z zamówień z produktem");
  assert.equal(st.cac, 300);
  assert.equal(st.ltv.find((l) => l.days === 30)!.gross, 997, "LTV obejmuje późniejszy warsztat");
  const m = monthly(p, [], s2, "2026-01-01", "2026-01-31", true);
  assert.equal(m[0].gross, 797);
});

import { mergeSettings } from "../src/lib/settings.ts";
test("zakres Ekonomii w ustawieniach: domyślnie pusty, czyszczony", () => {
  assert.deepEqual(mergeSettings({}).economicsScope, { campaigns: [], products: [] });
  assert.deepEqual(mergeSettings({ economicsScope: { campaigns: [" A ", "A", 5, ""], products: "x" } }).economicsScope, { campaigns: ["A"], products: [] });
});
