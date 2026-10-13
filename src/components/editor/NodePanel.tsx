"use client";
import { useCallback, useEffect, useState } from "react";
import { CATALOG, CATALOG_BY_KIND, EVENT_TYPES, MANUAL_METRICS, type NodeData } from "@/lib/catalog";
import { formatValue, type NodeStats } from "@/lib/analysis";
import { api } from "../forms";
import type { FunnelNode, Mode } from "./parts";

interface ManualRow {
  id: string;
  day: string;
  metric: string;
  value: number;
}

function ManualData({ funnelId, nodeId, category, onChanged }: { funnelId: string; nodeId: string; category: NodeData["category"]; onChanged: () => void }) {
  const metrics = MANUAL_METRICS[category];
  const [rows, setRows] = useState<ManualRow[]>([]);
  const [day, setDay] = useState(new Date().toISOString().slice(0, 10));
  const [metric, setMetric] = useState(metrics[0]?.key ?? "");
  const [value, setValue] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    api<ManualRow[]>(`/api/funnels/${funnelId}/manual?node_id=${encodeURIComponent(nodeId)}`).then(setRows).catch(() => {});
  }, [funnelId, nodeId]);
  useEffect(load, [load]);

  const label = (k: string) => metrics.find((m) => m.key === k)?.label ?? k;

  return (
    <div>
      <h3>Dane ręczne</h3>
      <p className="hint">Np. dzienne wydatki i wyświetlenia z Menedżera reklam. Wartości z tego samego dnia sumują się. Pola „nadpisz” zastępują dane ze skryptu.</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setErr("");
          try {
            await api(`/api/funnels/${funnelId}/manual`, "POST", { node_id: nodeId, day, metric, value: Number(value.replace(",", ".")) });
            setValue("");
            load();
            onChanged();
          } catch (e2) {
            setErr(e2 instanceof Error ? e2.message : String(e2));
          }
        }}
      >
        <div className="manual-row">
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Dzień" />
          <input inputMode="decimal" placeholder="Wartość" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Wartość" />
        </div>
        <div className="manual-row">
          <select value={metric} onChange={(e) => setMetric(e.target.value)} aria-label="Metryka">
            {metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <button className="btn small primary" disabled={!value}>Dodaj</button>
        </div>
        {err && <div className="error">{err}</div>}
      </form>
      {rows.length > 0 && (
        <table className="tbl" style={{ marginTop: 8 }}>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.day}</td>
                <td>{label(r.metric)}</td>
                <td style={{ textAlign: "right" }}>{formatValue(Number(r.value), "number")}</td>
                <td>
                  <button
                    className="btn small"
                    title="Usuń"
                    onClick={async () => {
                      await api(`/api/funnels/${funnelId}/manual?row=${r.id}`, "DELETE");
                      load();
                      onChanged();
                    }}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function StatsView({ d, s }: { d: NodeData; s: NodeStats }) {
  const rows: [string, string][] = [["Osoby", formatValue(s.people, "number")]];
  if (d.category === "source") {
    rows.push(
      ["Wydatki", formatValue(s.spend, "money")],
      ["Wyświetlenia", formatValue(s.impressions, "number")],
      ["Kliknięcia w reklamę", formatValue(s.adClicks, "number")],
      ["CTR reklamy", formatValue(s.ctrAds, "percent")],
      ["Hook rate", formatValue(s.hookRate, "percent")],
      ["CPC", formatValue(s.cpc, "money")],
      ["Koszt na osobę", formatValue(s.people ? (s.spend ?? 0) / s.people : null, "money")],
    );
  }
  if (d.category === "page") {
    rows.push(["Odsłony", formatValue(s.pageviews, "number")], ["Kliknięcia", formatValue(s.ctaClicks, "number")], ["CTR strony", formatValue(s.ctrPage, "percent")]);
    if (s.scroll) {
      rows.push(
        ["Przewinęło 25%", formatValue(s.scroll.p25, "percent")],
        ["Przewinęło 50%", formatValue(s.scroll.p50, "percent")],
        ["Przewinęło 75%", formatValue(s.scroll.p75, "percent")],
        ["Przewinęło 100%", formatValue(s.scroll.p100, "percent")],
      );
    }
  }
  if (d.category === "action" || d.category === "offline") {
    rows.push(["Konwersje", formatValue(s.conversions, "number")], ["Przychód", formatValue(s.revenue, "money")]);
  }
  return (
    <div>
      {rows.map(([k, v]) => (
        <div className="kv" key={k}><span>{k}</span><span>{v}</span></div>
      ))}
      <p className="hint">Dane: {s.tracked ? "skrypt śledzący" : "ręczne"}</p>
    </div>
  );
}

export function NodePanel({
  funnelId,
  node,
  mode,
  stats,
  onChange,
  onDelete,
  onManualChange,
}: {
  funnelId: string;
  node: FunnelNode;
  mode: Mode;
  stats?: NodeStats;
  range: { from: string; to: string };
  onChange: (patch: Partial<NodeData>) => void;
  onDelete: () => void;
  onManualChange: () => void;
}) {
  const d = node.data;
  const item = CATALOG_BY_KIND[d.kind];
  const sameCategory = CATALOG.filter((c) => c.category === d.category);

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <span className={`abbr cat-${d.category}`}>{item?.abbr}</span>
        <button className="btn small danger" onClick={onDelete}>Usuń element</button>
      </div>

      <label className="field">
        Nazwa
        <input value={d.label} onChange={(e) => onChange({ label: e.target.value })} />
      </label>
      <label className="field">
        Typ
        <select value={d.kind} onChange={(e) => onChange({ kind: e.target.value })}>
          {sameCategory.map((c) => <option key={c.kind} value={c.kind}>{c.label}</option>)}
        </select>
      </label>

      {d.category === "page" && (
        <label className="field">
          Adres strony
          <input value={d.url ?? ""} placeholder="/zapis lub klient.pl/oferta" onChange={(e) => onChange({ url: e.target.value })} />
          <span className="hint">„/ścieżka” = dokładnie ta ścieżka; „/kurs/*” = wszystko pod /kurs/; inny tekst = adres zawiera ten fragment.</span>
        </label>
      )}
      {d.category === "source" && (
        <label className="field">
          Dopasowanie źródła
          <input value={d.sourceMatch ?? ""} placeholder="facebook,fb" onChange={(e) => onChange({ sourceMatch: e.target.value })} />
          <span className="hint">Wartości utm_source lub domeny odsyłające, po przecinku. „(direct)” = wejścia bez źródła.</span>
        </label>
      )}
      {d.category === "action" && (
        <>
          <label className="field">
            Zdarzenie
            <select value={d.eventType ?? ""} onChange={(e) => onChange({ eventType: e.target.value })}>
              {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="field">
            {d.eventType === "scroll" ? "Próg przewinięcia (%)" : d.eventType === "custom" ? "Nazwa zdarzenia" : "Tekst / nazwa (opcjonalnie)"}
            <input value={d.eventName ?? ""} onChange={(e) => onChange({ eventName: e.target.value })} placeholder={d.eventType === "scroll" ? "75" : d.eventType === "click" ? "np. Kupuję teraz" : ""} />
          </label>
          <label className="field">
            Tylko na stronie (opcjonalnie)
            <input value={d.pageUrl ?? ""} placeholder="/oferta" onChange={(e) => onChange({ pageUrl: e.target.value })} />
          </label>
        </>
      )}
      <label className="field">
        Notatki
        <textarea rows={3} value={d.notes ?? ""} onChange={(e) => onChange({ notes: e.target.value })} />
      </label>

      {mode === "analyze" && (
        <>
          <hr className="side-sep" />
          <h3>Wyniki</h3>
          {stats ? <StatsView d={d} s={stats} /> : <p className="hint">Brak danych – odśwież analizę.</p>}
          <hr className="side-sep" />
          <ManualData funnelId={funnelId} nodeId={node.id} category={d.category} onChanged={onManualChange} />
        </>
      )}
    </div>
  );
}
