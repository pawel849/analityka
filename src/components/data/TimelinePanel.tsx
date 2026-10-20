"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { AutoEvent, MonthRow } from "@/lib/economics";
import { api } from "../forms";

interface ManualEvent {
  id: string;
  day: string;
  type: string;
  title: string;
  description: string;
  source: string;
  link: string;
  confidence: "data" | "email" | "memory" | "gap";
}
interface TL {
  manual: ManualEvent[];
  auto: AutoEvent[];
  series: MonthRow[];
  currency: string;
}

const TYPES = ["decyzja", "cena", "oferta", "lejek", "kampania", "kreacja", "budżet", "mailing", "produkt", "problem", "brak danych"];
const CONF: Record<ManualEvent["confidence"], string> = {
  data: "potwierdzone w danych",
  email: "z maila / dokumentu",
  memory: "z pamięci",
  gap: "brak danych",
};
const CONF_TAG: Record<string, string> = { data: "tag-data", email: "tag-interp", memory: "tag-assumption", gap: "tag-gap", auto: "tag-data" };

type Item = (ManualEvent | (AutoEvent & { id: string; confidence: "auto"; source: string; link: string })) & { auto?: boolean };

const money = (v: number, cur: string) => `${v.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} ${cur}`;

function Chart({ series, events, cur, selected }: { series: MonthRow[]; events: Item[]; cur: string; selected: string | null }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!series.length) return <p className="hint">Brak danych miesięcznych – zaimportuj zamówienia i reklamy.</p>;
  const w = 900;
  const h = 200;
  const max = Math.max(1, ...series.map((r) => Math.max(r.gross, r.spend)));
  const step = w / series.length;
  const x = (i: number) => (i + 0.5) * step;
  const y = (v: number) => h - (v / max) * (h - 10);
  const idx = new Map(series.map((r, i) => [r.month, i]));
  const path = (k: "gross" | "spend") => series.map((r, i) => `${x(i)},${y(r[k])}`).join(" ");
  return (
    <div style={{ position: "relative" }}>
      <div className="row" style={{ gap: 14, marginBottom: 4 }}>
        <span className="hint"><i style={{ display: "inline-block", width: 14, height: 2, background: "#1fd38a", verticalAlign: "middle" }} /> przychód brutto</span>
        <span className="hint"><i style={{ display: "inline-block", width: 14, height: 2, background: "#ff8a5c", verticalAlign: "middle" }} /> wydatki reklamowe</span>
        <span className="hint"><i style={{ display: "inline-block", width: 2, height: 10, background: "var(--muted)", verticalAlign: "middle" }} /> zdarzenie</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h + 20}`} width="100%" role="img" aria-label="Przychód i wydatki miesięcznie ze zdarzeniami">
        <line x1={0} x2={w} y1={h} y2={h} stroke="var(--border)" />
        {events.map((e) => {
          const i = idx.get(e.day.slice(0, 7));
          if (i == null) return null;
          const on = selected === e.id;
          return <line key={e.id} x1={x(i)} x2={x(i)} y1={0} y2={h} stroke={on ? "var(--accent)" : "var(--muted)"} strokeWidth={on ? 2 : 1} strokeDasharray={on ? undefined : "3 3"} opacity={on ? 1 : 0.6} />;
        })}
        <polyline points={path("gross")} fill="none" stroke="#1fd38a" strokeWidth={2} strokeLinejoin="round" />
        <polyline points={path("spend")} fill="none" stroke="#ff8a5c" strokeWidth={2} strokeLinejoin="round" />
        {series.map((r, i) => (
          <rect key={r.month} x={i * step} y={0} width={step} height={h} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
        ))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={h} stroke="var(--text)" strokeWidth={1} pointerEvents="none" />}
        {series.map((r, i) => (i % Math.ceil(series.length / 12) === 0 ? <text key={r.month} x={x(i)} y={h + 15} fontSize={11} textAnchor="middle" fill="var(--muted)">{r.month}</text> : null))}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${((hover + 0.5) / series.length) * 100}%` }}>
          <b>{series[hover].month}</b>
          <br />Przychód: {money(series[hover].gross, cur)}
          <br />Wydatki: {money(series[hover].spend, cur)}
          {events.filter((e) => e.day.slice(0, 7) === series[hover].month).slice(0, 3).map((e) => <div key={e.id}>• {e.title}</div>)}
        </div>
      )}
    </div>
  );
}

