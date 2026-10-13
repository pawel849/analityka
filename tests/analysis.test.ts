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
    { id: "e2", source: "a", target: "b", data: { connection: "indirect" as const } },
    { id: "e3", source: "a", target: "b" },
    { id: "e4", source: "a", target: "l" },
    { id: "e5", source: "a", target: "b", data: { connection: "none" as const } },
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
  // bezpośrednio: po opt-inie najpierw jest lead, więc opt-in → podziękowanie = 0, opt-in → lead = 4
  assert.equal(r.edges.e3.people, 0);
  assert.equal(r.edges.e4.people, 4);
  assert.equal(r.edges.e5.rate, null);
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

test("multi-URL, filters, goals", () => {
  const nodes = [
    {
      id: "p",
      data: {
        kind: "sales", category: "page" as const, label: "Oferta", url: "/a", urls: ["/b"],
        filters: [{ key: "utm_campaign", op: "eq" as const, value: "jesien" }],
        goal: true, goalValue: 10,
      },
    },
    { id: "q", data: { kind: "landing", category: "page" as const, label: "LP", url: "/c", filters: [{ key: "param:ref", op: "eq" as const, value: "x" }] } },
  ];
  const events: TrackedEvent[] = [
    ev({ visitor_id: "1", path: "/a", url: "https://x.pl/a", utm_campaign: "jesien" }),
    ev({ visitor_id: "2", path: "/b", url: "https://x.pl/b", utm_campaign: "JESIEN" }),
    ev({ visitor_id: "3", path: "/b", url: "https://x.pl/b", utm_campaign: "lato" }),
    ev({ visitor_id: "4", path: "/c", url: "https://x.pl/c?ref=x" }),
    ev({ visitor_id: "5", path: "/c", url: "https://x.pl/c?ref=y" }),
  ];
  const r = analyze(nodes, [], events, []);
  assert.equal(r.nodes.p.people, 2);
  assert.equal(r.nodes.p.goalValue, 20);
  assert.equal(r.nodes.q.people, 1);
  assert.equal(r.totals.goals, 2);
  assert.equal(r.totals.goal_value, 20);
});

test("forecast for range", async () => {
  const { forecastForRange } = await import("../src/lib/forecast.ts");
  assert.equal(forecastForRange({ period: "day", people: 10 }, "2026-10-01", "2026-10-07"), 70);
  assert.equal(forecastForRange({ period: "week", people: 70 }, "2026-10-01", "2026-10-14"), 140);
  assert.equal(forecastForRange(undefined, "2026-10-01", "2026-10-07"), null);
});

test("funnel mode restricts to people arriving via arrows", () => {
  const nodes = [
    { id: "s", data: { kind: "meta_ads", category: "source" as const, label: "Meta", sourceMatch: "facebook" } },
    { id: "a", data: { kind: "optin", category: "page" as const, label: "Opt-in", url: "/zapis" } },
    { id: "b", data: { kind: "thankyou", category: "page" as const, label: "Dzięki", url: "/dzieki" } },
  ];
  const edges = [
    { id: "e1", source: "s", target: "a" },
    { id: "e2", source: "a", target: "b" },
  ];
  const events: TrackedEvent[] = [
    ev({ visitor_id: "1", ts: 1, path: "/zapis", utm_source: "facebook" }),
    ev({ visitor_id: "1", ts: 2, path: "/dzieki", utm_source: "facebook" }),
    ev({ visitor_id: "2", ts: 1, path: "/zapis" }),
    ev({ visitor_id: "2", ts: 2, path: "/dzieki" }),
    ev({ visitor_id: "3", ts: 1, path: "/dzieki" }),
  ];
  const traffic = analyze(nodes, edges, events, []);
  assert.equal(traffic.nodes.a.people, 2);
  assert.equal(traffic.nodes.b.people, 3);
  const funnel = analyze(nodes, edges, events, [], { mode: "funnel" });
  assert.equal(funnel.nodes.s.people, 1);
  assert.equal(funnel.nodes.a.people, 1);
  assert.equal(funnel.nodes.b.people, 1);
  assert.equal(funnel.edges.e2.people, 1);
});

test("wildcard source and all pages", () => {
  const nodes = [
    { id: "s", data: { kind: "source_custom", category: "source" as const, label: "Wszystkie", sourceMatch: "*" } },
    { id: "p", data: { kind: "page_custom", category: "page" as const, label: "Wszystkie strony", url: "/*" } },
  ];
  const events: TrackedEvent[] = [
    ev({ visitor_id: "1", path: "/a" }),
    ev({ visitor_id: "2", path: "/b/c", utm_source: "google" }),
  ];
  const r = analyze(nodes, [], events, []);
  assert.equal(r.nodes.s.people, 2);
  assert.equal(r.nodes.p.people, 2);
});

test("webhook parsing", async () => {
  const { parseHook } = await import("../src/lib/webhook.ts");
  const stripe = parseHook(
    { type: "checkout.session.completed", data: { object: { amount_total: 29700, customer_details: { email: "Jan@Firma.pl" } } } },
    new URLSearchParams(),
  );
  assert.deepEqual([stripe?.type, stripe?.value, stripe?.email], ["purchase", 297, "jan@firma.pl"]);
  assert.equal(parseHook({ type: "customer.created" }, new URLSearchParams()), null);
  const ml = parseHook({ events: [{ data: { subscriber: { email: "a@b.pl" } } }] }, new URLSearchParams("type=lead"));
  assert.deepEqual([ml?.type, ml?.email], ["lead", "a@b.pl"]);
  const zap = parseHook({ email: "x@y.com", amount: "97,50" }, new URLSearchParams("type=purchase"));
  assert.deepEqual([zap?.type, zap?.value], ["purchase", 97.5]);
});

test("previous range and delta", async () => {
  const { previousRange, delta } = await import("../src/lib/forecast.ts");
  assert.deepEqual(previousRange("2026-10-08", "2026-10-14"), ["2026-10-01", "2026-10-07"]);
  assert.deepEqual(previousRange("2026-03-01", "2026-03-01"), ["2026-02-28", "2026-02-28"]);
  assert.equal(delta(120, 100), 0.2);
  assert.equal(delta(5, 0), null);
});
