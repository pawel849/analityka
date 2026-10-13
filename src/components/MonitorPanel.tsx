"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { formatValue } from "@/lib/analysis";
import { api } from "./forms";

interface Row {
  value: string;
  people: number;
}
interface MonitorData {
  from: string;
  to: string;
  truncated: boolean;
  totals: { visitors: number; leads: number; sales: number; revenue: number; conv: number | null };
  daily: { day: string; visitors: number; leads: number; sales: number; revenue: number }[];
  pages: Row[];
  sources: Row[];
  countries: { country: string; people: number }[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const METRICS = [
  { key: "visitors", label: "Odwiedzający", format: "number" },
  { key: "leads", label: "Leady", format: "number" },
  { key: "sales", label: "Sprzedaże", format: "number" },
  { key: "revenue", label: "Przychód", format: "money" },
] as const;
type MetricKey = (typeof METRICS)[number]["key"];

/** Wykres słupkowy dzienny z podpowiedzią po najechaniu. */
function DailyBars({ data, metric }: { data: MonitorData["daily"]; metric: MetricKey }) {
  const [hover, setHover] = useState<number | null>(null);
  const values = data.map((d) => d[metric]);
  const max = Math.max(1, ...values);
  const w = 720;
  const h = 160;
  const bw = w / Math.max(values.length, 1);
  const fmt = METRICS.find((m) => m.key === metric)!.format;
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${w} ${h + 18}`} width="100%" role="img" aria-label="Wykres dzienny">
        <line x1={0} y1={h} x2={w} y2={h} stroke="var(--border)" />
        {values.map((v, i) => {
          const bh = (v / max) * (h - 8);
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={i * bw} y={0} width={bw} height={h} fill="transparent" />
              <rect
                x={i * bw + 1}
                y={h - bh}
                width={Math.max(bw - 2, 1)}
                height={bh}
                rx={Math.min(4, bw / 3)}
                fill="var(--accent)"
                opacity={hover === null || hover === i ? 1 : 0.45}
              />
            </g>
          );
        })}
        <text x={0} y={h + 14} fontSize={11} fill="var(--muted)">{data[0]?.day}</text>
        <text x={w} y={h + 14} fontSize={11} fill="var(--muted)" textAnchor="end">{data[data.length - 1]?.day}</text>
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${((hover + 0.5) / values.length) * 100}%` }}>
          <b>{data[hover].day}</b>
          <br />
          {formatValue(values[hover], fmt)}
        </div>
      )}
    </div>
  );
}

function TopList({ title, rows }: { title: string; rows: Row[] }) {
  const max = Math.max(1, ...rows.map((r) => r.people));
  return (
    <div className="card">
      <h3>{title}</h3>
      {rows.length === 0 && <p className="hint">Brak danych.</p>}
      {rows.map((r) => (
        <div key={r.value} className="toplist-row" title={r.value}>
          <span className="toplist-bar" style={{ width: `${(r.people / max) * 100}%` }} />
          <span className="toplist-label">{r.value}</span>
          <span className="toplist-val">{formatValue(r.people, "number")}</span>
        </div>
      ))}
    </div>
  );
}

export function MonitorPanel({ projectId }: { projectId: string }) {
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<MetricKey>("visitors");
  const [data, setData] = useState<MonitorData | null>(null);
  const [err, setErr] = useState("");
  const range = useMemo(() => ({ from: iso(new Date(Date.now() - (days - 1) * 86400_000)), to: iso(new Date()) }), [days]);

  const load = useCallback(() => {
    setErr("");
    api<MonitorData>(`/api/projects/${projectId}/monitor?from=${range.from}&to=${range.to}`)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [projectId, range]);
  useEffect(load, [load]);

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Monitor</h2>
        <div className="row">
          {[7, 30, 90].map((d) => (
            <button key={d} className={`btn small ${days === d ? "primary" : ""}`} onClick={() => setDays(d)}>{d} dni</button>
          ))}
          <button className="btn small" onClick={load}>Odśwież</button>
        </div>
      </div>
      {err && <div className="error">{err}</div>}
      {data && (
        <>
          <div className="kpi-row">
            {METRICS.map((m) => (
              <button key={m.key} className={`kpi ${metric === m.key ? "on" : ""}`} onClick={() => setMetric(m.key)}>
                <span className="hint">{m.label}</span>
                <b>{formatValue(data.totals[m.key], m.format)}</b>
              </button>
            ))}
            <div className="kpi">
              <span className="hint">Konwersja na sprzedaż</span>
              <b>{formatValue(data.totals.conv, "percent")}</b>
            </div>
          </div>
          <div className="card" style={{ marginTop: 12 }}>
            <h3>{METRICS.find((m) => m.key === metric)!.label} dziennie</h3>
            <DailyBars data={data.daily} metric={metric} />
          </div>
          <div className="grid" style={{ marginTop: 12 }}>
            <TopList title="Strony" rows={data.pages} />
            <TopList title="Źródła" rows={data.sources} />
            <TopList title="Kraje" rows={data.countries.map((c) => ({ value: c.country === "??" ? "Nieznany" : c.country, people: c.people }))} />
          </div>
          {data.truncated && <p className="error">Za dużo zdarzeń – policzono pierwsze 300 000. Wybierz krótszy zakres.</p>}
        </>
      )}
    </div>
  );
}
