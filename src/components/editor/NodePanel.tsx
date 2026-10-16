"use client";
import { useCallback, useEffect, useState } from "react";
import { CATEGORY_GREEN } from "@/lib/palette";
import { KindIcon } from "./icons";
import { CATALOG, CATALOG_BY_KIND, EVENT_TYPES, FILTER_KEYS, FILTER_OPS, MANUAL_METRICS, type ChecklistItem, type NodeData, type NodeFilter } from "@/lib/catalog";
import { formatValue, type NodeStats } from "@/lib/analysis";
import { forecastForRange } from "@/lib/forecast";
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

const CATEGORY_COLORS: Record<NodeData["category"], string> = CATEGORY_GREEN;

/** Węzeł „Zakup”: tylko zakupy wybranych produktów (lista z zamówień projektu + własne fragmenty nazw). */
function ProductPicker({ funnelId, value, onChange }: { funnelId: string; value: string[]; onChange: (v: string[]) => void }) {
  const [list, setList] = useState<{ name: string; count: number }[] | null>(null);
  const [q, setQ] = useState("");
  const [own, setOwn] = useState("");
  useEffect(() => {
    api<{ name: string; count: number }[]>(`/api/funnels/${funnelId}/products`).then(setList).catch(() => setList([]));
  }, [funnelId]);
  const sel = new Set(value);
  const toggle = (n: string) => onChange(sel.has(n) ? value.filter((x) => x !== n) : [...value, n]);
  const items = [...(list ?? []).map((x) => ({ name: x.name, meta: `${x.count} szt.` })), ...value.filter((v) => !(list ?? []).some((x) => x.name === v)).map((v) => ({ name: v, meta: "fragment nazwy" }))];
  const shown = items.filter((i) => !q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="field">
      <div className="row" style={{ justifyContent: "space-between", width: "100%" }}>
        <span>Produkty</span>
        <span className="hint">{value.length ? `liczę tylko: ${value.length}` : "wszystkie zakupy"}</span>
      </div>
      <span className="hint">Zaznacz produkty tego lejka – węzeł (i przychód, sprzedaże, ROAS na dole) policzy tylko zamówienia, które je zawierają.</span>
      {list === null ? (
        <span className="hint">Wczytuję produkty…</span>
      ) : (
        <>
          {items.length > 6 && <input placeholder="Szukaj produktu…" value={q} onChange={(e) => setQ(e.target.value)} />}
          <div className="np-products">
            {shown.map((i) => (
              <label key={i.name} className={sel.has(i.name) ? "on" : ""} title={i.name}>
                <input type="checkbox" checked={sel.has(i.name)} onChange={() => toggle(i.name)} />
                <span className="np-name">{i.name}</span>
                <span className="hint">{i.meta}</span>
              </label>
            ))}
            {!items.length && <span className="hint">Brak zamówień w projekcie – wpisz fragment nazwy poniżej.</span>}
          </div>
        </>
      )}
      <form
        className="row"
        style={{ width: "100%" }}
        onSubmit={(e) => {
          e.preventDefault();
          if (own.trim() && !sel.has(own.trim())) onChange([...value, own.trim()]);
          setOwn("");
        }}
      >
        <input value={own} onChange={(e) => setOwn(e.target.value)} placeholder="lub fragment nazwy, np. dykcja" style={{ flex: 1 }} />
        <button className="btn small">Dodaj</button>
      </form>
      {value.length > 0 && (
        <button type="button" className="btn small" onClick={() => onChange([])}>Wyczyść – licz wszystkie zakupy</button>
      )}
    </div>
  );
}

function GoalEditor({ d, onChange }: { d: NodeData; onChange: (p: Partial<NodeData>) => void }) {
  const [raw, setRaw] = useState(d.goalValue != null ? String(d.goalValue) : "");
  return (
    <>
      <label className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <b>Cel konwersji</b>
        <input type="checkbox" checked={!!d.goal} onChange={(e) => onChange({ goal: e.target.checked })} />
      </label>
      {d.goal && (
        <>
          <div className="manual-row">
            <label className="field">
              Nazwa celu
              <input value={d.goalName ?? ""} placeholder="np. Zapis" onChange={(e) => onChange({ goalName: e.target.value })} />
            </label>
            <label className="field">
              Wartość (zł)
              <input
                inputMode="decimal"
                value={raw}
                placeholder="0"
                onChange={(e) => {
                  setRaw(e.target.value);
                  const v = Number(e.target.value.replace(",", "."));
                  onChange({ goalValue: e.target.value.trim() && Number.isFinite(v) ? v : undefined });
                }}
              />
            </label>
          </div>
          <p className="hint">Wartość jednej konwersji; ujemna = koszt.</p>
        </>
      )}
    </>
  );
}

