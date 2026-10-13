"use client";
// Elementy pomocnicze mapy: tekst, kształt, obraz oraz widgety z danymi.
import { useContext } from "react";
import { NodeResizer, useNodes, type Node, type NodeProps } from "@xyflow/react";
import { formatValue } from "@/lib/analysis";
import { forecastForRange } from "@/lib/forecast";
import type { NodeData } from "@/lib/catalog";
import { EditorCtx } from "./parts";

export interface TextData {
  text: string;
  size?: number;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right";
  link?: string;
  [key: string]: unknown;
}
export interface ShapeData {
  shape: "rect" | "ellipse" | "diamond";
  fill?: string;
  stroke?: string;
  label?: string;
  [key: string]: unknown;
}
export interface ImageData {
  src: string;
  [key: string]: unknown;
}
export type WidgetKind = "trends" | "goals" | "people" | "forecast" | "countries";
export interface WidgetData {
  widget: WidgetKind;
  metric?: "visitors" | "leads" | "sales" | "revenue";
  [key: string]: unknown;
}

export const WIDGETS: { kind: WidgetKind; label: string }[] = [
  { kind: "trends", label: "Trendy" },
  { kind: "goals", label: "Cele" },
  { kind: "people", label: "Osoby" },
  { kind: "forecast", label: "Prognoza" },
  { kind: "countries", label: "Kraje" },
];

