"use client";
import { createContext, useContext } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getStraightPath,
  Handle,
  Position,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { CATALOG_BY_KIND, type NodeData } from "@/lib/catalog";
import { formatValue, type NodeStats } from "@/lib/analysis";
import type { FullAnalysis } from "@/lib/funnel-analysis";
import { PageThumb } from "./PageThumb";
import { delta, forecastForRange } from "@/lib/forecast";

export type Mode = "plan" | "analyze";
export interface Layers {
  numbers: boolean;
  flow: boolean;
  thumbs: boolean;
  plan: boolean;
}
export const DEFAULT_LAYERS: Layers = { numbers: true, flow: false, thumbs: true, plan: true };
export const EditorCtx = createContext<{ mode: Mode; analysis: FullAnalysis | null; compare?: FullAnalysis | null; layers: Layers }>({
  mode: "plan",
  analysis: null,
  compare: null,
  layers: DEFAULT_LAYERS,
});

/** Strzałka zmiany względem poprzedniego okresu. */
export function Delta({ value }: { value: number | null }) {
  if (value == null) return null;
  const up = value >= 0;
  return (
    <span className={`delta ${up ? "up" : "down"}`} title="Zmiana względem poprzedniego okresu">
      {up ? "▲" : "▼"} {formatValue(Math.abs(value), "percent")}
    </span>
  );
}

export type EdgeData = { connection?: "direct" | "indirect" | "none"; line?: "curved" | "straight" };

export type FunnelNode = Node<NodeData, "funnel">;

const n = (v: number | undefined | null) => formatValue(v ?? 0, "number");
const pct = (v: number | undefined | null) => formatValue(v, "percent");

function planFooter(d: NodeData): { text: string; warn: boolean } {
  const f = d.filters?.length ? ` · warunki: ${d.filters.length}` : "";
  const r = planFooterBase(d);
  return { ...r, text: r.text + f };
}

function planFooterBase(d: NodeData): { text: string; warn: boolean } {
  if (d.category === "page") {
    const urls = [d.url, ...(d.urls ?? [])].filter((u) => u?.trim());
    return urls.length ? { text: urls[0] + (urls.length > 1 ? ` +${urls.length - 1}` : ""), warn: false } : { text: "brak adresu URL", warn: true };
  }
  if (d.category === "source") return d.sourceMatch ? { text: `źródło: ${d.sourceMatch}`, warn: false } : { text: "brak dopasowania źródła", warn: true };
  if (d.category === "action")
    return { text: `${d.eventType ?? "?"}${d.eventName ? ` · ${d.eventName}` : ""}${d.pageUrl ? ` @ ${d.pageUrl}` : ""}`, warn: !d.eventType };
  return { text: "dane ręczne", warn: false };
}

