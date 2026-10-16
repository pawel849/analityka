import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_TEST_SETTINGS, adName, attribute, budgetPerVariant, derive, fatigue, mergeTestSettings, roundHints, scaling, suggestVariant, variantLink, verdictDate,
  type VariantTotals,
} from "../src/lib/ad-tests.ts";

const S = DEFAULT_TEST_SETTINGS;
const T = (p: Partial<VariantTotals>): VariantTotals => ({
  spend: 0, impressions: 0, linkClicks: 0, video3s: 0, thruplay: 0, metaPurchases: 0, metaValue: 0, visits: 0, orders: 0, mainOrders: 0, revenue: 0, ...p,
});
const V = (letter: string, p: Partial<VariantTotals>) => {
  const totals = T(p);
  return { letter, totals, d: derive(totals, S) };
};

test("ustawienia i nazwy reklam", () => {
  assert.equal(budgetPerVariant(S), 530);
  assert.equal(mergeTestSettings({ cacMax: 200, budgetPerVariant: 0 }).budgetPerVariant, null);
  assert.equal(budgetPerVariant(mergeTestSettings({ cacMax: 200 })), 400);
  assert.equal(adName(S.namingPattern, "Amerykański coach", 2, "B"), "AMERYKANSKI_COACH_R2_B");
  assert.equal(variantLink("https://a.pl/vsl", "X_R1_A"), "https://a.pl/vsl?utm_source=ads_meta&utm_medium=paid&utm_content=X_R1_A");
  assert.equal(verdictDate("2026-10-01", 100, S), "2026-10-07");
});

test("podpowiedzi 6.1 w kolejności specyfikacji", () => {
  const a = V("A", { spend: 600, impressions: 10000, linkClicks: 150, mainOrders: 3 }); // CAC 200 – najlepszy
  const b = V("B", { spend: 600, impressions: 10000, linkClicks: 200, mainOrders: 3 - 0 }); // CAC 200 – też najlepszy
  const c = V("C", { spend: 550, impressions: 10000, linkClicks: 100, mainOrders: 0 });
  const d = V("D", { spend: 300, impressions: 5000, linkClicks: 50, mainOrders: 1 });
  const e = V("E", { spend: 900, impressions: 10000, linkClicks: 100, mainOrders: 2 }); // CAC 450 > 400
  const f = V("F", { spend: 690, impressions: 10000, linkClicks: 300, mainOrders: 3 }); // CAC 230 → +15% do najlepszego
  const g = V("G", { spend: 900, impressions: 10000, linkClicks: 100, mainOrders: 3 }); // CAC 300 → +50%
  const round = [a, c, d, e, f, g];
  assert.equal(suggestVariant(d, round, S).code, "w_toku");
  assert.equal(suggestVariant(c, round, S).code, "wylacz");
  assert.equal(suggestVariant(e, round, S).code, "przegrywa");
  assert.equal(suggestVariant(a, round, S).code, "zwyciezca");
  const fs = suggestVariant(f, round, S);
  assert.equal(fs.code, "remis");
  assert.match(fs.label, /zostaje F/);
  assert.equal(suggestVariant(g, round, S).code, "przegrywa");
  const hi = V("H", { spend: 600, mainOrders: 2 }); // CAC 300 > cacMax 265, jedyny
  assert.equal(suggestVariant(hi, [hi], S).code, "najlepszy_ponad_cac");
  assert.equal(b.d.cac, 200);
});

test("podpowiedzi rundy 6.2", () => {
  const vs = [
    { ...V("A", { spend: 600, impressions: 10000, linkClicks: 200, visits: 120 }), metaSource: "api" as const },
    { ...V("B", { spend: 600, impressions: 10000, linkClicks: 250, visits: 0 }), metaSource: "api" as const },
  ];
  const h = roundHints(vs, S, { accountCtr: 0.015, daysRunning: 5, unattributedShare: 0.4, productMatchSet: false });
  assert.ok(h.some((x) => x.includes("problem na stronie")));
  assert.ok(h.some((x) => x.includes("Wariant B") && x.includes("UTM")));
  assert.ok(h.some((x) => x.includes("40%")));
  assert.ok(h.some((x) => x.includes("produktu głównego")));
  const z = roundHints([{ ...V("A", { spend: 50, impressions: 900 }), metaSource: "api" }], S, { accountCtr: null, daysRunning: 2, unattributedShare: null, productMatchSet: true });
  assert.ok(z[0].includes("0 kliknięć"));
});

test("atrybucja zakupu po utm_content", () => {
  const day = 86400_000;
  const touches = [{ ts: 1 * day, content: "X_R1_A" }, { ts: 5 * day, content: "X_R1_B" }, { ts: 20 * day, content: "X_R1_C" }];
  assert.equal(attribute(6 * day, "", touches, 7), "X_R1_B");
  assert.equal(attribute(25 * day, "", touches, 7), "X_R1_C");
  assert.equal(attribute(40 * day, "", touches, 7), null, "poza oknem");
  assert.equal(attribute(6 * day, "WŁASNY", touches, 7), "WŁASNY");
});

test("zmęczenie i skalowanie", () => {
  const days = [];
  for (let i = 0; i < 14; i++) {
    const day = new Date(Date.UTC(2026, 9, 1 + i)).toISOString().slice(0, 10);
    days.push({ day, spend: 100, impressions: 10000, linkClicks: i < 7 ? 200 : 140, mainOrders: i % 2 ? 1 : 0 });
  }
  const f = fatigue(days, S);
  assert.equal(f.weeks.length, 2);
  assert.match(f.alarm!, /CTR spadł o 30%/);
  assert.match(scaling(days, S, "2026-10-14")!, /zwiększ budżet o 25%/);
  assert.equal(scaling(days.slice(0, 3), S, "2026-10-14"), null);
});
