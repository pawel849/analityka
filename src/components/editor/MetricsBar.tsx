"use client";
import { useState } from "react";
import { formatValue, TOTAL_LABELS, type Totals } from "@/lib/analysis";
import type { FullAnalysis } from "@/lib/funnel-analysis";
import { api } from "../forms";
import { Delta } from "./parts";
import { delta } from "@/lib/forecast";

// Kolejność kafelków: najważniejsze metryki na początku.
const ORDER: (keyof Totals)[] = [
  "roas", "revenue", "sales", "spend", "cpl", "leads", "hook_rate", "ctr_ads", "ctr_page", "cpa", "aov", "conv_rate", "visitors", "goals", "goal_value",
];

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
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [formula, setFormula] = useState("");
  const [format, setFormat] = useState("number");
  const [err, setErr] = useState("");

  return (
    <section className="fe-metrics">
      {error && <div className="error">{error}</div>}
      {analysis?.truncated && <div className="error">Za dużo zdarzeń w zakresie – wynik policzony z pierwszych 300 000. Zawęź zakres dat.</div>}
      <div className="tiles">
        {ORDER.map((k) => (
          <div className="tile" key={k}>
            <div className="t-label">{TOTAL_LABELS[k].label}</div>
            <div className="t-value">{analysis ? formatValue(analysis.totals[k], TOTAL_LABELS[k].format) : loading ? "…" : "—"}</div>
            {compare && analysis && (
              <div className="t-prev">
                <Delta value={delta(analysis.totals[k], compare.totals[k])} /> <span>poprz. {formatValue(compare.totals[k], TOTAL_LABELS[k].format)}</span>
              </div>
            )}
          </div>
        ))}
        {analysis?.custom.map((m) => (
          <div className="tile" key={m.id} title={m.formula}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="t-label">{m.name}</div>
              {!readOnly && <button
                className="btn small"
                style={{ padding: "0 6px" }}
                title="Usuń metrykę"
                onClick={async () => {
                  if (!confirm(`Usunąć metrykę „${m.name}”?`)) return;
                  await api(`/api/funnels/${funnelId}/metrics?metric=${m.id}`, "DELETE");
                  onChanged();
                }}
              >
                ×
              </button>}
            </div>
            <div className="t-value">{formatValue(m.value, m.format)}</div>
            {m.error ? <div className="t-err">{m.error}</div> : <div className="t-formula">{m.formula}</div>}
          </div>
        ))}
        {!readOnly && <button className="tile btn" onClick={() => setAdding(!adding)} style={{ textAlign: "left" }}>
          <div className="t-label">Własna metryka</div>
          <div className="t-value">+</div>
        </button>}
      </div>

      {adding && (
        <form
          style={{ marginTop: 10, display: "grid", gap: 8 }}
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
            <input placeholder='Wzór, np. revenue - spend' value={formula} onChange={(e) => setFormula(e.target.value)} style={{ flex: 1, minWidth: 220, fontFamily: "var(--mono)" }} />
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
      {analysis && (
        <div className="hint" style={{ marginTop: 6 }}>
          Zakres {analysis.from} – {analysis.to} · zdarzeń: {analysis.eventCount.toLocaleString("pl-PL")}
        </div>
      )}
    </section>
  );
}
