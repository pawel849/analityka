"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CircleCheck } from "lucide-react";

/* ---------- formatowanie ---------- */

/** Liczba całkowita z odstępem tysięcy zawsze (także 6 000 – pl-PL grupuje dopiero od 10 000). */
const int = (n: number) => String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
export const zl = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${v < 0 && Math.round(v) !== 0 ? "−" : ""}${int(v)} zł`);
export const zlSigned = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : Math.round(v) === 0 ? "0 zł" : `${v > 0 ? "+" : "−"}${int(v)} zł`;
export const fm = (key: string | null | undefined, v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : key === "ctr" || key === "cr" ? `${(v * 100).toLocaleString("pl-PL", { maximumFractionDigits: 2 })}%` : `${formatAmount(Math.round(v * 100) / 100)} zł`;
export const pct = (v: number | null | undefined, dd = 0) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toLocaleString("pl-PL", { maximumFractionDigits: dd })}%`);
export const range = (r: [number, number] | null | undefined) => (r ? `${zlSigned(r[0])} … ${zlSigned(r[1])}` : "—");
export const plus = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
export const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
export const daysTo = (d: string) => Math.round((Date.parse(`${d}T12:00:00`) - Date.parse(`${new Date().toISOString().slice(0, 10)}T12:00:00`)) / 864e5);

/* ---------- wpisywanie kwot: „1 000”, przecinek lub kropka jako część dziesiętna ---------- */

