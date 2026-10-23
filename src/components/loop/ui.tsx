"use client";

import { useEffect, useState } from "react";
import { Mail, AlertTriangle, Check, CircleCheck, Eye, Megaphone, Plug, Repeat, ShoppingCart, TrendingDown, Wallet } from "lucide-react";

/* ---------- formatowanie ---------- */

/** Liczba całkowita z odstępem tysięcy zawsze (także 6 000 – pl-PL grupuje dopiero od 10 000). */
const int = (n: number) => String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
export const zl = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${v < 0 && Math.round(v) !== 0 ? "−" : ""}${int(v)} zł`);
export const zlSigned = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : Math.round(v) === 0 ? "0 zł" : `${v > 0 ? "+" : "−"}${int(v)} zł`;
const RATE = new Set(["ctr", "cr", "e_open", "e_ctor", "e_cr"]);
export const isRateKey = (key: string | null | undefined) => !!key && RATE.has(key);
export const fm = (key: string | null | undefined, v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—"
  : isRateKey(key) ? `${(v * 100).toLocaleString("pl-PL", { maximumFractionDigits: 2 })}%`
  : key === "e_list" ? `${formatAmount(Math.round(v))} os.`
  : key === "e_freq" ? `${v.toLocaleString("pl-PL", { maximumFractionDigits: 1 })} / mies.`
  : `${formatAmount(Math.round(v * 100) / 100)} zł`;
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

/** Wykres celu: profit narastająco, gdzie powinieneś być dziś, ile dni zostało i ile brakuje na koniec. */
export function GoalChart({ g }: { g: GoalGap }) {
  const w = 720, h = 280, pl = 10, pr = 120, pt = 34, pb = 26;
  const n = Math.max(2, g.totalDays);
  const last = g.series.length - 1;
  const now = last >= 0 ? g.series[last].cum : 0;
  const ideal = g.target * (Math.max(1, g.elapsed) / n);
  const fc = g.forecast;
  const vals = [0, g.target, now, ideal, fc ?? 0, ...g.series.map((s) => s.cum)];
  const max = Math.max(...vals) * 1.08 || 1;
  const min = Math.min(0, ...vals);
  const x = (i: number) => pl + (i / (n - 1)) * (w - pl - pr);
  const y = (v: number) => pt + (1 - (v - min) / (max - min || 1)) * (h - pt - pb);
  const xi = x(Math.max(0, last));
  const behind = ideal - now;
  const short = fc != null ? g.target - fc : null;
  const lbl = (v: number) => zl(v);
  return (
    <figure className="gc2">
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" role="img" aria-label="Postęp do celu">
        {/* zostało dni */}
        {g.left > 0 && <rect x={xi} y={pt - 10} width={x(n - 1) - xi} height={h - pt - pb + 10} className="gc2-left" rx={8} />}
        {g.left > 0 && <text x={(xi + x(n - 1)) / 2} y={pt + 6} textAnchor="middle" className="gc2-days">zostało {g.left} dni</text>}
        <line x1={pl} x2={x(n - 1)} y1={y(0)} y2={y(0)} className="gc-zero" />
        <line x1={x(0)} y1={y(0)} x2={x(n - 1)} y2={y(g.target)} className="gc-path" />
        {last >= 0 && fc != null && <line x1={xi} y1={y(now)} x2={x(n - 1)} y2={y(fc)} className="gc-ghost" />}
        {last >= 0 && <polyline points={g.series.map((s, i) => `${x(i)},${y(s.cum)}`).join(" ")} className="gc-actual" />}
        {/* dziś: jesteś vs powinno być */}
        {last >= 0 && behind > 0 && <line x1={xi} x2={xi} y1={y(ideal)} y2={y(now)} className="gc2-gap" />}
        {last >= 0 && <circle cx={xi} cy={y(ideal)} r={6} className="gc2-ideal" />}
        {last >= 0 && <circle cx={xi} cy={y(now)} r={7} className="gc-dot" />}
        {last >= 0 && <text x={xi - 10} y={y(ideal) - 10} textAnchor="end" className="gc2-t ideal">powinno być {lbl(ideal)}</text>}
        {last >= 0 && <text x={xi - 10} y={y(now) + 20} textAnchor="end" className="gc2-t now">jesteś tu {lbl(now)}</text>}
        {/* koniec okresu: cel vs prognoza */}
        <circle cx={x(n - 1)} cy={y(g.target)} r={7} className="gc2-target" />
        <text x={x(n - 1) + 12} y={y(g.target) + 4} className="gc2-t target">cel {lbl(g.target)}</text>
        {fc != null && <circle cx={x(n - 1)} cy={y(fc)} r={5} className="gc2-fc" />}
        {short != null && short > 0 && (
          <>
            <line x1={x(n - 1) + 4} x2={x(n - 1) + 4} y1={y(g.target)} y2={y(fc!)} className="gc2-gap" />
            <text x={x(n - 1) + 12} y={(y(g.target) + y(fc!)) / 2 + 4} className="gc2-t miss">brakuje {lbl(short)}</text>
          </>
        )}
      </svg>
      <figcaption className="gc-legend">
        <span><i className="k-actual" /> Twój profit</span>
        <span><i className="k-path" /> Tempo do celu</span>
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

/** Słupki profitu (dodatnie zielone, ujemne miedziane) z kwotami; przy wielu dniach – przewijane. */
export function ProfitBars({ items, height = 170 }: { items: { label: string; value: number }[]; height?: number }) {
  const max = Math.max(1, ...items.map((i) => Math.abs(i.value)));
  const hasNeg = items.some((i) => i.value < 0);
  const many = items.length > 16;
  const short = (v: number) => (Math.abs(v) >= 10000 ? `${(v / 1000).toLocaleString("pl-PL", { maximumFractionDigits: 0 })} tys.` : Math.abs(v) >= 1000 && many ? `${(v / 1000).toLocaleString("pl-PL", { maximumFractionDigits: 1 })} tys.` : zl(v).replace(" zł", many ? "" : " zł"));
  return (
    <div className={`pbs2 ${many ? "many" : ""}`} style={{ ["--h" as string]: `${height}px`, ["--n" as string]: items.length }}>
      <div className="pbs2-scroll">
        <div className={`pbs2-plot ${hasNeg ? "neg" : ""}`}>
          {items.map((it, i) => {
            const h = (Math.abs(it.value) / max) * 100;
            return (
              <div key={it.label + i} className="pbs2-col" title={`${it.label}: ${zl(it.value)}`}>
                <div className="pbs2-up">{it.value >= 0 && <><span>{short(it.value)}</span><i className="pos" style={{ height: `${h}%` }} /></>}</div>
                {hasNeg && <div className="pbs2-down">{it.value < 0 && <><i className="neg" style={{ height: `${h}%` }} /><span>{short(it.value)}</span></>}</div>}
              </div>
            );
          })}
        </div>
        <div className="pbs2-x">{items.map((it, i) => <span key={it.label + i}>{it.label}</span>)}</div>
      </div>
      {many && <div className="pbs-x"><span>przewiń w bok · kwoty w zł</span><span>suma {zl(items.reduce((a, x) => a + x.value, 0))}</span></div>}
    </div>
  );
}

const GAP_CATS: { key: string; icon: typeof AlertTriangle; label: string; test: RegExp; effect: string; always?: boolean }[] = [
  { key: "maile", icon: Mail, label: "Maile", test: /maila|maili/i, effect: "brak zł z maili" },
  { key: "sprzedaz", icon: ShoppingCart, label: "Sprzedaż", test: /WooCommerce|zamówie/i, effect: "przychód niepełny", always: true },
  { key: "reklamy", icon: Megaphone, label: "Reklamy", test: /reklam|Meta/i, effect: "profit zawyżony", always: true },
  { key: "koszty", icon: Wallet, label: "Koszty firmy", test: /kosztów stałych/i, effect: "profit zawyżony", always: true },
  { key: "ruch", icon: Eye, label: "Kliknięcia", test: /wyświetlenia i kliknięcia/i, effect: "brak CPM i CTR" },
  { key: "ltv", icon: Repeat, label: "Dokupienia", test: /LTV/i, effect: "liczę sam koszyk" },
];

/** Luki w danych jako tablica statusów: ikona, ✓ albo !, szczegóły po kliknięciu. */
export function DataGaps({ gaps, extra }: { gaps: string[]; extra?: string[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const used = new Set<string>();
  const tiles = GAP_CATS.map((c) => {
    const hits = gaps.filter((g) => !used.has(g) && c.test.test(g));
    hits.forEach((h) => used.add(h));
    return { ...c, hits };
  }).filter((c) => c.always || c.hits.length);
  const rest = gaps.filter((g) => !used.has(g));
  if (rest.length) tiles.push({ key: "inne", icon: Plug, label: "Inne źródła", test: /./, effect: "dane niepełne", hits: rest });
  const bad = tiles.filter((t) => t.hits.length).length;
  const sel = tiles.find((t) => t.key === open);
  return (
    <div className={`ds ${bad ? "bad" : "ok"}`}>
      <div className="ds-head">
        {bad ? <AlertTriangle size={20} /> : <CircleCheck size={20} />}
        <b>{bad ? "Luki w danych" : "Dane kompletne"}</b>
        <span className="ds-score">{tiles.length - bad}/{tiles.length} OK</span>
      </div>
      <div className="ds-tiles">
        {tiles.map((t) => {
          const I = t.icon;
          const ok = !t.hits.length;
          return (
            <button key={t.key} className={`ds-t ${ok ? "ok" : "bad"} ${open === t.key ? "on" : ""}`} onClick={() => setOpen(ok || open === t.key ? null : t.key)} disabled={ok}>
              <span className="ds-ic"><I size={22} /><i>{ok ? <Check size={12} /> : "!"}</i></span>
              <b>{t.label}</b>
              <small>{ok ? "OK" : t.effect}</small>
            </button>
          );
        })}
        {(extra ?? []).map((x) => (
          <div key={x} className="ds-t bn"><span className="ds-ic"><TrendingDown size={22} /></span><b>Wąskie gardło</b><small>{x.replace(/^Wąskie gardło[^:]*:\s*/, "").replace(/ –.*$/, "").replace(/\.$/, "")}</small></div>
        ))}
      </div>
      {sel && <ul className="ds-detail">{sel.hits.map((h) => <li key={h}>{h}</li>)}</ul>}
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