export function ChecklistEditor({ items, onChange }: { items: ChecklistItem[]; onChange: (i: ChecklistItem[]) => void }) {
  const [hideDone, setHideDone] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState("");
  const done = items.filter((i) => i.done).length;
  const visible = hideDone ? items.filter((i) => !i.done) : items;
  const add = () => {
    if (!text.trim()) return;
    onChange([...items, { id: crypto.randomUUID().slice(0, 8), text: text.trim(), done: false }]);
    setText("");
  };
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Checklista</h3>
        <span className="hint">{done} / {items.length}</span>
      </div>
      <div className="progress"><i style={{ width: items.length ? `${(done / items.length) * 100}%` : 0 }} /></div>
      {visible.map((it) => (
        <div key={it.id} className="check-item">
          <input type="checkbox" checked={it.done} onChange={(e) => onChange(items.map((x) => (x.id === it.id ? { ...x, done: e.target.checked } : x)))} />
          <input
            value={it.text}
            className={it.done ? "done" : ""}
            onChange={(e) => onChange(items.map((x) => (x.id === it.id ? { ...x, text: e.target.value } : x)))}
          />
          <button className="btn small" type="button" title="Usuń" onClick={() => onChange(items.filter((x) => x.id !== it.id))}>×</button>
        </div>
      ))}
      <div className="check-item">
        <input type="checkbox" disabled />
        <input
          value={text}
          placeholder="Nowe zadanie… (Enter)"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <button className="btn small" type="button" onClick={add}>+</button>
      </div>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
        <button
          className="btn small"
          type="button"
          disabled={!items.length}
          onClick={() =>
            navigator.clipboard
              .writeText(items.map((i) => `[${i.done ? "x" : " "}] ${i.text}`).join("\n"))
              .then(() => setMsg("Skopiowano"))
          }
        >
          Kopiuj checklistę
        </button>
        <label className="row hint" style={{ gap: 4 }}>
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Ukryj zrobione
        </label>
      </div>
      {msg && <div className="hint">{msg}</div>}
    </div>
  );
}

const PERIODS: { value: NonNullable<NodeData["forecast"]>["period"]; label: string }[] = [
  { value: "day", label: "dziennie" },
  { value: "week", label: "tygodniowo" },
  { value: "month", label: "miesięcznie" },
];