export function TimelinePanel({ projectId }: { projectId: string }) {
  const [d, setD] = useState<TL | null>(null);
  const [form, setForm] = useState({ day: new Date().toISOString().slice(0, 10), type: "decyzja", title: "", description: "", source: "", link: "", confidence: "data" });
  const [showAuto, setShowAuto] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => {
    api<TL>(`/api/projects/${projectId}/timeline`).then(setD).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [projectId]);
  useEffect(load, [load]);

  const items: Item[] = useMemo(() => {
    if (!d) return [];
    const auto = showAuto
      ? d.auto.map((e, i) => ({ ...e, id: `auto_${i}`, confidence: "auto" as const, source: "wykryte w danych", link: "", auto: true }))
      : [];
    return [...d.manual, ...auto].sort((a, b) => a.day.localeCompare(b.day));
  }, [d, showAuto]);

  function exportMd() {
    const lines = ["# Dziennik zmian", "", `Wygenerowano: ${new Date().toISOString().slice(0, 10)}`, ""];
    let month = "";
    for (const e of items) {
      const m = e.day.slice(0, 7);
      if (m !== month) {
        lines.push("", `## ${m}`, "");
        month = m;
      }
      const conf = e.confidence === "auto" ? "wykryte w danych" : CONF[e.confidence];
      lines.push(`- **${e.day}** [${e.type}] ${e.title} _(${conf})_`);
      if (e.description) lines.push(`  ${e.description.replace(/\n/g, "\n  ")}`);
      if (e.source || e.link) lines.push(`  Źródło: ${[e.source, e.link].filter(Boolean).join(" – ")}`);
    }
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dziennik-zmian.md";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  if (err) return <p className="error">{err}</p>;
  if (!d) return <p className="hint">Wczytuję…</p>;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Oś czasu</h2>
        <div className="row">
          <label className="row hint" style={{ gap: 4 }}>
            <input type="checkbox" checked={showAuto} onChange={(e) => setShowAuto(e.target.checked)} /> pokaż zdarzenia wykryte w danych
          </label>
          <button className="btn small" onClick={exportMd} disabled={!items.length}>Eksport dziennika (.md)</button>
        </div>
      </div>

      <div className="card">
        <Chart series={d.series} events={items} cur={d.currency} selected={selected} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "minmax(280px, 1fr) minmax(320px, 2fr)", marginTop: 12 }}>
        <form
          className="card"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api(`/api/projects/${projectId}/timeline`, "POST", form);
              setForm({ ...form, title: "", description: "", link: "" });
              load();
            } catch (e2) {
              setErr(e2 instanceof Error ? e2.message : String(e2));
            }
          }}
        >
          <h3>Dodaj zdarzenie</h3>
          <div style={{ display: "grid", gap: 8 }}>
            <label className="field">Data<input type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} required /></label>
            <label className="field">
              Typ
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
            </label>
            <label className="field">Co się stało<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required placeholder="np. Obniżka ceny kursu do 297 zł" /></label>
            <label className="field">Szczegóły / cytat źródłowy<textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <label className="field">Źródło<input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="np. mail od klienta, spotkanie" /></label>
            <label className="field">Link<input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="https://…" /></label>
            <label className="field">
              Pewność
              <select value={form.confidence} onChange={(e) => setForm({ ...form, confidence: e.target.value })}>
                {Object.entries(CONF).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <button className="btn primary">Dodaj</button>
          </div>
        </form>

        <div className="card">
          <h3>Zdarzenia ({items.length})</h3>
          {!items.length && <p className="hint">Brak zdarzeń.</p>}
          <div style={{ maxHeight: 520, overflowY: "auto" }}>
            {items.map((e) => (
              <div key={e.id} className={`tl-item ${selected === e.id ? "on" : ""}`} onMouseEnter={() => setSelected(e.id)} onMouseLeave={() => setSelected(null)}>
                <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                  <div>
                    <b>{e.day}</b> <span className="badge">{e.type}</span>{" "}
                    <span className={`tag ${CONF_TAG[e.confidence]}`}>{e.confidence === "auto" ? "wykryte w danych" : CONF[e.confidence as ManualEvent["confidence"]]}</span>
                  </div>
                  {!e.auto && (
                    <button
                      className="btn small"
                      title="Usuń"
                      onClick={async () => {
                        await api(`/api/projects/${projectId}/timeline?event=${e.id}`, "DELETE");
                        load();
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
                <div>{e.title}</div>
                {e.description && <div className="hint" style={{ whiteSpace: "pre-wrap" }}>{e.description}</div>}
                {(e.source || e.link) && (
                  <div className="hint">
                    {e.source}
                    {e.link && (
                      <>
                        {e.source ? " – " : ""}
                        <a href={e.link} target="_blank" rel="noreferrer">link</a>
                      </>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
