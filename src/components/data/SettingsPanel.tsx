"use client";
import { useEffect, useMemo, useState } from "react";
import { applyRules, DEFAULT_SETTINGS, type Period, type ProjectSettings, type Rule } from "@/lib/settings";
import { api } from "../forms";

interface Names {
  products: { name: string; count: number }[];
  campaigns: { name: string; spend: number }[];
  ads: { name: string; spend: number }[];
}

function RulesEditor({ rules, onChange, patternLabel, valueLabel }: { rules: Rule[]; onChange: (r: Rule[]) => void; patternLabel: string; valueLabel: string }) {
  const set = (i: number, patch: Partial<Rule>) => onChange(rules.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= rules.length) return;
    const next = [...rules];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div>
      <div className="rules-row hint"><span>{patternLabel}</span><span>{valueLabel}</span><span /></div>
      {rules.map((r, i) => (
        <div className="rules-row" key={i}>
          <input value={r.pattern} onChange={(e) => set(i, { pattern: e.target.value })} placeholder="np. kurs|szkolenie" />
          <input value={r.value} onChange={(e) => set(i, { value: e.target.value })} />
          <div className="row" style={{ flexWrap: "nowrap", gap: 2 }}>
            <button className="btn small" title="Wyżej" onClick={() => move(i, -1)}>↑</button>
            <button className="btn small" title="Niżej" onClick={() => move(i, 1)}>↓</button>
            <button className="btn small" title="Usuń" onClick={() => onChange(rules.filter((_, j) => j !== i))}>×</button>
          </div>
        </div>
      ))}
      <button className="btn small" onClick={() => onChange([...rules, { pattern: "", value: "" }])}>+ Dodaj regułę</button>
    </div>
  );
}

