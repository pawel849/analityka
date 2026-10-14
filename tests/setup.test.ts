import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOG_BY_KIND } from "../src/lib/catalog.ts";
import { analyze } from "../src/lib/analysis.ts";
import { MODELS, ROLES, SOURCES, adMatches, buildSetupGraph, hostOf, parseAdsMatch, pathOf, utmLink, type SetupState } from "../src/lib/setup.ts";

test("przewodnik: wszystkie rodzaje węzłów istnieją w katalogu", () => {
  for (const s of SOURCES) assert.ok(CATALOG_BY_KIND[s.kind], s.kind);
  for (const r of ROLES) assert.ok(CATALOG_BY_KIND[r.kind], r.kind);
  for (const k of ["form_submit", "purchase"]) assert.ok(CATALOG_BY_KIND[k], k);
  assert.ok(MODELS.every((m) => m.pages.every(([, role]) => ROLES.some((r) => r.value === role))));
});

test("przewodnik: płatne i organiczne źródła się nie mieszają", () => {
  for (const paid of SOURCES.filter((s) => s.utmSource && s.paid)) {
    for (const other of SOURCES.filter((s) => s.id !== paid.id)) {
      const tokens = other.match.split(",");
      assert.ok(!tokens.some((t) => paid.utmSource!.includes(t)), `${other.id} łapie ${paid.utmSource}`);
    }
  }
});

test("przewodnik: adresy i linki UTM", () => {
  assert.equal(pathOf("https://www.klient.pl/zapis/"), "/zapis");
  assert.equal(pathOf("klient.pl"), "/");
  assert.equal(pathOf("/oferta"), "/oferta");
  assert.equal(pathOf("https://sklep.pl/zamowienie-otrzymane/*"), "/zamowienie-otrzymane/*");
  assert.equal(hostOf("https://www.klient.pl/zapis"), "klient.pl");
  const ig = SOURCES.find((s) => s.id === "instagram")!;
  assert.equal(utmLink("https://a.pl/zapis", ig, "jesien"), "https://a.pl/zapis?utm_source=instagram.com&utm_medium=social&utm_campaign=jesien");
  assert.equal(utmLink("https://a.pl/zapis?x=1#f", ig), "https://a.pl/zapis?x=1&utm_source=instagram.com&utm_medium=social#f");
});

test("przewodnik: mapa z odpowiedzi liczy ruch, zapisy i zakupy", () => {
  const s: SetupState = {
    sources: ["meta_ads", "instagram"],
    campaignHint: "webinar",
    pages: [
      { id: "a", name: "Zapis", url: "https://a.pl/zapis", role: "lead" },
      { id: "b", name: "Oferta", url: "https://a.pl/oferta", role: "page" },
      { id: "c", name: "Dziękujemy", url: "https://a.pl/dzieki", role: "thankyou_purchase" },
    ],
  };
  const g = buildSetupGraph(s);
  assert.equal(g.nodes.length, 2 + 3 + 2);
  const meta = g.nodes.find((n) => n.id === "s_meta_ads")!;
  assert.equal(meta.data.adsMatch, "meta:webinar");
  const ev = (visitor: string, type: string, path: string, utm = "", value: number | null = null, ts = 0) => ({
    id: `${visitor}${type}${path}${ts}`, ts, type, name: "", visitor_id: visitor, url: `https://a.pl${path}`, path, referrer: "",
    utm_source: utm, utm_medium: "", utm_campaign: "", utm_content: "", utm_term: "", country: "", element: "", value, scroll: null,
  });
  const events = [
    ev("v1", "pageview", "/zapis", "ads_meta", null, 1),
    ev("v1", "form_submit", "/zapis", "ads_meta", null, 2),
    ev("v1", "pageview", "/oferta", "ads_meta", null, 3),
    ev("v1", "pageview", "/dzieki", "ads_meta", null, 4),
    ev("v1", "purchase", "", "", 297, 5),
    ev("v2", "pageview", "/zapis", "instagram.com", null, 1),
  ];
  const r = analyze(g.nodes.map((n) => ({ id: n.id, data: n.data })), g.edges.map((e) => ({ id: e.id, source: e.source, target: e.target })), events, []);
  assert.equal(r.nodes["s_meta_ads"].people, 1);
  assert.equal(r.nodes["s_instagram"].people, 1);
  assert.equal(r.nodes["p_a"].people, 2);
  assert.equal(r.nodes["a_a"].people, 1);
  assert.equal(r.nodes["a_c"].people, 1);
  assert.equal(r.totals.revenue, 297);
});

test("koszty z importu: prefiks platformy i gwiazdka", () => {
  const t = parseAdsMatch("meta:*");
  assert.ok(adMatches(t, "meta_api", "Cokolwiek | A | B"));
  assert.ok(!adMatches(t, "google_ads", "Cokolwiek | A | B"));
  const w = parseAdsMatch("google:Webinar, zima");
  assert.ok(adMatches(w, "google_ads", "Webinar jesień | x | y"));
  assert.ok(!adMatches(w, "meta", "Webinar jesień | x | y"));
  assert.ok(adMatches(w, "meta", "Kampania ZIMA | x | y"));
  assert.ok(adMatches(parseAdsMatch("[SPRZEDAŻ]"), "meta", "[sprzedaz] kurs | a | b"));
});
