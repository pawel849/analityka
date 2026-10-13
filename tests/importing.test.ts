import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, parseNumber, parseDate, fold } from "../src/lib/csv.ts";
import { autoMap, normalizeAds, normalizeOrders } from "../src/lib/importing.ts";
import { applyRules, DEFAULT_SETTINGS } from "../src/lib/settings.ts";

test("csv parser", () => {
  const p = parseCsv('﻿a;b;c\n1;"x;y";"he said ""hi"""\n\n2;"multi\nline";3\n');
  assert.equal(p.delimiter, ";");
  assert.deepEqual(p.headers, ["a", "b", "c"]);
  assert.deepEqual(p.rows[0], ["1", "x;y", 'he said "hi"']);
  assert.deepEqual(p.rows[1], ["2", "multi\nline", "3"]);
  assert.equal(parseCsv("a,b\r\n1,2\r\n").rows[0][1], "2");
});

test("numbers and dates", () => {
  assert.equal(parseNumber("1 234,56 zł"), 1234.56);
  assert.equal(parseNumber("1,234.56"), 1234.56);
  assert.equal(parseNumber("297,00"), 297);
  assert.equal(parseNumber("12.5%"), 12.5);
  assert.equal(parseNumber("1.234,5"), 1234.5);
  assert.equal(parseNumber(""), null);
  assert.equal(parseDate("2026-03-01")?.slice(0, 10), "2026-03-01");
  assert.equal(parseDate("05.07.2025 14:30")?.slice(0, 16), "2025-07-05T14:30");
  assert.equal(parseDate("12/31/2025")?.slice(0, 10), "2025-12-31");
  assert.equal(fold("  Łódź  Zażółć "), "lodz zazolc");
});

test("auto map meta-like headers", () => {
  const m = autoMap("ads", ["Nazwa kampanii", "Nazwa reklamy", "Początek raportowania", "Koniec raportowania", "Wydana kwota (PLN)", "Wyświetlenia", "Kliknięcia linku"]);
  assert.deepEqual([m.campaign, m.ad, m.period_start, m.period_end, m.spend, m.impressions, m.clicks], [0, 1, 2, 3, 4, 5, 6]);
  const o = autoMap("orders", ["Order Number", "Order Date", "Billing Email", "Order Total", "Item Name", "Status"]);
  assert.deepEqual([o.order_ref, o.ts, o.email, o.gross, o.products, o.status], [0, 1, 2, 3, 4, 5]);
});

test("normalize ads and orders", () => {
  const ads = normalizeAds(
    [
      ["Kampania A", "2026-01-01", "2026-01-31", "1 000,50"],
      ["", "", "", "5000"],
    ],
    { campaign: 0, period_start: 1, period_end: 2, spend: 3 },
  );
  assert.equal(ads.rows.length, 1);
  assert.equal(ads.rows[0].spend, 1000.5);
  assert.equal(ads.skipped, 1);
  const orders = normalizeOrders(
    [
      ["101", "2026-01-05", "A@X.pl", "", "Kurs X", "297", "completed"],
      ["101", "2026-01-05", "a@x.pl", "", "Ebook Y", "47", "completed"],
      ["102", "2026-01-06", "b@x.pl", "797", "Kurs X", "", "cancelled"],
    ],
    { order_ref: 0, ts: 1, email: 2, gross: 3, products: 4, item_price: 5, status: 6 },
    { paidStatuses: "completed,processing", productSeparator: "," },
  );
  assert.equal(orders.rows.length, 1);
  assert.equal(orders.rows[0].gross, 344);
  assert.equal(orders.rows[0].products.length, 2);
  assert.equal(orders.rows[0].email, "a@x.pl");
  assert.equal(orders.skipped, 1);
});

test("rules", () => {
  const r = DEFAULT_SETTINGS.productRules;
  assert.equal(applyRules("Dzień otwarty – warsztaty", r, "inne"), "warsztat");
  assert.equal(applyRules("KURS online", r, "inne"), "kurs");
  assert.equal(applyRules("Coś innego", r, "inne"), "inne");
  assert.equal(applyRules("[SPRZEDAŻ] kurs", DEFAULT_SETTINGS.campaignTypeRules, "?"), "sprzedaż");
  assert.equal(applyRules("abc", [{ pattern: "a(b", value: "x" }], "-"), "-");
});
