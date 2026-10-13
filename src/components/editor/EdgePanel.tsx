"use client";
import type { Edge } from "@xyflow/react";
import { formatValue, type EdgeStats } from "@/lib/analysis";
import type { EdgeData, FunnelNode, Mode } from "./parts";

const LINES: { value: NonNullable<EdgeData["line"]>; label: string }[] = [
  { value: "curved", label: "Krzywa" },
  { value: "straight", label: "Prosta" },
];

const CONNECTIONS: { value: NonNullable<EdgeData["connection"]>; label: string; hint: string }[] = [
  { value: "direct", label: "Krok bezpośredni", hint: "Liczy osoby, dla których B było następnym krokiem z mapy po A." },
  { value: "indirect", label: "Krok pośredni (z pominięciem kroków)", hint: "Liczy osoby, które po A trafiły kiedykolwiek do B, nawet przez inne kroki." },
  { value: "none", label: "Bez danych", hint: "Strzałka tylko poglądowa – bez liczb." },
];

export function EdgePanel({
  edge,
  nodes,
  mode,
  stats,
  onChange,
  onDelete,
}: {
  edge: Edge;
  nodes: FunnelNode[];
  mode: Mode;
  stats?: EdgeStats;
  onChange: (patch: EdgeData) => void;
  onDelete: () => void;
}) {
  const d = (edge.data ?? {}) as EdgeData;
  const line = d.line ?? "curved";
  const conn = d.connection ?? "direct";
  const label = (id: string) => nodes.find((n) => n.id === id)?.data.label ?? "?";
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <b>
          {label(edge.source)} → {label(edge.target)}
        </b>
        <button className="btn small danger" onClick={onDelete}>Usuń</button>
      </div>

      <h3>Styl linii</h3>
      <div className="choice-list">
        {LINES.map((l) => (
          <button key={l.value} className={line === l.value ? "on" : ""} onClick={() => onChange({ line: l.value })}>
            {l.label}
          </button>
        ))}
      </div>

      <h3 style={{ marginTop: 14 }}>Połączenie</h3>
      <div className="choice-list">
        {CONNECTIONS.map((c) => (
          <button key={c.value} className={conn === c.value ? "on" : ""} onClick={() => onChange({ connection: c.value })}>
            {c.label}
          </button>
        ))}
      </div>
      <p className="hint">{CONNECTIONS.find((c) => c.value === conn)?.hint}</p>

      {mode === "analyze" && stats && conn !== "none" && (
        <>
          <hr className="side-sep" />
          <div className="kv"><span>Osoby</span><span>{formatValue(stats.people, "number")}</span></div>
          <div className="kv"><span>Konwersja</span><span>{formatValue(stats.rate, "percent")}</span></div>
          {stats.estimated && <p className="hint">Szacunek – co najmniej jeden z węzłów ma tylko dane ręczne.</p>}
        </>
      )}
    </div>
  );
}
