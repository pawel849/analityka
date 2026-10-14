import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { metaInsightToAdRow, normalizeAccountId, fetchMetaInsights } from "../src/lib/sync/meta.ts";
import { hashEmailSync, normalizeSiteUrl, wooOrderToRow, fetchWooPage } from "../src/lib/sync/woo.ts";
import { seal, unseal } from "../src/lib/secret-box.ts";

test("Meta: wiersz insights → wiersz reklamy, bez podwójnego liczenia akcji", () => {
  const r = metaInsightToAdRow({
    date_start: "2026-10-01",
    date_stop: "2026-10-01",
    campaign_name: "Sprzedaż",
    adset_name: "Zimni",
    ad_name: "Wideo 1",
    spend: "123.45",
    impressions: "1000",
    reach: "800",
    inline_link_clicks: "40",
    actions: [
      { action_type: "video_view", value: "300" },
      { action_type: "omni_purchase", value: "3" },
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "3" },
      { action_type: "lead", value: "7" },
      { action_type: "landing_page_view", value: "35" },
    ],
    action_values: [{ action_type: "omni_purchase", value: "891" }],
    video_thruplay_watched_actions: [{ action_type: "video_view", value: "90" }],
  });
  assert.equal(r.spend, 123.45);
  assert.equal(r.clicks, 40);
  assert.equal(r.video_3s, 300);
  assert.equal(r.thruplay, 90);
  assert.equal(r.purchases, 3);
  assert.equal(r.purchase_value, 891);
  assert.equal(r.registrations, 7);
  assert.equal(r.landing_views, 35);
  assert.equal(r.period_end, "2026-10-01");
});

test("Meta: ID konta i stronicowanie", async () => {
  assert.equal(normalizeAccountId("act_1234567"), "1234567");
  assert.throws(() => normalizeAccountId("abc"));
  const calls: string[] = [];
  const fake = (async (url: string) => {
    calls.push(url);
    const page2 = url.includes("after=x");
    return new Response(JSON.stringify({ data: [{ date_start: "2026-10-01", date_stop: "2026-10-01", actions: [{ action_type: page2 ? "lead" : "video_view", value: "1" }] }], paging: page2 ? {} : { next: "https://graph.example/next?after=x" } }), { status: 200 });
  }) as typeof fetch;
  const res = await fetchMetaInsights({ accountId: "123456", token: "t", version: "v26.0", since: "2026-10-01", until: "2026-10-02" }, fake);
  assert.equal(res.rows.length, 2);
  assert.deepEqual(res.actionTypes, ["lead", "video_view"]);
  assert.match(calls[0], /act_123456\/insights\?/);
  assert.match(decodeURIComponent(calls[0]), /time_range=\{"since":"2026-10-01","until":"2026-10-02"\}/);
  const err = (async () => new Response(JSON.stringify({ error: { message: "Invalid OAuth access token", code: 190 } }), { status: 400 })) as unknown as typeof fetch;
  await assert.rejects(fetchMetaInsights({ accountId: "123456", token: "t", version: "v26.0", since: "a", until: "b" }, err), /Invalid OAuth access token \(kod 190\)/);
});

test("WooCommerce: zamówienie → wiersz, statusy i skrót e-maila jak w imporcie CSV", () => {
  const o = {
    id: 55,
    number: "1055",
    status: "completed",
    date_created_gmt: "2026-10-01T10:00:00",
    date_paid_gmt: "2026-10-01T10:05:00",
    total: "297.00",
    billing: { email: " Jan@Example.com " },
    line_items: [{ name: "Kurs", quantity: 1, total: "241.46", total_tax: "55.54" }],
    coupon_lines: [{ code: "JESIEN" }],
  };
  const r = wooOrderToRow(o, ["processing", "completed"])!;
  assert.equal(r.order_ref, "1055");
  assert.equal(r.ts, "2026-10-01T10:05:00.000Z");
  assert.equal(r.gross, 297);
  assert.deepEqual(r.products, [{ name: "Kurs", price: 297 }]);
  assert.equal(r.coupon, "JESIEN");
  assert.equal(r.customer, createHash("sha256").update("jan@example.com").digest("hex").slice(0, 16));
  assert.equal(hashEmailSync(""), "");
  assert.equal(wooOrderToRow({ ...o, status: "refunded" }, ["completed"]), null);
});

test("WooCommerce: adres sklepu i ponowna próba kluczami w adresie po 401", async () => {
  assert.equal(normalizeSiteUrl("sklep.pl/"), "https://sklep.pl");
  assert.throws(() => normalizeSiteUrl("http://sklep.pl"));
  const calls: { url: string; auth: string | null }[] = [];
  const fake = (async (url: string, init?: RequestInit) => {
    const auth = new Headers(init?.headers).get("authorization");
    calls.push({ url, auth });
    if (auth) return new Response(JSON.stringify({ code: "woocommerce_rest_cannot_view", message: "Brak uprawnień" }), { status: 401 });
    return new Response(JSON.stringify([{ id: 1, status: "completed" }]), { status: 200, headers: { "X-WP-TotalPages": "3" } });
  }) as typeof fetch;
  const res = await fetchWooPage({ site: "https://sklep.pl", key: "ck", secret: "cs", page: 1, after: "2026-01-01T00:00:00" }, fake);
  assert.equal(res.orders.length, 1);
  assert.equal(res.totalPages, 3);
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /consumer_key=ck&consumer_secret=cs/);
  assert.match(calls[0].url, /\/wp-json\/wc\/v3\/orders\?.*after=2026-01-01T00%3A00%3A00/);
});

test("Szyfrowanie kluczy: zapis i odczyt", () => {
  process.env.AUTH_SECRET = "test-secret";
  const s = seal("EAAG-token");
  assert.notEqual(s, "EAAG-token");
  assert.equal(unseal(s), "EAAG-token");
  process.env.AUTH_SECRET = "inny";
  assert.throws(() => unseal(s), /AUTH_SECRET/);
});
