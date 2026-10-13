"use client";
import "@xyflow/react/dist/style.css";
import "./editor.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addEdge,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  type Node,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
} from "@xyflow/react";
import { CATALOG, CATALOG_BY_KIND, CATEGORY_LABELS, type Category, type ChecklistItem, type NodeData, type NodeFilter } from "@/lib/catalog";
import type { FullAnalysis } from "@/lib/funnel-analysis";
import { api } from "../forms";
import { DEFAULT_LAYERS, EditorCtx, FlowEdge, FunnelNodeView, type EdgeData, type FunnelNode, type Layers, type Mode } from "./parts";
import { EdgePanel } from "./EdgePanel";
import { AnnotationPanel } from "./AnnotationPanel";
import { TemplatePicker } from "./TemplatePicker";
import { ImageNodeView, ShapeNodeView, TextNodeView, WidgetNodeView, WIDGETS, type WidgetKind } from "./annotations";
import type { DataMode } from "@/lib/analysis";
import { ChecklistEditor, FiltersEditor, NodePanel, StatsView } from "./NodePanel";
import { SharePanel } from "./SharePanel";
import { previousRange } from "@/lib/forecast";
import { getNodesBounds, getViewportForBounds } from "@xyflow/react";
import { toPng } from "html-to-image";
import { ExplorePanel } from "./ExplorePanel";
import { MetricsBar } from "./MetricsBar";

const nodeTypes = { funnel: FunnelNodeView, text: TextNodeView, shape: ShapeNodeView, image: ImageNodeView, widget: WidgetNodeView };
const edgeTypes = { flow: FlowEdge };
const defaultEdgeOptions = { type: "flow", markerEnd: { type: MarkerType.ArrowClosed } };

export interface FunnelMeta {
  notes?: string;
  checklist?: ChecklistItem[];
}

type LeftTab = "elements" | "explore" | "notes" | "checklist";

export interface EditorProps {
  /** Widok tylko do odczytu (link udostępniony). */
  readOnly?: boolean;
  /** Adres API analizy (domyślnie /api/funnels/{id}/analysis). */
  analysisUrl?: string;
  funnel: { id: string; name: string; graph: { nodes: FunnelNode[]; edges: Edge[]; meta?: FunnelMeta } };
  project: { id: string; name: string; trackingKey: string };
  client: { id: string; name: string };
}

function downloadUrl(href: string, filename: string) {
  const a = document.createElement("a");
  a.href = href;
  // Nazwa bez polskich znaków – niektóre przeglądarki ignorują nazwy spoza ASCII.
  a.download = filename
    .replace(/ł/g, "l")
    .replace(/Ł/g, "L")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.\- ]+/g, "_")
    .replace(/\s+/g, "-");
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function daysAgo(n: number) {
  return iso(new Date(Date.now() - n * 86400_000));
}