function Preview({ items, rules, fallback, metric }: { items: { name: string; v: number }[]; rules: Rule[]; fallback: string; metric: string }) {
  if (!items.length) return <p className="hint">Brak danych do podglądu – podłącz dane w „Źródłach danych”.</p>;
  return (
    <div className="tbl-wrap" style={{ maxHeight: 260, overflowY: "auto" }}>
      <table className="tbl">
        <thead><tr><th>Nazwa</th><th>Wynik reguł</th><th className="num">{metric}</th></tr></thead>
        <tbody>
          {items.slice(0, 100).map((it) => {
            const v = applyRules(it.name, rules, fallback);
            return (
              <tr key={it.name}>
                <td>{it.name}</td>
                <td>{v === fallback ? <span className="tag tag-gap">{v}</span> : v}</td>
                <td className="num">{it.v.toLocaleString("pl-PL", { maximumFractionDigits: 0 })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function SettingsPanel({ projectId }: { projectId: string }) {
  const [s, setS] = useState<ProjectSettings | null>(null);
  const [names, setNames] = useState<Names | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    api<ProjectSettings>(`/api/projects/${projectId}/settings`).then(setS).catch(() => setS(DEFAULT_SETTINGS));
    api<Names>(`/api/projects/${projectId}/names`).then(setNames).catch(() => {});
  }, [projectId]);
  const categories = useMemo(() => [...new Set((s?.productRules ?? []).map((r) => r.value).filter(Boolean))], [s]);
  if (!s) return <p className="hint">Wczytuję…</p>;
  const up = (patch: Partial<ProjectSettings>) => setS({ ...s, ...patch });
  const setPeriod = (i: number, patch: Partial<Period>) => up({ periods: s.periods.map((p, j) => (j === i ? { ...p, ...patch } : p)) });

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 style={{ margin: 0 }}>Ustawienia klienta</h2>
        <div className="row">
          {msg && <span className="hint">{msg}</span>}
          <button
            className="btn primary"
            onClick={async () => {
              const saved = await api<ProjectSettings>(`/api/projects/${projectId}/settings`, "PUT", s);
              setS(saved);
              setMsg("Zapisano");
              setTimeout(() => setMsg(""), 2500);
            }}
          >
            Zapisz ustawienia
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Podstawy</h3>
        <div className="map-grid">
          <label className="field">Waluta<input value={s.currency} onChange={(e) => up({ currency: e.target.value })} /></label>
          <label className="field">VAT (%)<input inputMode="decimal" value={s.vat} onChange={(e) => up({ vat: Number(e.target.value.replace(",", ".")) || 0 })} /></label>
          <label className="field">
            Kategoria produktu głównego (do CAC i LTV)
            <input list="anl-cats" value={s.mainCategory} onChange={(e) => up({ mainCategory: e.target.value })} />
            <datalist id="anl-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(460px, 1fr))", marginTop: 12 }}>
        <div className="card">
          <h3>Kategorie produktów</h3>
          <p className="hint">Pierwsza pasująca reguła wygrywa. Wzorzec = fragment nazwy lub wyrażenie regularne (bez polskich znaków, wielkość liter bez znaczenia).</p>
          <RulesEditor rules={s.productRules} onChange={(productRules) => up({ productRules })} patternLabel="Nazwa produktu zawiera" valueLabel="Kategoria" />
          <h3 style={{ marginTop: 12 }}>Podgląd na produktach klienta</h3>
          <Preview items={(names?.products ?? []).map((p) => ({ name: p.name, v: p.count }))} rules={s.productRules} fallback="inne" metric="Zamówień" />
        </div>

        <div className="card">
          <h3>Typy kampanii</h3>
          <RulesEditor rules={s.campaignTypeRules} onChange={(campaignTypeRules) => up({ campaignTypeRules })} patternLabel="Nazwa kampanii zawiera" valueLabel="Typ" />
          <h3 style={{ marginTop: 12 }}>Podgląd na kampaniach</h3>
          <Preview items={(names?.campaigns ?? []).map((p) => ({ name: p.name, v: p.spend }))} rules={s.campaignTypeRules} fallback="nieokreślony" metric="Wydatki" />
        </div>

        <div className="card">
          <h3>Kąty reklam</h3>
          <p className="hint">Rozpoznawane z nazwy reklamy. Reklamy bez dopasowania (np. nazwy kodowe) trafiają do „nieznany kąt”.</p>
          <RulesEditor rules={s.angleRules} onChange={(angleRules) => up({ angleRules })} patternLabel="Nazwa reklamy zawiera" valueLabel="Kąt" />
          <h3 style={{ marginTop: 12 }}>Podgląd na reklamach</h3>
          <Preview items={(names?.ads ?? []).map((p) => ({ name: p.name, v: p.spend }))} rules={s.angleRules} fallback="nieznany kąt" metric="Wydatki" />
        </div>

        <div className="card">
          <h3>Okresy analizy</h3>
          <p className="hint">Np. „cena 797 zł”, „po zmianie sklepu”, „webinary”. Bez okresów analiza liczy cały zakres danych.</p>
          {s.periods.map((p, i) => (
            <div className="rules-row" key={i} style={{ gridTemplateColumns: "1.3fr 1fr 1fr auto" }}>
              <input value={p.name} placeholder="Nazwa" onChange={(e) => setPeriod(i, { name: e.target.value })} />
              <input type="date" value={p.from} onChange={(e) => setPeriod(i, { from: e.target.value })} />
              <input type="date" value={p.to} onChange={(e) => setPeriod(i, { to: e.target.value })} />
              <button className="btn small" onClick={() => up({ periods: s.periods.filter((_, j) => j !== i) })}>×</button>
            </div>
          ))}
          <button className="btn small" onClick={() => up({ periods: [...s.periods, { name: `Okres ${s.periods.length + 1}`, from: "", to: "" }] })}>+ Dodaj okres</button>

          <h3 style={{ marginTop: 16 }}>Koszty (założenia do szacunku zysku)</h3>
          <div className="map-grid">
            <label className="field">Podatek dochodowy (%)<input inputMode="decimal" value={s.costs.incomeTaxRate} onChange={(e) => up({ costs: { ...s.costs, incomeTaxRate: Number(e.target.value.replace(",", ".")) || 0 } })} /></label>
            <label className="field">Koszty stałe / miesiąc<input inputMode="decimal" value={s.costs.monthlyFixed} onChange={(e) => up({ costs: { ...s.costs, monthlyFixed: Number(e.target.value.replace(",", ".")) || 0 } })} /></label>
          </div>
          <p className="hint">Koszty zmienne jako % przychodu netto kategorii (np. warsztat → 50).</p>
          <RulesEditor rules={s.costs.variableCostRates} onChange={(variableCostRates) => up({ costs: { ...s.costs, variableCostRates } })} patternLabel="Kategoria" valueLabel="% przychodu netto" />
        </div>

        <div className="card">
          <h3>Sesja analityczna</h3>
          <div className="map-grid">
            <label className="field">Min. kliknięć w oknie<input inputMode="numeric" value={s.session.minClicks} onChange={(e) => up({ session: { ...s.session, minClicks: Number(e.target.value) || 0 } })} /></label>
            <label className="field">Min. zamówień w oknie<input inputMode="numeric" value={s.session.minOrders} onChange={(e) => up({ session: { ...s.session, minOrders: Number(e.target.value) || 0 } })} /></label>
          </div>
          <p className="hint">Poniżej progu: „niska pewność” i zakres zamiast jednej liczby.</p>
          <label className="field">UTM maili (źródło lub medium zawiera; oddziel „|”)
            <input value={s.session.emailUtm} onChange={(e) => up({ session: { ...s.session, emailUtm: e.target.value } })} placeholder="mail|newsletter|mailerlite" />
          </label>
          <label className="field">Benchmark dźwigni</label>
          <div className="seg">
            <button className={s.session.benchmark === "best7" ? "on" : ""} onClick={() => up({ session: { ...s.session, benchmark: "best7" } })}>najlepsze 7 dni z 60</button>
            <button className={s.session.benchmark === "targets" ? "on" : ""} onClick={() => up({ session: { ...s.session, benchmark: "targets" } })}>wartości docelowe</button>
          </div>
          {s.session.benchmark === "targets" && (
            <div className="map-grid">
              {([["cpm", "CPM (zł)", 1], ["ctr", "CTR (%)", 100], ["cr", "CR klik → zakup (%)", 100], ["aov", "AOV netto (zł)", 1]] as const).map(([k, label, mult]) => (
                <label key={k} className="field">{label}
                  <input inputMode="decimal" defaultValue={s.session.targets[k] != null ? String(Math.round(s.session.targets[k]! * mult * 1000) / 1000) : ""}
                    onChange={(e) => {
                      const v = Number(e.target.value.replace(",", "."));
                      const t = { ...s.session.targets };
                      if (e.target.value.trim() && Number.isFinite(v) && v > 0) t[k] = v / mult; else delete t[k];
                      up({ session: { ...s.session, targets: t } });
                    }} />
                </label>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
