"use client";
import { useEffect, useState } from "react";
import { formatValue, TOTAL_LABELS, type Totals } from "@/lib/analysis";
import type { FullAnalysis } from "@/lib/funnel-analysis";
import { api } from "../forms";
import { Delta } from "./parts";
import { delta } from "@/lib/forecast";

// Metryki w grupach (tabelki) – kolejność w grupie = ważność.
const GROUPS: { title: string; keys: (keyof Totals)[] }[] = [
  { title: "Sprzedaż", keys: ["revenue", "sales", "aov", "conv_rate"] },
  { title: "Reklamy", keys: ["spend", "roas", "cpa", "cpl", "hook_rate", "ctr_ads", "impressions", "clicks"] },
  { title: "Ruch i cele", keys: ["visitors", "pageviews", "ctr_page", "leads", "goals", "goal_value"] },
];
// Zawsze widoczne w nagłówku (także po zwinięciu).
const HEADLINE: (keyof Totals)[] = ["roas", "revenue", "spend", "sales"];
const OPEN_KEY = "anl_metrics_open";

export function MetricsBar({
  funnelId,
  analysis,
  compare,
  loading,
  error,
  onChanged,
  readOnly = false,
}: {
  funnelId: string;
  analysis: FullAnalysis | null;
  compare?: FullAnalysis | null;
  readOnly?: boolean;
  loading: boolean;
  error: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [formula, setFormula] = useState("");
  const [format, setFormat] = useState("number");
  const [err, setErr] = useState("");

  useEffect(() => {
    try {
      if (localStorage.getItem(OPEN_KEY) === "0") setOpen(false);
    } catch {
      /* brak pamięci przeglądarki */
    }
  }, []);
  const toggle = () =>
    setOpen((v) => {
      try {
        localStorage.setItem(OPEN_KEY, v ? "0" : "1");
      } catch {
        /* brak pamięci przeglądarki */
      }
      return !v;
    });

  const value = (k: keyof Totals) => (analysis ? formatValue(analysis.totals[k], TOTAL_LABELS[k].format) : loading ? "…" : "—");

  return (
    <section className={`fe-metrics ${open ? "open" : "closed"}`}>
      <div className="m-head">
        <button className="m-toggle" onClick={toggle} aria-expanded={open} title={open ? "Zwiń metryki" : "Rozwiń metryki"}>
          {open ? "▾" : "▴"} Metryki lejka
        </button>
        <div className="m-headline">
          {HEADLINE.map((k) => (
            <span key={k}>
              <span className="hint">{TOTAL_LABELS[k].label}</span> <b>{value(k)}</b>
              {compare && analysis && <Delta value={delta(analysis.totals[k], compare.totals[k])} />}
            </span>
          ))}
        </div>
        {analysis && (
          <span className="hint m-range">
            {analysis.from} – {analysis.to} · zdarzeń: {analysis.eventCount.toLocaleString("pl-PL")}
          </span>
        )}
      </div>
      {error && <div className="error">{error}</div>}
      {analysis?.truncated && <div className="error">Za dużo zdarzeń w zakresie – wynik policzony z pierwszych 300 000. Zawęź zakres dat.</div>}

      {open && (
        <div className="m-body">
          <div className="m-groups">
            {GROUPS.map((g) => (
              <table key={g.title} className="m-table">
                <thead>
                  <tr>
                    <th colSpan={compare ? 3 : 2}>{g.title}</th>
                  </tr>
                </thead>
                <tbody>
                  {g.keys.map((k) => (
                    <tr key={k}>
                      <td>{TOTAL_LABELS[k].label}</td>
                      <td className="m-val">{value(k)}</td>
                      {compare && analysis && (
                        <td className="m-prev">
                          <Delta value={delta(analysis.totals[k], compare.totals[k])} /> <span>poprz. {formatValue(compare.totals[k], TOTAL_LABELS[k].format)}</span>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

            <table className="m-table m-custom">
              <thead>
                <tr>
                  <th colSpan={readOnly ? 2 : 3}>Własne metryki</th>
                </tr>
              </thead>
              <tbody>
                {analysis?.custom.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div>{m.name}</div>
                      {m.error ? <div className="m-err">{m.error}</div> : <div className="m-formula" title={m.formula}>{m.formula}</div>}
                    </td>
                    <td className="m-val">{formatValue(m.value, m.format)}</td>
                    {!readOnly && (
                      <td className="m-del">
                        <button
                          className="btn small"
                          title="Usuń metrykę"
                          onClick={async () => {
                            if (!confirm(`Usunąć metrykę „${m.name}”?`)) return;
                            await api(`/api/funnels/${funnelId}/metrics?metric=${m.id}`, "DELETE");
                            onChanged();
                          }}
                        >
                          ×
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {!analysis?.custom.length && (
                  <tr>
                    <td colSpan={3} className="hint">Brak – dodaj wzór, np. zysk albo konwersję między krokami.</td>
                  </tr>
                )}
                {!readOnly && (
                  <tr>
                    <td colSpan={3}>
                      <button className="btn small" onClick={() => setAdding(!adding)}>{adding ? "Anuluj" : "+ Dodaj metrykę"}</button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {adding && (
            <form
              className="m-add"
              onSubmit={async (e) => {
                e.preventDefault();
                setErr("");
                try {
                  await api(`/api/funnels/${funnelId}/metrics`, "POST", { name, formula, format });
                  setName("");
                  setFormula("");
                  setAdding(false);
                  onChanged();
                } catch (e2) {
                  setErr(e2 instanceof Error ? e2.message : String(e2));
                }
              }}
            >
              <div className="row">
                <input placeholder="Nazwa, np. Zysk" value={name} onChange={(e) => setName(e.target.value)} />
                <input placeholder="Wzór, np. revenue - spend" value={formula} onChange={(e) => setFormula(e.target.value)} style={{ flex: 1, minWidth: 220, fontFamily: "var(--mono)" }} />
                <select value={format} onChange={(e) => setFormat(e.target.value)}>
                  <option value="number">Liczba</option>
                  <option value="money">Kwota (zł)</option>
                  <option value="percent">Procent (0,25 → 25%)</option>
                  <option value="ratio">Mnożnik (×)</option>
                </select>
                <button className="btn primary small">Zapisz</button>
              </div>
              {err && <div className="error">{err}</div>}
              <div className="hint">
                Zmienne: {Object.keys(TOTAL_LABELS).map((k) => <code key={k} style={{ marginRight: 6 }}>{k}</code>)}
                <br />
                Funkcje: <code>node(&quot;Nazwa węzła&quot;, &quot;people&quot;)</code> (pola: people, pageviews, ctaClicks, ctrPage, conversions, revenue, spend, impressions, adClicks, video3s),{" "}
                <code>edge(&quot;Od&quot;, &quot;Do&quot;)</code>, <code>min()</code>, <code>max()</code>, <code>round(x, 2)</code>. Działania: + − × ÷ i nawiasy.
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