function Editor({ funnel, project, client, readOnly = false, analysisUrl }: EditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<FunnelNode>(funnel.graph.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(funnel.graph.edges ?? []);
  const [name, setName] = useState(funnel.name);
  const [meta, setMeta] = useState<FunnelMeta>(funnel.graph.meta ?? {});
  const [leftTab, setLeftTab] = useState<LeftTab>("elements");
  const [paletteQuery, setPaletteQuery] = useState("");
  const [mode, setMode] = useState<Mode>("plan");
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(iso(new Date()));
  const [analysis, setAnalysis] = useState<FullAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [error, setError] = useState("");
  const rf = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);

  const selectedAny = nodes.find((n) => n.selected);
  const selected = selectedAny && (selectedAny.type ?? "funnel") === "funnel" ? selectedAny : undefined;
  const selectedAnno = selectedAny && !selected ? (selectedAny as unknown as Node) : undefined;
  const selectedEdge = selectedAny ? undefined : edges.find((e) => e.selected);
  const [dataMode, setDataMode] = useState<DataMode>("traffic");
  const [showTemplates, setShowTemplates] = useState(!readOnly && (funnel.graph.nodes ?? []).length === 0);
  const [widgetMenu, setWidgetMenu] = useState(false);
  const [moreMenu, setMoreMenu] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [filters, setFilters] = useState<NodeFilter[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [compareOn, setCompareOn] = useState(false);
  const [compare, setCompare] = useState<FullAnalysis | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const activeFilters = useMemo(() => filters.filter((f) => f.key && (f.value || f.op === "empty" || f.op === "not_empty")), [filters]);
  const filtersKey = JSON.stringify(activeFilters);
  const [layers, setLayers] = useState<Layers>(DEFAULT_LAYERS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem("anl_layers");
      if (raw) setLayers({ ...DEFAULT_LAYERS, ...JSON.parse(raw) });
    } catch {
      /* brak dostępu do pamięci przeglądarki */
    }
  }, []);
  const toggleLayer = (k: keyof Layers) =>
    setLayers((l) => {
      const next = { ...l, [k]: !l[k] };
      try {
        localStorage.setItem("anl_layers", JSON.stringify(next));
      } catch {
        /* ignoruj */
      }
      return next;
    });

  // --- Autozapis mapy ---
  const graphJson = useMemo(
    () =>
      JSON.stringify({
        nodes: nodes.map(({ id, type, position, data, zIndex, width, height, style }) => ({ id, type, position, data, zIndex, width, height, style })),
        edges: edges.map(({ id, source, target, sourceHandle, targetHandle, type, markerEnd, data }) => ({ id, source, target, sourceHandle, targetHandle, type, markerEnd, data })),
        meta,
      }),
    [nodes, edges, meta],
  );
  const lastSaved = useRef(graphJson);
  const currentGraph = useRef(graphJson);
  currentGraph.current = graphJson;
  useEffect(() => {
    if (readOnly || graphJson === lastSaved.current) return;
    setSaveState("dirty");
    const t = setTimeout(async () => {
      setSaveState("saving");
      try {
        await api(`/api/funnels/${funnel.id}`, "PATCH", { graph: JSON.parse(graphJson) });
        lastSaved.current = graphJson;
        setSaveState("saved");
      } catch {
        setSaveState("error");
      }
    }, 700);
    return () => clearTimeout(t);
  }, [graphJson, funnel.id, readOnly]);

  // --- Analiza ---
  const loadAnalysis = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // upewnij się, że serwer liczy na aktualnej mapie
      const g = currentGraph.current;
      if (!readOnly && g !== lastSaved.current) {
        await api(`/api/funnels/${funnel.id}`, "PATCH", { graph: JSON.parse(g) });
        lastSaved.current = g;
        setSaveState("saved");
      }
      const base = analysisUrl ?? `/api/funnels/${funnel.id}/analysis`;
      const q = (a: string, b: string) => `${base}?from=${a}&to=${b}&mode=${dataMode}&f=${encodeURIComponent(filtersKey)}`;
      const [cur, prev] = await Promise.all([
        api<FullAnalysis>(q(from, to)),
        compareOn ? api<FullAnalysis>(q(...previousRange(from, to))) : Promise.resolve(null),
      ]);
      setAnalysis(cur);
      setCompare(prev);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [funnel.id, from, to, dataMode, filtersKey, compareOn, readOnly, analysisUrl]);

  useEffect(() => {
    if (mode === "analyze") loadAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, from, to, dataMode, filtersKey, compareOn]);

  // --- Dodawanie węzłów ---
  const addNode = useCallback(
    (kind: string, position?: { x: number; y: number }, patch?: Partial<NodeData>) => {
      const item = CATALOG_BY_KIND[kind];
      if (!item) return;
      const pos =
        position ??
        (() => {
          const r = wrapper.current?.getBoundingClientRect();
          return rf.screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 600) / 2 - 95, y: (r?.top ?? 0) + (r?.height ?? 400) / 2 - 40 });
        })();
      const data: NodeData = { kind, category: item.category, label: item.label, ...item.defaults, ...patch };
      const id = `n_${crypto.randomUUID().slice(0, 8)}`;
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id, type: "funnel", position: pos, data, selected: true }]);
    },
    [rf, setNodes],
  );

  const centerPos = useCallback(() => {
    const r = wrapper.current?.getBoundingClientRect();
    return rf.screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 600) / 2 - 100, y: (r?.top ?? 0) + (r?.height ?? 400) / 2 - 50 });
  }, [rf]);

  const annoCount = useRef(0);
  const addAnnotation = useCallback(
    (type: "text" | "shape" | "image" | "widget", data: Record<string, unknown>, size?: { width: number; height: number }) => {
      const id = `${type}_${crypto.randomUUID().slice(0, 8)}`;
      const c = centerPos();
      const k = annoCount.current++ % 6;
      const node = { id, type, position: { x: c.x + k * 40, y: c.y + k * 40 }, data, selected: true, ...(size ? { width: size.width, height: size.height, style: { ...size } } : {}) };
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), node as unknown as FunnelNode]);
    },
    [centerPos, setNodes],
  );

  const applyTemplate = useCallback(
    (g: { nodes: unknown[]; edges: unknown[] }) => {
      const tn = g.nodes as FunnelNode[];
      const te = g.edges as Edge[];
      // Wstaw obok istniejących elementów (po prawej), żeby niczego nie nadpisać.
      const maxX = nodes.length ? Math.max(...nodes.map((n) => n.position.x)) + 400 : 0;
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), ...tn.map((n) => ({ ...n, position: { x: n.position.x + maxX, y: n.position.y } }))]);
      setEdges((es) => [...es, ...te]);
      setShowTemplates(false);
      setTimeout(() => rf.fitView({ maxZoom: 1.1, duration: 300 }), 50);
    },
    [nodes, setNodes, setEdges, rf],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData("application/x-anl-kind");
      if (!kind) return;
      addNode(kind, rf.screenToFlowPosition({ x: e.clientX - 95, y: e.clientY - 30 }));
    },
    [addNode, rf],
  );

  const onConnect = useCallback(
    (c: Connection) => setEdges((es) => addEdge({ ...c, id: `e_${crypto.randomUUID().slice(0, 8)}`, ...defaultEdgeOptions }, es)),
    [setEdges],
  );

  const updateNode = useCallback(
    (id: string, patch: Partial<NodeData>) => setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))),
    [setNodes],
  );
  const deleteNode = useCallback(
    (id: string) => {
      setNodes((ns) => ns.filter((n) => n.id !== id));
      setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
    },
    [setNodes, setEdges],
  );

  const updateEdge = useCallback(
    (id: string, patch: EdgeData) => setEdges((es) => es.map((e) => (e.id === id ? { ...e, data: { ...(e.data ?? {}), ...patch } } : e))),
    [setEdges],
  );

  // --- Kopiuj / wklej / duplikuj / kolejność warstw ---
  const clipboard = useRef<{ nodes: FunnelNode[]; edges: Edge[] } | null>(null);
  const copySelection = useCallback(() => {
    const sel = nodes.filter((n) => n.selected);
    if (!sel.length) return false;
    const ids = new Set(sel.map((n) => n.id));
    const payload = { nodes: sel, edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
    clipboard.current = payload;
    try {
      localStorage.setItem("anl_clipboard", JSON.stringify(payload));
    } catch {
      /* ignoruj */
    }
    return true;
  }, [nodes, edges]);

  const paste = useCallback(
    (payload?: { nodes: FunnelNode[]; edges: Edge[] } | null) => {
      let src = payload ?? clipboard.current;
      if (!src) {
        try {
          src = JSON.parse(localStorage.getItem("anl_clipboard") ?? "null");
        } catch {
          src = null;
        }
      }
      if (!src?.nodes?.length) return;
      const map = new Map<string, string>();
      const newNodes: FunnelNode[] = src.nodes.map((n) => {
        const id = `n_${crypto.randomUUID().slice(0, 8)}`;
        map.set(n.id, id);
        return {
          id,
          type: n.type ?? "funnel",
          position: { x: n.position.x + 40, y: n.position.y + 40 },
          data: structuredClone(n.data),
          zIndex: n.zIndex,
          width: n.width,
          height: n.height,
          style: n.style,
          selected: true,
        } as FunnelNode;
      });
      const newEdges: Edge[] = src.edges.map((e) => ({
        ...e,
        id: `e_${crypto.randomUUID().slice(0, 8)}`,
        source: map.get(e.source)!,
        target: map.get(e.target)!,
        selected: false,
      }));
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), ...newNodes]);
      setEdges((es) => [...es, ...newEdges]);
      clipboard.current = { nodes: newNodes, edges: newEdges };
    },
    [setNodes, setEdges],
  );

  const duplicate = useCallback(() => {
    const sel = nodes.filter((n) => n.selected);
    if (!sel.length) return;
    const ids = new Set(sel.map((n) => n.id));
    paste({ nodes: sel, edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)) });
  }, [nodes, edges, paste]);

  const reorder = useCallback(
    (how: "forward" | "front" | "backward" | "back") =>
      setNodes((ns) => {
        const zs = ns.map((n) => n.zIndex ?? 0);
        const max = Math.max(0, ...zs);
        const min = Math.min(0, ...zs);
        return ns.map((n) => {
          if (!n.selected) return n;
          const z = n.zIndex ?? 0;
          const next = how === "forward" ? z + 1 : how === "backward" ? z - 1 : how === "front" ? max + 1 : min - 1;
          return { ...n, zIndex: next };
        });
      }),
    [setNodes],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (readOnly) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "c") {
        if (copySelection()) e.preventDefault();
      } else if (k === "v") {
        e.preventDefault();
        paste();
      } else if (k === "d") {
        e.preventDefault();
        duplicate();
      } else if (e.key === "]" || e.key === "}") {
        e.preventDefault();
        reorder(e.shiftKey ? "front" : "forward");
      } else if (e.key === "[" || e.key === "{") {
        e.preventDefault();
        reorder(e.shiftKey ? "back" : "backward");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [copySelection, paste, duplicate, reorder, readOnly]);

  async function exportPng() {
    const el = wrapper.current?.querySelector<HTMLElement>(".react-flow__viewport");
    if (!el || !nodes.length) return;
    const bounds = getNodesBounds(nodes);
    const width = Math.min(4000, Math.max(800, bounds.width + 200));
    const height = Math.min(4000, Math.max(500, bounds.height + 200));
    const vp = getViewportForBounds(bounds, width, height, 0.2, 2, 0.08);
    const bg = getComputedStyle(wrapper.current!).getPropertyValue("--fe-bg") || "#ffffff";
    const dataUrl = await toPng(el, {
      backgroundColor: bg.trim() || "#ffffff",
      width,
      height,
      pixelRatio: 2,
      style: { width: `${width}px`, height: `${height}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` },
    });
    downloadUrl(dataUrl, `${name || "lejek"}.png`);
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ name, graph: JSON.parse(graphJson) }, null, 2)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    downloadUrl(href, `${name || "lejek"}.json`);
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }

  async function importJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const g = parsed.graph ?? parsed;
      if (!Array.isArray(g.nodes) || !Array.isArray(g.edges)) throw new Error("Plik nie zawiera mapy lejka");
      if (nodes.length && !confirm("Zastąpić obecną mapę zawartością pliku? (Anuluj = dodaj obok)")) {
        applyTemplate({ nodes: g.nodes, edges: g.edges });
        return;
      }
      setNodes(g.nodes);
      setEdges(g.edges);
      if (g.meta) setMeta(g.meta);
      setTimeout(() => rf.fitView({ maxZoom: 1.1 }), 50);
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveName() {
    if (name.trim() && name !== funnel.name) await api(`/api/funnels/${funnel.id}`, "PATCH", { name }).catch(() => {});
  }

  const grouped = useMemo(() => {
    const g: Record<Category, typeof CATALOG> = { source: [], page: [], action: [], offline: [] };
    const q = paletteQuery.trim().toLowerCase();
    for (const c of CATALOG) if (!q || c.label.toLowerCase().includes(q)) g[c.category].push(c);
    return g;
  }, [paletteQuery]);

  const saveLabel = { saved: "Zapisano", dirty: "Zmiany…", saving: "Zapisywanie…", error: "Błąd zapisu" }[saveState];

  return (
    <EditorCtx.Provider value={{ mode, analysis: mode === "analyze" ? analysis : null, compare: mode === "analyze" ? compare : null, layers }}>
      <div className={`fe mode-${mode} ${readOnly ? "readonly" : ""}`}>
        <div className="fe-top">
        <div className="fe-toolbar">
          <div className="fe-crumbs">
            {readOnly ? (
              <>{client.name} / {project.name} /</>
            ) : (
              <>
                <Link href={`/clients/${client.id}`}>{client.name}</Link> / <Link href={`/projects/${project.id}`}>{project.name}</Link> /
              </>
            )}
          </div>
          {readOnly ? (
            <b className="name-ro">{name}</b>
          ) : (
            <input className="name" value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} aria-label="Nazwa lejka" />
          )}
          {!readOnly && <span className="hint">{saveLabel}</span>}
          {readOnly && <span className="badge">Tylko do odczytu</span>}
          <div style={{ flex: 1 }} />
          {!readOnly && (
            <div className="row tool-group">
              <button className="btn small icon" title="Dodaj tekst" aria-label="Dodaj tekst" onClick={() => addAnnotation("text", { text: "", size: 24 })}>T</button>
              <button className="btn small icon" title="Dodaj kształt" aria-label="Dodaj kształt" onClick={() => addAnnotation("shape", { shape: "rect", fill: "transparent" }, { width: 320, height: 200 })}>▭</button>
              <button className="btn small icon" title="Dodaj obraz" aria-label="Dodaj obraz" onClick={() => addAnnotation("image", { src: "" }, { width: 240, height: 160 })}>▣</button>
              <div style={{ position: "relative" }}>
                <button className="btn small" title="Dodaj widget" onClick={() => setWidgetMenu((v) => !v)}>Widget ▾</button>
                {widgetMenu && (
                  <div className="dropdown">
                    {WIDGETS.map((w) => (
                      <button
                        key={w.kind}
                        onClick={() => {
                          addAnnotation("widget", { widget: w.kind as WidgetKind });
                          setWidgetMenu(false);
                        }}
                      >
                        {w.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button className="btn small" onClick={() => setShowTemplates(true)}>Szablony</button>
            </div>
          )}
          <div style={{ position: "relative" }}>
            <button className="btn small" title="Eksport, druk, udostępnianie" onClick={() => setMoreMenu((v) => !v)}>⋯</button>
            {moreMenu && (
              <div className="dropdown" style={{ left: "auto", right: 0 }}>
                <button onClick={() => { setMoreMenu(false); exportPng(); }}>Eksport PNG</button>
                <button onClick={() => { setMoreMenu(false); setTimeout(() => window.print(), 50); }}>Drukuj / zapisz PDF</button>
                <button onClick={() => { setMoreMenu(false); exportJson(); }}>Eksport mapy (JSON)</button>
                {!readOnly && <button onClick={() => { setMoreMenu(false); importInput.current?.click(); }}>Import mapy (JSON)</button>}
                {!readOnly && <button onClick={() => { setMoreMenu(false); setShowShare(true); }}>Udostępnij link…</button>}
              </div>
            )}
            <input ref={importInput} type="file" accept="application/json,.json" hidden onChange={importJson} />
          </div>
          <div className="mode-switch" role="tablist">
            <button className={mode === "plan" ? "on" : ""} onClick={() => setMode("plan")}>Planowanie</button>
            <button className={mode === "analyze" ? "on" : ""} onClick={() => setMode("analyze")}>Analiza</button>
          </div>
        </div>
        {mode === "analyze" && (
          <div className="fe-toolbar fe-analysis-bar">
            <select
              aria-label="Zakres"
              onChange={(e) => {
                const d = Number(e.target.value);
                if (d) {
                  setFrom(daysAgo(d - 1));
                  setTo(iso(new Date()));
                }
              }}
              defaultValue=""
            >
              <option value="">Zakres…</option>
              <option value="1">Dziś</option>
              <option value="7">Ostatnie 7 dni</option>
              <option value="30">Ostatnie 30 dni</option>
              <option value="90">Ostatnie 90 dni</option>
              <option value="365">Ostatni rok</option>
            </select>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Od" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Do" />
            <select value={dataMode} onChange={(e) => setDataMode(e.target.value as DataMode)} title="Tryb danych" aria-label="Tryb danych">
              <option value="traffic">Dane: ruch</option>
              <option value="funnel">Dane: lejek</option>
            </select>
            <div style={{ position: "relative" }}>
              <button className={`btn small ${activeFilters.length ? "primary" : ""}`} onClick={() => setShowFilters((v) => !v)}>
                Filtry{activeFilters.length ? ` (${activeFilters.length})` : ""}
              </button>
              {showFilters && (
                <div className="dropdown filters-pop">
                  <p className="hint" style={{ margin: "0 0 6px" }}>Pokaż tylko osoby, które mają choć jedno zdarzenie spełniające warunki.</p>
                  <FiltersEditor filters={filters} onChange={setFilters} />
                  <div className="row" style={{ justifyContent: "flex-end" }}>
                    <button className="btn small" onClick={() => setFilters([])}>Wyczyść</button>
                    <button className="btn small primary" onClick={() => setShowFilters(false)}>Gotowe</button>
                  </div>
                </div>
              )}
            </div>
            <label className="row hint" style={{ gap: 4 }} title="Porównaj z poprzednim okresem o tej samej długości">
              <input type="checkbox" checked={compareOn} onChange={(e) => setCompareOn(e.target.checked)} /> Porównaj z poprzednim okresem
            </label>
            <div style={{ flex: 1 }} />
            <button className="btn small" onClick={loadAnalysis} disabled={loading}>{loading ? "Liczę…" : "Odśwież"}</button>
          </div>
        )}
        </div>

        <aside className="fe-left">
          <nav className="fe-rail">
            {(
              [
                ["elements", "▦", "Elementy mapy"],
                ["explore", "⌕", "Eksploruj dane i skrypt"],
                ["notes", "✎", "Notatki lejka"],
                ["checklist", "✓", "Checklista lejka"],
              ] as [LeftTab, string, string][]
            ).map(([k, icon, title]) => (
              <button key={k} className={leftTab === k ? "on" : ""} title={title} aria-label={title} onClick={() => setLeftTab(k)}>
                {icon}
              </button>
            ))}
          </nav>
          <div className="fe-palette">
          {leftTab === "explore" && (
            <ExplorePanel funnelId={funnel.id} trackingKey={project.trackingKey} range={{ from, to }} onAdd={(kind, patch) => addNode(kind, undefined, patch)} />
          )}
          {leftTab === "notes" && (
            <div>
              <h4>Notatki lejka</h4>
              <textarea
                className="meta-notes"
                value={meta.notes ?? ""}
                placeholder="Cele lejka, założenia, linki, ustalenia z klientem…"
                onChange={(e) => setMeta((m) => ({ ...m, notes: e.target.value }))}
              />
            </div>
          )}
          {leftTab === "checklist" && (
            <ChecklistEditor items={meta.checklist ?? []} onChange={(checklist) => setMeta((m) => ({ ...m, checklist }))} />
          )}
          {leftTab === "elements" && (
            <input className="pal-search" placeholder="Szukaj elementu…" value={paletteQuery} onChange={(e) => setPaletteQuery(e.target.value)} />
          )}
          {leftTab === "elements" && (Object.keys(grouped) as Category[]).filter((cat) => grouped[cat].length).map((cat) => (
            <div key={cat}>
              <h4>{CATEGORY_LABELS[cat]}</h4>
              {grouped[cat].map((item) => (
                <div
                  key={item.kind}
                  className={`pal-item cat-${cat}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/x-anl-kind", item.kind);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDoubleClick={() => addNode(item.kind)}
                  title="Przeciągnij na mapę lub kliknij dwukrotnie"
                >
                  <span className="abbr">{item.abbr}</span>
                  {item.label}
                </div>
              ))}
            </div>
          ))}
          </div>
        </aside>

        <div className="fe-canvas" ref={wrapper} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={readOnly ? undefined : onConnect}
            nodesDraggable={!readOnly}
            nodesConnectable={!readOnly}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            fitViewOptions={{ maxZoom: 1.1 }}
            snapToGrid
            snapGrid={[10, 10]}
            deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={mode === "plan" ? BackgroundVariant.Lines : BackgroundVariant.Dots}
              gap={mode === "plan" ? 20 : 22}
              color="var(--fe-grid)"
            />
            <Controls showInteractive={false} />
            <Panel position="top-right" className="layers-panel">
              <span className="hint">Warstwy</span>
              {(
                [
                  ["numbers", "Liczby"],
                  ["flow", "Przepływ"],
                  ["thumbs", "Miniatury"],
                  ["plan", "Plan"],
                ] as [keyof Layers, string][]
              ).map(([k, label]) => (
                <label key={k} title={`Włącz/wyłącz warstwę: ${label}`}>
                  <input type="checkbox" checked={layers[k]} onChange={() => toggleLayer(k)} /> {label}
                </label>
              ))}
            </Panel>
            <MiniMap
              pannable
              zoomable
              style={{ width: 160, height: 100 }}
              bgColor="var(--fe-panel)"
              maskColor="color-mix(in srgb, var(--fe-bg) 65%, transparent)"
              nodeColor={(n) => ((n.type ?? "funnel") === "funnel" ? `var(--cat-${(n.data as NodeData).category})` : "var(--fe-chip)")}
            />
          </ReactFlow>
          {nodes.length === 0 && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
              <div style={{ textAlign: "center", pointerEvents: "auto" }}>
                <p className="hint">Przeciągnij elementy z lewego panelu i połącz je strzałkami (od kropki po prawej do kropki po lewej).</p>
                <button className="btn primary" onClick={() => setShowTemplates(true)}>Zacznij od szablonu</button>
              </div>
            </div>
          )}
        </div>

        <aside className="fe-side">
          {readOnly ? (
            selected ? (
              <div>
                <h3>{selected.data.label}</h3>
                {analysis?.nodes[selected.id] ? (
                  <StatsView d={selected.data} s={analysis.nodes[selected.id]} />
                ) : (
                  <p className="hint">Przełącz na Analizę, aby zobaczyć liczby.</p>
                )}
                {selected.data.notes && <p style={{ whiteSpace: "pre-wrap" }}>{selected.data.notes}</p>}
              </div>
            ) : (
              <div className="hint">
                <h3 style={{ color: "var(--fe-ink)" }}>Podgląd lejka</h3>
                <p>Kliknij element, aby zobaczyć szczegóły. Przełącz na Analizę, aby zobaczyć liczby dla wybranego okresu.</p>
              </div>
            )
          ) : selected ? (
            <NodePanel
              key={selected.id}
              funnelId={funnel.id}
              node={selected}
              mode={mode}
              stats={analysis?.nodes[selected.id]}
              range={{ from, to }}
              onChange={(patch) => updateNode(selected.id, patch)}
              onDelete={() => deleteNode(selected.id)}
              onAction={(a) => {
                if (a === "copy") copySelection();
                else if (a === "duplicate") duplicate();
                else reorder(a);
              }}
              onManualChange={() => mode === "analyze" && loadAnalysis()}
            />
          ) : selectedAnno ? (
            <AnnotationPanel
              key={selectedAnno.id}
              node={selectedAnno}
              onChange={(patch) =>
                setNodes((ns) => ns.map((n) => (n.id === selectedAnno.id ? { ...n, data: { ...n.data, ...patch } as NodeData } : n)))
              }
              onDelete={() => deleteNode(selectedAnno.id)}
              onAction={(a) => {
                if (a === "copy") copySelection();
                else if (a === "duplicate") duplicate();
                else reorder(a);
              }}
            />
          ) : selectedEdge ? (
            <EdgePanel
              key={selectedEdge.id}
              edge={selectedEdge}
              nodes={nodes}
              mode={mode}
              stats={analysis?.edges[selectedEdge.id]}
              onChange={(patch) => {
                updateEdge(selectedEdge.id, patch);
                if (mode === "analyze" && patch.connection) setTimeout(loadAnalysis, 50);
              }}
              onDelete={() => setEdges((es) => es.filter((e) => e.id !== selectedEdge.id))}
            />
          ) : (
            <div className="hint">
              <h3 style={{ color: "var(--fe-ink)" }}>Jak to działa</h3>
              <p>1. Ułóż lejek: źródła ruchu → strony → akcje.</p>
              <p>2. Dla stron wpisz adres (np. <code>/zapis</code>), dla źródeł wartości utm_source, dla akcji typ zdarzenia.</p>
              <p>3. Przełącz na <b>Analizę</b> – liczby pojawią się na węzłach i strzałkach.</p>
              <p>Koszty reklam i inne dane spoza skryptu wpisujesz ręcznie w panelu węzła.</p>
              <p>Kliknij strzałkę, żeby ustawić typ linii i połączenia.</p>
              <p>
                Skróty: <code>Ctrl/⌘+C</code> kopiuj, <code>+V</code> wklej (także w innym lejku), <code>+D</code> duplikuj,{" "}
                <code>+]</code>/<code>+[</code> wyżej/niżej (z Shift – na wierzch/spód), <code>Delete</code> usuń.
              </p>
            </div>
          )}
        </aside>

        {mode === "analyze" && (
          <MetricsBar funnelId={funnel.id} analysis={analysis} compare={compare} loading={loading} error={error} onChanged={loadAnalysis} readOnly={readOnly} />
        )}
        {showShare && <SharePanel funnelId={funnel.id} onClose={() => setShowShare(false)} />}
        {showTemplates && (
        <TemplatePicker funnelId={funnel.id} range={{ from, to }} onPick={applyTemplate} onClose={() => setShowTemplates(false)} />
        )}
      </div>
    </EditorCtx.Provider>
  );
}

export function FunnelEditor(props: EditorProps) {
  return (
    <ReactFlowProvider>
      <Editor {...props} />
    </ReactFlowProvider>
  );
}
