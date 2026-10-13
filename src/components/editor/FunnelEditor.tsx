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
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
} from "@xyflow/react";
import { CATALOG, CATALOG_BY_KIND, CATEGORY_LABELS, type Category, type NodeData } from "@/lib/catalog";
import type { FullAnalysis } from "@/lib/funnel-analysis";
import { api } from "../forms";
import { EditorCtx, FlowEdge, FunnelNodeView, type FunnelNode, type Mode } from "./parts";
import { NodePanel } from "./NodePanel";
import { MetricsBar } from "./MetricsBar";

const nodeTypes = { funnel: FunnelNodeView };
const edgeTypes = { flow: FlowEdge };
const defaultEdgeOptions = { type: "flow", markerEnd: { type: MarkerType.ArrowClosed } };

export interface EditorProps {
  funnel: { id: string; name: string; graph: { nodes: FunnelNode[]; edges: Edge[] } };
  project: { id: string; name: string };
  client: { id: string; name: string };
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function daysAgo(n: number) {
  return iso(new Date(Date.now() - n * 86400_000));
}

function Editor({ funnel, project, client }: EditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<FunnelNode>(funnel.graph.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(funnel.graph.edges ?? []);
  const [name, setName] = useState(funnel.name);
  const [mode, setMode] = useState<Mode>("plan");
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(iso(new Date()));
  const [analysis, setAnalysis] = useState<FullAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "dirty" | "saving" | "error">("saved");
  const [error, setError] = useState("");
  const rf = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);

  const selected = nodes.find((n) => n.selected);

  // --- Autozapis mapy ---
  const graphJson = useMemo(
    () =>
      JSON.stringify({
        nodes: nodes.map(({ id, type, position, data }) => ({ id, type, position, data })),
        edges: edges.map(({ id, source, target, sourceHandle, targetHandle, type, markerEnd }) => ({ id, source, target, sourceHandle, targetHandle, type, markerEnd })),
      }),
    [nodes, edges],
  );
  const lastSaved = useRef(graphJson);
  useEffect(() => {
    if (graphJson === lastSaved.current) return;
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
  }, [graphJson, funnel.id]);

  // --- Analiza ---
  const loadAnalysis = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // upewnij się, że serwer liczy na aktualnej mapie
      if (graphJson !== lastSaved.current) {
        await api(`/api/funnels/${funnel.id}`, "PATCH", { graph: JSON.parse(graphJson) });
        lastSaved.current = graphJson;
        setSaveState("saved");
      }
      setAnalysis(await api<FullAnalysis>(`/api/funnels/${funnel.id}/analysis?from=${from}&to=${to}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnel.id, from, to]);

  useEffect(() => {
    if (mode === "analyze") loadAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, from, to]);

  // --- Dodawanie węzłów ---
  const addNode = useCallback(
    (kind: string, position?: { x: number; y: number }) => {
      const item = CATALOG_BY_KIND[kind];
      if (!item) return;
      const pos =
        position ??
        (() => {
          const r = wrapper.current?.getBoundingClientRect();
          return rf.screenToFlowPosition({ x: (r?.left ?? 0) + (r?.width ?? 600) / 2 - 95, y: (r?.top ?? 0) + (r?.height ?? 400) / 2 - 40 });
        })();
      const data: NodeData = { kind, category: item.category, label: item.label, ...item.defaults };
      const id = `n_${crypto.randomUUID().slice(0, 8)}`;
      setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), { id, type: "funnel", position: pos, data, selected: true }]);
    },
    [rf, setNodes],
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

  async function saveName() {
    if (name.trim() && name !== funnel.name) await api(`/api/funnels/${funnel.id}`, "PATCH", { name }).catch(() => {});
  }

  const grouped = useMemo(() => {
    const g: Record<Category, typeof CATALOG> = { source: [], page: [], action: [], offline: [] };
    for (const c of CATALOG) g[c.category].push(c);
    return g;
  }, []);

  const saveLabel = { saved: "Zapisano", dirty: "Zmiany…", saving: "Zapisywanie…", error: "Błąd zapisu" }[saveState];

  return (
    <EditorCtx.Provider value={{ mode, analysis: mode === "analyze" ? analysis : null }}>
      <div className={`fe mode-${mode}`}>
        <div className="fe-toolbar">
          <div className="fe-crumbs">
            <Link href={`/clients/${client.id}`}>{client.name}</Link> / <Link href={`/projects/${project.id}`}>{project.name}</Link> /
          </div>
          <input className="name" value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} aria-label="Nazwa lejka" />
          <span className="hint">{saveLabel}</span>
          <div style={{ flex: 1 }} />
          {mode === "analyze" && (
            <div className="row">
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
              <button className="btn small" onClick={loadAnalysis} disabled={loading}>{loading ? "Liczę…" : "Odśwież"}</button>
            </div>
          )}
          <div className="mode-switch" role="tablist">
            <button className={mode === "plan" ? "on" : ""} onClick={() => setMode("plan")}>Planowanie</button>
            <button className={mode === "analyze" ? "on" : ""} onClick={() => setMode("analyze")}>Analiza</button>
          </div>
        </div>

        <aside className="fe-palette">
          {(Object.keys(grouped) as Category[]).map((cat) => (
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
        </aside>

        <div className="fe-canvas" ref={wrapper} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            fitViewOptions={{ maxZoom: 1.1 }}
            snapToGrid
            snapGrid={[10, 10]}
            deleteKeyCode={["Backspace", "Delete"]}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={mode === "plan" ? BackgroundVariant.Lines : BackgroundVariant.Dots}
              gap={mode === "plan" ? 20 : 22}
              color="var(--fe-grid)"
            />
            <Controls showInteractive={false} />
            <MiniMap
              pannable
              zoomable
              style={{ width: 160, height: 100 }}
              bgColor="var(--fe-panel)"
              maskColor="color-mix(in srgb, var(--fe-bg) 65%, transparent)"
              nodeColor={(n) => `var(--cat-${(n.data as NodeData).category})`}
            />
          </ReactFlow>
          {nodes.length === 0 && (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
              <p className="hint">Przeciągnij elementy z lewego panelu i połącz je strzałkami (od kropki po prawej do kropki po lewej).</p>
            </div>
          )}
        </div>

        <aside className="fe-side">
          {selected ? (
            <NodePanel
              key={selected.id}
              funnelId={funnel.id}
              node={selected}
              mode={mode}
              stats={analysis?.nodes[selected.id]}
              range={{ from, to }}
              onChange={(patch) => updateNode(selected.id, patch)}
              onDelete={() => deleteNode(selected.id)}
              onManualChange={() => mode === "analyze" && loadAnalysis()}
            />
          ) : (
            <div className="hint">
              <h3 style={{ color: "var(--fe-ink)" }}>Jak to działa</h3>
              <p>1. Ułóż lejek: źródła ruchu → strony → akcje.</p>
              <p>2. Dla stron wpisz adres (np. <code>/zapis</code>), dla źródeł wartości utm_source, dla akcji typ zdarzenia.</p>
              <p>3. Przełącz na <b>Analizę</b> – liczby pojawią się na węzłach i strzałkach.</p>
              <p>Koszty reklam i inne dane spoza skryptu wpisujesz ręcznie w panelu węzła.</p>
            </div>
          )}
        </aside>

        {mode === "analyze" && (
          <MetricsBar funnelId={funnel.id} analysis={analysis} loading={loading} error={error} onChanged={loadAnalysis} />
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