function Stats({ d, s, range, prev }: { d: NodeData; s: NodeStats; range: { from: string; to: string }; prev?: NodeStats }) {
  const expected = forecastForRange(d.forecast, range.from, range.to);
  const unit = d.category === "action" ? (d.eventType === "purchase" ? "zakupów" : "osób") : "osób";
  return (
    <div className="fnode-stats">
      <div className="fnode-big">
        {n(d.category === "action" && d.eventType === "purchase" ? s.conversions : s.people)}
        <small>{unit}</small>
        {prev && (
          <Delta
            value={delta(
              d.category === "action" && d.eventType === "purchase" ? s.conversions : s.people,
              d.category === "action" && d.eventType === "purchase" ? prev.conversions : prev.people,
            )}
          />
        )}
      </div>
      {d.category === "source" && (
        <>
          {!!s.spend && <div className="fnode-kv"><span>Wydatki</span><span>{formatValue(s.spend, "money")}</span></div>}
          {s.ctrAds != null && <div className="fnode-kv"><span>CTR reklamy</span><span>{pct(s.ctrAds)}</span></div>}
          {s.hookRate != null && <div className="fnode-kv"><span>Hook rate</span><span>{pct(s.hookRate)}</span></div>}
        </>
      )}
      {d.category === "page" && (
        <>
          <div className="fnode-kv"><span>Odsłony</span><span>{n(s.pageviews)}</span></div>
          <div className="fnode-kv"><span>CTR strony</span><span>{pct(s.ctrPage)}</span></div>
          {s.scroll && (
            <div className="scrollbar" title="Odsetek osób, które przewinęły do 25/50/75/100% strony">
              {(["p25", "p50", "p75", "p100"] as const).map((k) => (
                <div key={k}>
                  <i style={{ height: `${Math.round(s.scroll![k] * 100)}%` }} />
                  <span>{Math.round(s.scroll![k] * 100)}%</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {expected != null && (
        <div className="fnode-kv">
          <span>Prognoza</span>
          <span>{pct(expected ? (d.category === "action" && d.eventType === "purchase" ? s.conversions ?? 0 : s.people) / expected : null)} z {n(Math.round(expected))}</span>
        </div>
      )}
      {s.goalCount != null && (
        <div className="fnode-kv"><span>Cel</span><span>{n(s.goalCount)}{s.goalValue ? ` · ${formatValue(s.goalValue, "money")}` : ""}</span></div>
      )}
      {(d.category === "action" || d.category === "offline") && !!s.revenue && (
        <div className="fnode-kv"><span>Przychód</span><span>{formatValue(s.revenue, "money")}</span></div>
      )}
      {!s.tracked && d.category !== "offline" && <div className="fnode-kv"><span>dane</span><span>ręczne / brak konfiguracji</span></div>}
    </div>
  );
}

function PlanBadges({ d }: { d: NodeData }) {
  const items = d.checklist ?? [];
  const done = items.filter((i) => i.done).length;
  const per = { day: "/dz.", week: "/tydz.", month: "/mies." };
  if (!items.length && !d.forecast && !d.notes?.trim()) return null;
  return (
    <div className="fnode-badges">
      {items.length > 0 && <span title="Checklista">✓ {done}/{items.length}</span>}
      {d.forecast && <span title="Prognoza">≈ {n(d.forecast.people)}{per[d.forecast.period]}</span>}
      {d.notes?.trim() && <span title={d.notes}>notatka</span>}
    </div>
  );
}

export function FunnelNodeView({ id, data, selected }: NodeProps<FunnelNode>) {
  const { mode, analysis: rawAnalysis, compare, layers } = useContext(EditorCtx);
  const analysis = layers.numbers ? rawAnalysis : null;
  const item = CATALOG_BY_KIND[data.kind];
  const stats = analysis?.nodes[id];
  const foot = planFooter(data);
  return (
    <div
      className={`fnode cat-${data.category} ${selected ? "selected" : ""} ${data.goal ? "is-goal" : ""}`}
      style={data.color ? ({ "--node-accent": data.color } as React.CSSProperties) : undefined}
    >
      {data.goal && (
        <div className="goal-badge" title={`Cel${data.goalName ? `: ${data.goalName}` : ""}${data.goalValue ? ` · ${data.goalValue} zł` : ""}`}>
          ★ {data.goalName || "Cel"}
        </div>
      )}
      {data.category !== "source" && <Handle type="target" position={Position.Left} />}
      <div className="fnode-head">
        <span className="abbr">{item?.abbr ?? "?"}</span>
        <div>
          <div className="fnode-title">{data.label}</div>
          <div className="fnode-kind">{item?.label ?? data.kind}</div>
        </div>
      </div>
      {mode === "plan" ? (
        <>
          {data.category === "page" && layers.thumbs && (
            <div className="fnode-thumb">
              {data.thumbnailUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="fnode-img" src={data.thumbnailUrl} alt="" loading="lazy" />
              ) : (
                <PageThumb kind={data.kind} />
              )}
            </div>
          )}
          {layers.plan && <PlanBadges d={data} />}
          <div className={`fnode-foot ${foot.warn ? "warn" : ""}`}>{foot.text}</div>
        </>
      ) : stats ? (
        <Stats d={data} s={stats} range={{ from: analysis!.from, to: analysis!.to }} prev={compare?.nodes[id]} />
      ) : !layers.numbers ? (
        <div className="fnode-foot">liczby ukryte</div>
      ) : (
        <div className="fnode-foot">brak danych</div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

export function FlowEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style } = props;
  const data = (props.data ?? {}) as EdgeData;
  const { mode, analysis, layers } = useContext(EditorCtx);
  const [path, lx, ly] =
    data.line === "straight"
      ? getStraightPath({ sourceX, sourceY, targetX, targetY })
      : getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const s = analysis?.edges[id];
  const conn = data.connection ?? "direct";
  // Warstwa przepływu: grubość linii proporcjonalna do liczby osób (względem największej strzałki).
  let flowWidth: number | undefined;
  if (mode === "analyze" && layers.flow && s && conn !== "none" && analysis) {
    const max = Math.max(1, ...Object.values(analysis.edges).map((x) => x.people));
    flowWidth = 1.5 + (s.people / max) * 16;
  }
  const edgeStyle = {
    ...style,
    ...(flowWidth ? { strokeWidth: flowWidth, strokeOpacity: 0.55, stroke: "var(--fe-accent)" } : {}),
    ...(conn === "indirect" ? { strokeDasharray: "6 5" } : {}),
    ...(conn === "none" ? { strokeDasharray: "2 4", opacity: 0.55 } : {}),
  };
  return (
    <>
      {/* Grot strzałki skaluje się z grubością linii, więc w warstwie przepływu go pomijamy. */}
      <BaseEdge id={id} path={path} markerEnd={flowWidth ? undefined : markerEnd} style={edgeStyle} />
      {mode === "analyze" && layers.numbers && s && conn !== "none" && (
        <EdgeLabelRenderer>
          <div
            className={`edge-label nodrag nopan ${s.estimated ? "est" : ""}`}
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
            title={
              s.estimated
                ? "Szacunek – co najmniej jeden węzeł ma tylko dane ręczne"
                : conn === "indirect"
                  ? "Osoby, które po A trafiły kiedykolwiek do B (z pominięciem kroków)"
                  : "Osoby, dla których B było następnym krokiem po A"
            }
          >
            {n(s.people)}
            <b>{pct(s.rate)}</b>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
