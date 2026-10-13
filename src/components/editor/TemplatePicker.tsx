"use client";
import { useEffect, useState } from "react";
import { buildGraph, STRATEGY_TEMPLATES, type TemplateEdge, type TemplateNode } from "@/lib/templates";
import { api } from "../forms";

interface ExploreData {
  pages: { value: string; people: number }[];
  sources: { value: string; people: number }[];
  events: { value: string; people: number }[];
}

const EVENT_KIND: Record<string, string> = {
  click: "click",
  lead: "lead",
  form_submit: "form_submit",
  purchase: "purchase",
  add_to_cart: "add_to_cart",
  video_play: "video_play",
  booking: "booking_done",
};

type Graph = { nodes: TemplateNode[]; edges: TemplateEdge[] };

export function TemplatePicker({
  funnelId,
  range,
  onPick,
  onClose,
}: {
  funnelId: string;
  range: { from: string; to: string };
  onPick: (g: Graph) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"strategy" | "analysis">("strategy");
  const [data, setData] = useState<ExploreData | null>(null);
  const [page, setPage] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (tab !== "analysis" || data) return;
    api<ExploreData>(`/api/funnels/${funnelId}/explore?from=${range.from}&to=${range.to}`)
      .then((d) => {
        setData(d);
        setPage(d.pages[0]?.value ?? "");
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [tab, data, funnelId, range.from, range.to]);

  const topSources = (n: number) => (data?.sources ?? []).slice(0, n);

  const pageAnalysis = (): Graph => {
    const srcs = topSources(6);
    const evs = (data?.events ?? []).filter((e) => !e.value.startsWith("custom:") && EVENT_KIND[e.value]).slice(0, 6);
    return buildGraph(
      [
        ...srcs.map((s, i) => [`s${i}`, "source_custom", 0, i, { label: s.value, sourceMatch: s.value }] as [string, string, number, number, object]),
        ["page", "page_custom", 1, Math.max(0, Math.floor((srcs.length - 1) / 2)), { label: page, url: page }],
        ...evs.map((e, i) => [`a${i}`, EVENT_KIND[e.value], 2, i, { eventType: e.value, pageUrl: page }] as [string, string, number, number, object]),
      ],
      [...srcs.map((_, i) => [`s${i}`, "page"] as [string, string]), ...evs.map((_, i) => ["page", `a${i}`, "indirect"] as [string, string, "indirect"])],
    );
  };

  const journeyAnalysis = (): Graph =>
    buildGraph(
      [
        ["src", "source_custom", 0, 0, { label: "Wszystkie źródła", sourceMatch: "*" }],
        ["pages", "page_custom", 1, 0, { label: "Wszystkie strony", url: "/*" }],
        ["leads", "lead", 2, 0, { label: "Leady", goal: true, goalName: "Lead" }],
        ["buy", "purchase", 3, 0, { label: "Zakupy", goal: true, goalName: "Sprzedaż" }],
      ],
      [
        ["src", "pages"],
        ["pages", "leads", "indirect"],
        ["leads", "buy", "indirect"],
      ],
    );

  const sourceAnalysis = (): Graph => {
    const srcs = topSources(10);
    return buildGraph(
      [
        ...srcs.map((s, i) => [`s${i}`, "source_custom", 0, i, { label: s.value, sourceMatch: s.value }] as [string, string, number, number, object]),
        ["pages", "page_custom", 1, Math.max(0, Math.floor((srcs.length - 1) / 2)), { label: "Wszystkie strony", url: "/*" }],
      ],
      srcs.map((_, i) => [`s${i}`, "pages"] as [string, string]),
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Wybierz szablon">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 style={{ margin: 0 }}>Wybierz szablon</h2>
          <button className="btn small" onClick={onClose}>Zamknij</button>
        </div>
        <div className="side-tabs" style={{ marginTop: 12 }}>
          <button className={tab === "strategy" ? "on" : ""} onClick={() => setTab("strategy")}>Strategia</button>
          <button className={tab === "analysis" ? "on" : ""} onClick={() => setTab("analysis")}>Analiza danych</button>
        </div>

        {tab === "strategy" && (
          <div className="tpl-grid">
            {STRATEGY_TEMPLATES.map((t) => (
              <button key={t.key} className="tpl-card" onClick={() => onPick(t.build())}>
                <MiniMapPreview graph={t.build()} />
                <b>{t.name}</b>
                <span className="hint">{t.description}</span>
              </button>
            ))}
          </div>
        )}

        {tab === "analysis" && (
          <>
            {err && <div className="error">{err}</div>}
            {!data && !err && <p className="hint">Wczytuję dane projektu…</p>}
            {data && data.pages.length === 0 && (
              <p className="hint">Brak danych w wybranym zakresie dat – zainstaluj skrypt lub wygeneruj dane testowe.</p>
            )}
            {data && data.pages.length > 0 && (
              <div className="tpl-grid">
                <div className="tpl-card">
                  <b>Analiza strony</b>
                  <span className="hint">Źródła → wybrana strona → działania na tej stronie</span>
                  <select value={page} onChange={(e) => setPage(e.target.value)}>
                    {data.pages.map((p) => (
                      <option key={p.value} value={p.value}>{p.value} ({p.people})</option>
                    ))}
                  </select>
                  <button className="btn small primary" onClick={() => onPick(pageAnalysis())}>Wstaw</button>
                </div>
                <button className="tpl-card" onClick={() => onPick(journeyAnalysis())}>
                  <b>Analiza ścieżki</b>
                  <span className="hint">Wszystkie źródła → wszystkie strony → leady → zakupy</span>
                </button>
                <button className="tpl-card" onClick={() => onPick(sourceAnalysis())}>
                  <b>Analiza źródeł</b>
                  <span className="hint">Najważniejsze źródła ruchu na całą stronę ({Math.min(10, data.sources.length)})</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const CAT_COLOR: Record<string, string> = {
  source: "var(--cat-source)",
  page: "var(--cat-page)",
  action: "var(--cat-action)",
  offline: "var(--cat-offline)",
};

/** Uproszczony podgląd układu szablonu. */
function MiniMapPreview({ graph }: { graph: Graph }) {
  const xs = graph.nodes.map((n) => n.position.x);
  const ys = graph.nodes.map((n) => n.position.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX + 200;
  const h = Math.max(...ys) - minY + 120;
  const pos = new Map(graph.nodes.map((n) => [n.id, { x: n.position.x - minX + 100, y: n.position.y - minY + 60 }]));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="tpl-preview" aria-hidden>
      {graph.edges.map((e) => {
        const a = pos.get(e.source)!;
        const b = pos.get(e.target)!;
        return <line key={e.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="currentColor" strokeOpacity={0.35} strokeWidth={6} strokeDasharray={e.data?.connection === "indirect" ? "14 10" : undefined} />;
      })}
      {graph.nodes.map((n) => {
        const p = pos.get(n.id)!;
        return <rect key={n.id} x={p.x - 50} y={p.y - 32} width={100} height={64} rx={10} fill={CAT_COLOR[n.data.category]} />;
      })}
    </svg>
  );
}
