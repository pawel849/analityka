import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, matchesPage, type TrackedEvent } from "../src/lib/analysis.ts";
import { evaluate } from "../src/lib/formula.ts";

let id = 0;
const ev = (p: Partial<TrackedEvent>): TrackedEvent => ({
  id: ++id,
  ts: 0,
  type: "pageview",
  name: "",
  visitor_id: "v",
  url: "",
  path: "/",
  referrer: "",
  utm_source: "",
  element: "",
  value: null,
  scroll: null,
  ...p,
});

test("matchesPage", () => {
  assert.equal(matchesPage("/oferta", { url: "https://x.pl/oferta/?a=1", path: "/oferta/" }), true);
  assert.equal(matchesPage("/oferta", { url: "https://x.pl/oferta-2", path: "/oferta-2" }), false);
  assert.equal(matchesPage("/kurs/*", { url: "https://x.pl/kurs/l1", path: "/kurs/l1" }), true);
  assert.equal(matchesPage("/", { url: "https://x.pl/a", path: "/a" }), false);
  assert.equal(matchesPage("x.pl/dzieki", { url: "https://x.pl/dzieki", path: "/dzieki" }), true);
});

test("flow, conversion, metrics", () => {
  const nodes = [
    { id: "s", data: { kind: "meta_ads", category: "source" as const, label: "Meta", sourceMatch: "facebook" } },
    { id: "a", data: { kind: "optin", category: "page" as const, label: "Opt-in", url: "/zapis" } },
    { id: "b", data: { kind: "thankyou", category: "page" as const, label: "Dzięki", url: "/dzieki" } },
    { id: "l", data: { kind: "lead", category: "action" as const, label: "Lead", eventType: "lead" } },
    { id: "p", data: { kind: "purchase", category: "action" as const, label: "Zakup", eventType: "purchase" } },
  ];
  const edges = [
    { id: "e1", source: "s", target: "a" },
    { id: "e2", source: "a", target: "b" },
  ];
  const events: TrackedEvent[] = [];
  for (let i = 0; i < 10; i++) {
    events.push(ev({ visitor_id: `v${i}`, ts: 1, path: "/zapis", url: "https://x.pl/zapis", utm_source: i < 6 ? "facebook" : "" }));
    events.push(ev({ visitor_id: `v${i}`, ts: 2, type: "scroll", scroll: i < 5 ? 75 : 25, path: "/zapis", url: "https://x.pl/zapis" }));
  }
  for (let i = 0; i < 4; i++) {
    events.push(ev({ visitor_id: `v${i}`, ts: 3, type: "click", path: "/zapis", url: "https://x.pl/zapis" }));
    events.push(ev({ visitor_id: `v${i}`, ts: 4, type: "lead" }));
    events.push(ev({ visitor_id: `v${i}`, ts: 5, path: "/dzieki", url: "https://x.pl/dzieki" }));
  }
  events.push(ev({ visitor_id: "v0", ts: 6, type: "purchase", value: 500 }));
  const manual = [
    { node_id: "s", metric: "spend", value: 250 },
    { node_id: "s", metric: "impressions", value: 1000 },
    { node_id: "s", metric: "video_3s", value: 300 },
    { node_id: "s", metric: "clicks", value: 20 },
  ];
  const r = analyze(nodes, edges, events, manual);
  assert.equal(r.nodes.s.people, 6);
  assert.equal(r.nodes.a.people, 10);
  assert.equal(r.edges.e1.people, 6);
  assert.equal(r.edges.e2.people, 4);
  assert.equal(r.edges.e2.rate, 0.4);
  assert.equal(r.nodes.a.ctrPage, 0.4);
  assert.equal(r.nodes.a.scroll?.p75, 0.5);
  assert.equal(r.totals.leads, 4);
  assert.equal(r.totals.revenue, 500);
  assert.equal(r.totals.roas, 2);
  assert.equal(r.totals.cpl, 62.5);
  assert.equal(r.totals.hook_rate, 0.3);
  assert.equal(r.totals.ctr_ads, 0.02);
});

test("formula", () => {
  const ctx = {
    vars: { revenue: 1000, spend: 250, zero: 0, nil: null },
    node: (l: string, f: string) => (l === "Opt-in" && f === "people" ? 10 : null),
  };
  assert.equal(evaluate("revenue / spend", ctx), 4);
  assert.equal(evaluate("(revenue - spend) / spend * 100", ctx), 300);
  assert.equal(evaluate("revenue / zero", ctx), null);
  assert.equal(evaluate("nil + 1", ctx), null);
  assert.equal(evaluate('node("Opt-in", "people") * 2', ctx), 20);
  assert.equal(evaluate("round(10 / 3, 2)", ctx), 3.33);
  assert.throws(() => evaluate("foo + 1", ctx), /Nieznana zmienna/);
  assert.throws(() => evaluate("1 +", ctx), /Niekompletny/);
});
