import { test } from "node:test";
import assert from "node:assert/strict";
import { applyGraphEdits, describeGraph, type Graph } from "../src/lib/graph-edit.ts";

const base = (): Graph => ({
  nodes: [
    { id: "a", type: "funnel", position: { x: 0, y: 0 }, data: { kind: "meta_ads", category: "source", label: "Meta" } as never },
    { id: "b", type: "funnel", position: { x: 260, y: 0 }, data: { kind: "optin", category: "page", label: "Zapis", url: "/zapis" } as never },
    { id: "t", type: "text", position: { x: 0, y: 300 }, data: { text: "opis" } as never },
  ],
  edges: [{ id: "e1", source: "a", target: "b" }],
});

test("edycja mapy: dodanie węzłów z ref i strzałek", () => {
  const { graph, ids } = applyGraphEdits(base(), {
    add_nodes: [{ ref: "lead", kind: "form_submit", label: "Zapis", page_url: "/zapis", goal: true, goal_name: "Lead" }, { ref: "ty", kind: "thankyou", url: "/dzieki" }],
    add_edges: [{ source: "b", target: "lead" }, { source: "lead", target: "ty", connection: "indirect" }, { source: "a", target: "b" }],
  });
  assert.equal(graph.nodes.length, 5);
  const lead = graph.nodes.find((n) => n.id === ids.lead)!;
  assert.equal(lead.data.eventType, "form_submit");
  assert.equal(lead.data.pageUrl, "/zapis");
  assert.equal(lead.position.x, 520);
  assert.equal(graph.edges.length, 3, "duplikat a→b pominięty");
  assert.deepEqual((graph.edges[2] as { data?: unknown }).data, { connection: "indirect" });
});

test("edycja mapy: zmiana, usuwanie, błędy bez częściowego zapisu", () => {
  const g0 = base();
  const { graph } = applyGraphEdits(g0, { update_nodes: [{ id: "b", url: "/zapis/*", checklist: ["Wkleić skrypt"] }], remove_nodes: ["a"] });
  assert.equal(graph.nodes.find((n) => n.id === "b")!.data.url, "/zapis/*");
  assert.equal(graph.nodes.find((n) => n.id === "b")!.data.checklist![0].text, "Wkleić skrypt");
  assert.equal(graph.edges.length, 0);
  assert.equal(g0.nodes.length, 3, "oryginał bez zmian");
  assert.throws(() => applyGraphEdits(g0, { add_nodes: [{ kind: "nie_ma" }] }), /Nieznany rodzaj/);
  assert.throws(() => applyGraphEdits(g0, { add_edges: [{ source: "a", target: "x" }] }), /nie ma węzła x/);
  const d = describeGraph(g0);
  assert.equal(d.nodes.length, 2);
  assert.equal(d.annotations, 1);
  assert.equal(d.nodes[1].url, "/zapis");
});