const groups = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
export function formatAmount(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "";
  const neg = v < 0;
  const [i, d] = Math.abs(v).toFixed(2).replace(/\.?0+$/, "").split(".");
  return `${neg ? "−" : ""}${groups(i)}${d ? `,${d}` : ""}`;
}
export function parseAmount(s: string): number | null {
  const t = s.replace(/[\s ]/g, "").replace("−", "-").replace(",", ".");
  if (!t || t === "-" || t === ".") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** Pole kwoty: samo dzieli tysiące spacją, przyjmuje przecinek i kropkę. */
export function MoneyInput({ value, onChange, unit = "zł", allowNegative, big, ariaLabel }: {
  value: number | null; onChange: (v: number | null) => void; unit?: string; allowNegative?: boolean; big?: boolean; ariaLabel?: string;
}) {
  const [raw, setRaw] = useState(formatAmount(value));
  useEffect(() => {
    if (parseAmount(raw) !== value) setRaw(formatAmount(value));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const change = (s: string) => {
    let t = s.replace(/[^\d,.\-−\s ]/g, "");
    if (!allowNegative) t = t.replace(/[-−]/g, "");
    const neg = /^[-−]/.test(t.trim());
    const body = t.replace(/[-−\s ]/g, "");
    const [i, ...rest] = body.split(/[,.]/);
    const dec = rest.length ? `,${rest.join("").slice(0, 2)}` : "";
    const next = `${neg ? "−" : ""}${groups(i ?? "")}${dec}`;
    setRaw(next);
    onChange(parseAmount(next));
  };
  return (
    <label className={`mi ${big ? "big" : ""}`}>
      <input inputMode="decimal" value={raw} onChange={(e) => change(e.target.value)} aria-label={ariaLabel ?? "Kwota"} />
      <span>{unit}</span>
    </label>
  );
}

/* ---------- wykres celu: profit narastająco vs ścieżka do celu ---------- */

export interface GoalGap {
  goal: { period: string; date_from: string; date_to: string; profit_target: number };
  series: { day: string; cum: number }[];
  achieved: number;
  totalDays: number;
  elapsed: number;
  left: number;
  target: number;
  gap: number;
  needPerDay: number;
  needFromNow: number | null;
  pacePerDay: number | null;
  forecast: number | null;
  gaps: string[];
}

export function GoalChart({ g }: { g: GoalGap }) {
  const w = 640, h = 220, pad = 8;
  const n = g.totalDays;
  const vals = [0, g.target, ...g.series.map((s) => s.cum), g.forecast ?? 0];
  const max = Math.max(...vals) * 1.08 || 1;
  const min = Math.min(0, ...vals);
  const x = (i: number) => pad + (i / Math.max(1, n - 1)) * (w - pad * 2);
  const y = (v: number) => h - pad - ((v - min) / (max - min || 1)) * (h - pad * 2);
  const last = g.series.length - 1;
  const actual = g.series.map((s, i) => `${x(i)},${y(s.cum)}`).join(" ");
  return (
    <figure className="gc">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Profit narastająco vs cel">
        <line x1={pad} x2={w - pad} y1={y(0)} y2={y(0)} className="gc-zero" />
        <line x1={pad} x2={w - pad} y1={y(g.target)} y2={y(g.target)} className="gc-target" />
        <line x1={x(0)} y1={y(0)} x2={x(n - 1)} y2={y(g.target)} className="gc-path" />
        {last >= 0 && g.forecast != null && <line x1={x(last)} y1={y(g.series[last].cum)} x2={x(n - 1)} y2={y(g.forecast)} className="gc-ghost" />}
        {last >= 0 && <polyline points={actual} className="gc-actual" />}
        {last >= 0 && <circle cx={x(last)} cy={y(g.series[last].cum)} r={5} className="gc-dot" />}
        <text x={w - pad} y={y(g.target) - 6} textAnchor="end" className="gc-lbl">cel {zl(g.target)}</text>
      </svg>
      <figcaption className="gc-legend">
        <span><i className="k-actual" /> Twój profit</span>
        <span><i className="k-path" /> Tempo potrzebne do celu</span>
        <span><i className="k-ghost" /> Jeśli utrzymasz tempo</span>
      </figcaption>
    </figure>
  );
}

/** Tempo dzienne: ile robisz vs ile trzeba – dwa paski. */
export function PaceBars({ pace, need }: { pace: number | null; need: number | null }) {
  const max = Math.max(1, Math.abs(pace ?? 0), Math.abs(need ?? 0));
  const ok = pace != null && need != null && pace >= need;
  return (
    <div className="pb">
      <div className="pb-row">
        <span>Zarabiasz dziennie</span>
        <div className="pb-track"><i className={`pb-fill ${ok ? "ok" : "low"}`} style={{ width: `${(Math.max(0, pace ?? 0) / max) * 100}%` }} /></div>
        <b>{zl(pace)}</b>
      </div>
      <div className="pb-row">
        <span>Potrzeba dziennie od dziś</span>
        <div className="pb-track"><i className="pb-fill need" style={{ width: `${(Math.max(0, need ?? 0) / max) * 100}%` }} /></div>
        <b>{zl(need)}</b>
      </div>
    </div>
  );
}

/** Słupki profitu (dodatnie zielone, ujemne miedziane) z kwotami; przy wielu słupkach kwoty w dymku. */
export function ProfitBars({ items, height = 170 }: { items: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  const hasNeg = items.some((i) => i.value < 0);
  const showNums = items.length <= 16;
  const short = (v: number) => (Math.abs(v) >= 10000 ? `${(v / 1000).toLocaleString("pl-PL", { maximumFractionDigits: 0 })} tys.` : zl(v));
  return (
    <div className={`pbs2 ${showNums ? "nums" : ""}`} style={{ ["--h" as string]: `${height}px` }}>
      <div className={`pbs2-plot ${hasNeg ? "neg" : ""}`}>
        {items.map((it, i) => {
          const h = (Math.abs(it.value) / max) * 100;
          return (
            <div key={it.label + i} className="pbs2-col" title={`${it.label}: ${zl(it.value)}`}>
              <div className="pbs2-up">{it.value >= 0 && <>{showNums && <span>{short(it.value)}</span>}<i className="pos" style={{ height: `${h}%` }} /></>}</div>
              {hasNeg && <div className="pbs2-down">{it.value < 0 && <><i className="neg" style={{ height: `${h}%` }} />{showNums && <span>{short(it.value)}</span>}</>}</div>}
            </div>
          );
        })}
      </div>
      {showNums ? (
        <div className="pbs2-x">{items.map((it, i) => <span key={it.label + i}>{it.label}</span>)}</div>
      ) : (
        <div className="pbs-x"><span>{items[0]?.label}</span><span>suma {zl(items.reduce((a, x) => a + x.value, 0))}</span><span>{items[items.length - 1]?.label}</span></div>
      )}
    </div>
  );
}

/** Luki w danych – wyeksponowane. */
export function DataGaps({ gaps, extra }: { gaps: string[]; extra?: string[] }) {
  const all = [...(extra ?? []), ...gaps];
  if (!all.length)
    return <div className="dg ok"><CircleCheck size={20} /> <b>Dane kompletne</b> – liczymy wszystko.</div>;
  return (
    <div className="dg">
      <div className="dg-head"><AlertTriangle size={20} /> <b>Luki w danych</b> <span>{all.length}</span></div>
      <ul>{all.map((x) => <li key={x}>{x}</li>)}</ul>
    </div>
  );
}

/** Tekst Claude: „## nagłówki” i „- punkty”. */
export function RichText({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) blocks.push(<ul key={`u${blocks.length}`}>{list.map((l, i) => <li key={i}>{l}</li>)}</ul>);
    list = [];
  };
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) { flush(); continue; }
    if (t.startsWith("## ") || t.startsWith("# ")) { flush(); blocks.push(<h3 key={`h${blocks.length}`}>{t.replace(/^#+\s*/, "")}</h3>); continue; }
    if (/^[-•*]\s+/.test(t)) { list.push(t.replace(/^[-•*]\s+/, "").replace(/\*\*/g, "")); continue; }
    flush();
    blocks.push(<p key={`p${blocks.length}`}>{t.replace(/\*\*/g, "")}</p>);
  }
  flush();
  return <div className="rt">{blocks}</div>;
}