function ForecastEditor({ d, onChange }: { d: NodeData; onChange: (p: Partial<NodeData>) => void }) {
  const f = d.forecast ?? { period: "day" as const, people: 0 };
  return (
    <div>
      <h3>Prognoza</h3>
      <div className="manual-row">
        <label className="field">
          Okres
          <select value={f.period} onChange={(e) => onChange({ forecast: { ...f, period: e.target.value as typeof f.period } })}>
            {PERIODS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>
        <label className="field">
          Osoby
          <input
            inputMode="numeric"
            value={f.people || ""}
            placeholder="0"
            onChange={(e) => {
              const v = Number(e.target.value.replace(",", "."));
              onChange({ forecast: Number.isFinite(v) && v > 0 ? { ...f, people: v } : undefined });
            }}
          />
        </label>
      </div>
      <p className="hint">W trybie Analiza zobaczysz wykonanie prognozy dla wybranego zakresu dat.</p>
    </div>
  );
}

function ForecastResult({ d, stats, range }: { d: NodeData; stats?: NodeStats; range: { from: string; to: string } }) {
  const expected = forecastForRange(d.forecast, range.from, range.to);
  if (expected == null) return null;
  const actual = stats ? (d.category === "action" && d.eventType === "purchase" ? stats.conversions ?? 0 : stats.people) : 0;
  return (
    <div style={{ marginTop: 8 }}>
      <div className="kv"><span>Prognoza w zakresie</span><span>{formatValue(expected, "number")}</span></div>
      <div className="kv"><span>Wykonanie</span><span>{formatValue(expected ? actual / expected : null, "percent")}</span></div>
    </div>
  );
}

function UrlList({ urls, onChange }: { urls: string[]; onChange: (u: string[]) => void }) {
  return (
    <div className="field">
      {urls.map((u, i) => (
        <div className="row" key={i} style={{ flexWrap: "nowrap" }}>
          <input value={u} placeholder="/inna-wersja" onChange={(e) => onChange(urls.map((x, j) => (j === i ? e.target.value : x)))} />
          <button className="btn small" type="button" title="Usuń adres" onClick={() => onChange(urls.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button className="btn small" type="button" onClick={() => onChange([...urls, ""])}>+ Dodaj adres URL</button>
    </div>
  );
}

export function FiltersEditor({ filters, onChange }: { filters: NodeFilter[]; onChange: (f: NodeFilter[]) => void }) {
  const set = (i: number, patch: Partial<NodeFilter>) => onChange(filters.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div className="field">
      <span>Warunki (wszystkie muszą być spełnione)</span>
      {filters.map((f, i) => (
        <div key={i} style={{ display: "grid", gap: 4, padding: 6, border: "1px dashed var(--fe-panel-border)", borderRadius: 6 }}>
          <input
            list="anl-filter-keys"
            value={f.key}
            placeholder="klucz, np. utm_campaign lub param:ref"
            onChange={(e) => set(i, { key: e.target.value })}
          />
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <select value={f.op} onChange={(e) => set(i, { op: e.target.value as NodeFilter["op"] })}>
              {FILTER_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {f.op !== "empty" && f.op !== "not_empty" && (
              <input value={f.value} placeholder="wartość" onChange={(e) => set(i, { value: e.target.value })} />
            )}
            <button className="btn small" type="button" title="Usuń warunek" onClick={() => onChange(filters.filter((_, j) => j !== i))}>×</button>
          </div>
        </div>
      ))}
      <datalist id="anl-filter-keys">
        {FILTER_KEYS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
      </datalist>
      <button className="btn small" type="button" onClick={() => onChange([...filters, { key: "utm_campaign", op: "eq", value: "" }])}>
        + Dodaj warunek
      </button>
      <span className="hint">Klucz „param:nazwa” sprawdza parametr w adresie strony (np. param:ref).</span>
    </div>
  );
}

interface PeopleData {
  total: number;
  people: { visitor_id: string; first: number; last: number; events: number; source: string; campaign: string; value: number }[];
  attributes: Record<string, { value: string; people: number }[]>;
}

const ATTR_LABELS: Record<string, string> = {
  source: "Źródło",
  utm_medium: "utm_medium",
  utm_campaign: "Kampania",
  utm_content: "utm_content (kreacja)",
  utm_term: "utm_term",
  path: "Ścieżka",
};

function PeopleView({ funnelId, nodeId, range }: { funnelId: string; nodeId: string; range: { from: string; to: string } }) {
  const [data, setData] = useState<PeopleData | null>(null);
  const [tab, setTab] = useState<"attrs" | "people">("attrs");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true);
    setErr("");
    try {
      setData(await api<PeopleData>(`/api/funnels/${funnelId}/people?node_id=${encodeURIComponent(nodeId)}&from=${range.from}&to=${range.to}`));
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 style={{ margin: 0 }}>Osoby i atrybuty</h3>
        <button className="btn small" onClick={load} disabled={busy}>{busy ? "…" : data ? "Odśwież" : "Pokaż"}</button>
      </div>
      {err && <div className="error">{err}</div>}
      {data && (
        <>
          <div className="row" style={{ margin: "8px 0" }}>
            <button className={`btn small ${tab === "attrs" ? "primary" : ""}`} onClick={() => setTab("attrs")}>Atrybuty</button>
            <button className={`btn small ${tab === "people" ? "primary" : ""}`} onClick={() => setTab("people")}>Osoby ({data.total})</button>
          </div>
          {tab === "attrs" ? (
            Object.entries(data.attributes).map(([k, rows]) => (
              <div key={k} style={{ marginBottom: 8 }}>
                <div className="hint">{ATTR_LABELS[k] ?? k}</div>
                {rows.map((r) => (
                  <div className="kv" key={r.value}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 190 }} title={r.value}>{r.value}</span>
                    <span>{r.people}</span>
                  </div>
                ))}
              </div>
            ))
          ) : (
            <table className="tbl">
              <thead>
                <tr><th>Osoba</th><th>Ostatnio</th><th>Źródło</th></tr>
              </thead>
              <tbody>
                {data.people.map((p) => (
                  <tr key={p.visitor_id} title={`Pierwszy raz: ${new Date(p.first).toLocaleString("pl-PL")} · zdarzeń: ${p.events}${p.value ? ` · wartość: ${p.value} zł` : ""}`}>
                    <td>{p.visitor_id.slice(0, 8)}</td>
                    <td>{new Date(p.last).toLocaleDateString("pl-PL")}</td>
                    <td>{p.campaign ? `${p.source} / ${p.campaign}` : p.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {tab === "people" && data.total > data.people.length && <p className="hint">Pokazano 100 ostatnich z {data.total}.</p>}
        </>
      )}
    </div>
  );
}

export function StatsView({ d, s }: { d: NodeData; s: NodeStats }) {
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
  if (d.goal) rows.push(["Konwersje celu", formatValue(s.goalCount, "number")], ["Wartość celu", formatValue(s.goalValue, "money")]);
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
  range,
  onChange,
  onDelete,
  onManualChange,
  onAction,
}: {
  funnelId: string;
  node: FunnelNode;
  mode: Mode;
  stats?: NodeStats;
  range: { from: string; to: string };
  onChange: (patch: Partial<NodeData>) => void;
  onDelete: () => void;
  onManualChange: () => void;
  onAction: (a: "copy" | "duplicate" | "forward" | "front" | "backward" | "back") => void;
}) {
  const d = node.data;
  const item = CATALOG_BY_KIND[d.kind];
  const sameCategory = CATALOG.filter((c) => c.category === d.category);
  const [tab, setTab] = useState<"setup" | "plan" | "style" | "results">(mode === "analyze" ? "results" : "setup");
  useEffect(() => {
    if (mode === "analyze") setTab("results");
    else setTab((t) => (t === "results" ? "setup" : t));
  }, [mode]);

  const tabs: [typeof tab, string][] = [
    ["setup", "Śledzenie"],
    ["plan", "Plan"],
    ["style", "Styl"],
  ];
  if (mode === "analyze") tabs.unshift(["results", "Wyniki"]);

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <div className="row" style={{ flexWrap: "nowrap", minWidth: 0 }}>
          <span className={`abbr cat-${d.category}`} style={d.color ? ({ "--node-accent": d.color } as React.CSSProperties) : undefined} title={item?.abbr}><KindIcon kind={d.kind} size={14} /></span>
          <b style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</b>
        </div>
        <button className="btn small danger" onClick={onDelete}>Usuń</button>
      </div>
      <div className="side-tabs">
        {tabs.map(([k, label]) => (
          <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {tab === "setup" && (
        <>
          {d.category === "page" && (
            <label className="field">
              Adres strony
              <input value={d.url ?? ""} placeholder="/zapis lub klient.pl/oferta" onChange={(e) => onChange({ url: e.target.value })} />
              <span className="hint">„/ścieżka” = dokładnie ta ścieżka; „/kurs/*” = wszystko pod /kurs/; inny tekst = adres zawiera ten fragment.</span>
            </label>
          )}
          {d.category === "page" && <UrlList urls={d.urls ?? []} onChange={(urls) => onChange({ urls })} />}
          {d.category === "source" && (
            <label className="field">
              Dopasowanie źródła
              <input value={d.sourceMatch ?? ""} placeholder="facebook,fb" onChange={(e) => onChange({ sourceMatch: e.target.value })} />
              <span className="hint">Wartości utm_source lub domeny odsyłające, po przecinku. „(direct)” = wejścia bez źródła.</span>
            </label>
          )}
          {d.category === "source" && (
            <label className="field">
              Koszty z importu reklam
              <input value={d.adsMatch ?? ""} placeholder="np. webinar, [SPRZEDAŻ]" onChange={(e) => onChange({ adsMatch: e.target.value })} />
              <span className="hint">Nazwa kampanii, zestawu lub reklamy zawiera (po przecinku). Prefiks „meta:” / „google:” / „inne:” zawęża do danych tej platformy, „*” = wszystkie (np. <code>meta:*</code>, <code>google:webinar</code>). Wydatki, wyświetlenia, kliknięcia i odtworzenia 3 s doliczą się same.</span>
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
              {d.eventType === "purchase" && (
                <ProductPicker funnelId={funnelId} value={d.products ?? []} onChange={(products) => onChange({ products: products.length ? products : undefined })} />
              )}
            </>
          )}
          {d.category === "offline" && <p className="hint">Element offline – liczby wpisujesz ręcznie w trybie Analiza.</p>}
          {d.category !== "offline" && <FiltersEditor filters={d.filters ?? []} onChange={(filters) => onChange({ filters })} />}

          <hr className="side-sep" />
          <GoalEditor d={d} onChange={onChange} />
        </>
      )}

      {tab === "plan" && (
        <>
          <label className="field">
            Notatki
            <textarea rows={6} value={d.notes ?? ""} onChange={(e) => onChange({ notes: e.target.value })} placeholder="Np. co jest na stronie, kto odpowiada, linki do materiałów…" />
          </label>
          <hr className="side-sep" />
          <ChecklistEditor items={d.checklist ?? []} onChange={(checklist) => onChange({ checklist })} />
          <hr className="side-sep" />
          <ForecastEditor d={d} onChange={onChange} />
        </>
      )}

      {tab === "style" && (
        <>
          <label className="field">
            Nazwa
            <input value={d.label} onChange={(e) => onChange({ label: e.target.value })} />
          </label>
          <label className="field">
            Typ / ikona
            <select value={d.kind} onChange={(e) => onChange({ kind: e.target.value })}>
              {sameCategory.map((c) => <option key={c.kind} value={c.kind}>{c.group} – {c.label}</option>)}
            </select>
          </label>
          {d.category === "page" && (
            <label className="field">
              Miniatura z obrazka (adres URL)
              <input value={d.thumbnailUrl ?? ""} placeholder="https://…/zrzut-strony.png" onChange={(e) => onChange({ thumbnailUrl: e.target.value })} />
              <span className="hint">Wklej link do zrzutu ekranu strony. Puste = makieta zależna od typu.</span>
            </label>
          )}
          <div className="field">
            Kolejność i kopiowanie
            <div className="choice-grid">
              <button className="btn small" onClick={() => onAction("copy")} title="Ctrl/⌘ + C">Kopiuj</button>
              <button className="btn small" onClick={() => onAction("duplicate")} title="Ctrl/⌘ + D">Duplikuj</button>
              <button className="btn small" onClick={() => onAction("forward")} title="Ctrl/⌘ + ]">Wyżej</button>
              <button className="btn small" onClick={() => onAction("front")} title="Ctrl/⌘ + Shift + ]">Na wierzch</button>
              <button className="btn small" onClick={() => onAction("backward")} title="Ctrl/⌘ + [">Niżej</button>
              <button className="btn small" onClick={() => onAction("back")} title="Ctrl/⌘ + Shift + [">Na spód</button>
            </div>
          </div>
          <label className="field">
            Własna ikona (adres obrazka)
            <input value={d.iconUrl ?? ""} placeholder="https://…/logo.png" onChange={(e) => onChange({ iconUrl: e.target.value || undefined })} />
            <span className="hint">Np. logo klienta lub narzędzia. Puste = znacznik literowy.</span>
          </label>
          <label className="field">
            Kolor akcentu
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <input type="color" value={d.color ?? CATEGORY_COLORS[d.category]} onChange={(e) => onChange({ color: e.target.value })} style={{ height: 32, padding: 2, flex: 1 }} />
              {d.color && <button className="btn small" type="button" onClick={() => onChange({ color: undefined })}>Domyślny</button>}
            </div>
          </label>
        </>
      )}

      {tab === "results" && mode === "analyze" && (
        <>
          {stats ? <StatsView d={d} s={stats} /> : <p className="hint">Brak danych – odśwież analizę.</p>}
          <ForecastResult d={d} stats={stats} range={range} />
          <hr className="side-sep" />
          <ManualData funnelId={funnelId} nodeId={node.id} category={d.category} onChanged={onManualChange} />
          {d.category !== "offline" && (
            <>
              <hr className="side-sep" />
              <PeopleView funnelId={funnelId} nodeId={node.id} range={range} />
            </>
          )}
        </>
      )}
    </div>
  );
}