export function TextNodeView({ data, selected }: NodeProps<Node<TextData, "text">>) {
  const style: React.CSSProperties = {
    fontSize: data.size ?? 24,
    color: data.color || "var(--fe-ink)",
    fontWeight: data.bold ? 700 : 400,
    fontStyle: data.italic ? "italic" : "normal",
    textAlign: data.align ?? "left",
  };
  const body = data.text?.trim() ? data.text : "Kliknij, aby edytować tekst";
  return (
    <div className={`anno-text ${selected ? "selected" : ""} ${data.text?.trim() ? "" : "empty"}`} style={style}>
      {data.link ? (
        <a href={data.link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{body}</a>
      ) : (
        body
      )}
    </div>
  );
}

export function ShapeNodeView({ data, selected }: NodeProps<Node<ShapeData, "shape">>) {
  const fill = data.fill ?? "transparent";
  const stroke = data.stroke ?? "var(--fe-node-border)";
  return (
    <>
      <NodeResizer isVisible={!!selected} minWidth={40} minHeight={30} />
      <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
        {data.shape === "ellipse" ? (
          <ellipse cx={50} cy={50} rx={49} ry={49} fill={fill} stroke={stroke} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        ) : data.shape === "diamond" ? (
          <polygon points="50,1 99,50 50,99 1,50" fill={fill} stroke={stroke} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        ) : (
          <rect x={1} y={1} width={98} height={98} rx={3} fill={fill} stroke={stroke} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {data.label && <div className="anno-shape-label">{data.label}</div>}
    </>
  );
}

export function ImageNodeView({ data, selected }: NodeProps<Node<ImageData, "image">>) {
  return (
    <>
      <NodeResizer isVisible={!!selected} minWidth={40} minHeight={30} keepAspectRatio />
      {data.src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={data.src} alt="" className="anno-img" draggable={false} />
      ) : (
        <div className="anno-img empty">Wklej adres obrazka w panelu po prawej</div>
      )}
    </>
  );
}

const fmtN = (v: number | null | undefined) => formatValue(v ?? 0, "number");

function Sparkline({ values, days }: { values: number[]; days: string[] }) {
  const w = 260;
  const h = 70;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(h - (v / max) * (h - 6) - 3).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="spark" role="img" aria-label="Wykres dzienny">
      <line x1={0} y1={h - 1} x2={w} y2={h - 1} className="spark-axis" />
      <polyline points={pts} fill="none" className="spark-line" />
      {values.map((v, i) => (
        <rect key={i} x={i * step - step / 2} y={0} width={Math.max(step, 1)} height={h} fill="transparent">
          <title>{`${days[i]}: ${fmtN(v)}`}</title>
        </rect>
      ))}
    </svg>
  );
}

const METRIC_LABEL = { visitors: "Odwiedzający", leads: "Leady", sales: "Sprzedaże", revenue: "Przychód (zł)" };

export function WidgetNodeView({ data, selected }: NodeProps<Node<WidgetData, "widget">>) {
  const { mode, analysis } = useContext(EditorCtx);
  const nodes = useNodes();
  const title = WIDGETS.find((w) => w.kind === data.widget)?.label ?? "Widget";
  let body: React.ReactNode = <div className="hint">Dane pojawią się w trybie Analiza.</div>;

  if (mode === "analyze" && analysis) {
    const funnelNodes = nodes.filter((n) => (n.type ?? "funnel") === "funnel") as Node<NodeData>[];
    if (data.widget === "trends") {
      const metric = data.metric ?? "visitors";
      const values = analysis.daily.map((d) => d[metric]);
      body = (
        <>
          <div className="hint">{METRIC_LABEL[metric]} dziennie · suma {fmtN(values.reduce((a, b) => a + b, 0))}</div>
          <Sparkline values={values} days={analysis.daily.map((d) => d.day)} />
        </>
      );
    } else if (data.widget === "goals") {
      const goals = funnelNodes.filter((n) => n.data.goal);
      body = goals.length ? (
        <>
          {goals.map((n) => {
            const s = analysis.nodes[n.id];
            return (
              <div className="kv" key={n.id}>
                <span>{n.data.goalName || n.data.label}</span>
                <span>{fmtN(s?.goalCount)}{s?.goalValue ? ` · ${formatValue(s.goalValue, "money")}` : ""}</span>
              </div>
            );
          })}
          <div className="kv"><b>Razem</b><b>{fmtN(analysis.totals.goals)} · {formatValue(analysis.totals.goal_value, "money")}</b></div>
        </>
      ) : (
        <div className="hint">Oznacz kroki jako cel (zakładka Śledzenie).</div>
      );
    } else if (data.widget === "people") {
      body = (
        <>
          <div className="kv"><span>Odwiedzający</span><span>{fmtN(analysis.totals.visitors)}</span></div>
          <div className="kv"><span>Leady</span><span>{fmtN(analysis.totals.leads)}</span></div>
          <div className="kv"><span>Sprzedaże</span><span>{fmtN(analysis.totals.sales)}</span></div>
          <div className="kv"><span>Konwersja na sprzedaż</span><span>{formatValue(analysis.totals.conv_rate, "percent")}</span></div>
        </>
      );
    } else if (data.widget === "forecast") {
      const rows = funnelNodes.filter((n) => n.data.forecast);
      body = rows.length ? (
        rows.map((n) => {
          const exp = forecastForRange(n.data.forecast, analysis.from, analysis.to) ?? 0;
          const s = analysis.nodes[n.id];
          const act = n.data.category === "action" && n.data.eventType === "purchase" ? (s?.conversions ?? 0) : (s?.people ?? 0);
          return (
            <div className="kv" key={n.id}>
              <span>{n.data.label}</span>
              <span>{fmtN(act)} / {fmtN(Math.round(exp))} ({formatValue(exp ? act / exp : null, "percent")})</span>
            </div>
          );
        })
      ) : (
        <div className="hint">Ustaw prognozę w zakładce Plan węzła.</div>
      );
    } else if (data.widget === "countries") {
      const total = analysis.countries.reduce((a, c) => a + c.people, 0);
      body = analysis.countries.length ? (
        analysis.countries.map((c) => (
          <div className="kv" key={c.country}>
            <span>{c.country === "??" ? "Nieznany" : c.country}</span>
            <span>{fmtN(c.people)} ({formatValue(total ? c.people / total : null, "percent")})</span>
          </div>
        ))
      ) : (
        <div className="hint">Brak danych.</div>
      );
    }
  }

  return (
    <div className={`anno-widget ${selected ? "selected" : ""}`}>
      <div className="anno-widget-title">{title}</div>
      {body}
    </div>
  );
}
