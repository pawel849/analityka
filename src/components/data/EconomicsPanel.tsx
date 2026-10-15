"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { shapley, type MonthRow, type PeriodStats } from "@/lib/economics";
import type { ProjectSettings } from "@/lib/settings";
import { api } from "../forms";

interface Econ {
  empty: boolean;
  from: string;
  to: string;
  lastOrder: string | null;
  counts: { orders: number; adRows: number; adRowsAll?: number; customersIdentified: number };
  scope?: { campaigns: string | null; products: string | null };
  products?: { name: string; count: number; medianPrice: number | null; gross: number | null; category: string; inScope: boolean | null }[];
  settings: ProjectSettings;
  monthly: MonthRow[];
  periods: PeriodStats[];
}

// Paleta kategorii (zwalidowana, stała kolejność – kolor idzie za kategorią, nie za pozycją).
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

const money = (v: number | null | undefined, cur: string) =>
  v == null || !Number.isFinite(v) ? "—" : `${v.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} ${cur}`;
const num = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("pl-PL", { maximumFractionDigits: d }));
const signed = (v: number, cur: string) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString("pl-PL", { maximumFractionDigits: 0 })} ${cur}`;
const pct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toLocaleString("pl-PL", { maximumFractionDigits: 1 })}%`);

function RevenueChart({ rows, categories, cur }: { rows: MonthRow[]; categories: string[]; cur: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 900;
  const h = 240;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.gross, r.spend)));
  const bw = w / Math.max(rows.length, 1);
  const y = (v: number) => h - (v / max) * (h - 10);
  const line = rows.map((r, i) => `${(i + 0.5) * bw},${y(r.spend)}`).join(" ");
  return (
    <div style={{ position: "relative" }}>
      <div className="row" style={{ gap: 12, marginBottom: 6 }}>
        {categories.map((c, i) => (
          <span key={c} className="hint" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <i style={{ width: 10, height: 10, borderRadius: 2, background: SERIES[i % SERIES.length], display: "inline-block" }} /> {c}
          </span>
        ))}
        <span className="hint" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <i style={{ width: 14, height: 2, background: "var(--text)", display: "inline-block" }} /> wydatki reklamowe
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h + 20}`} width="100%" role="img" aria-label="Przychód brutto według kategorii i wydatki reklamowe miesięcznie">
        <line x1={0} x2={w} y1={h} y2={h} stroke="var(--border)" />
        {rows.map((r, i) => {
          let acc = 0;
          return (
            <g key={r.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} opacity={hover === null || hover === i ? 1 : 0.5}>
              <rect x={i * bw} y={0} width={bw} height={h} fill="transparent" />
              {categories.map((c, ci) => {
                const v = r.byCategory[c] ?? 0;
                if (!v) return null;
                const top = y(acc + v);
                const height = y(acc) - top;
                acc += v;
                return <rect key={c} x={i * bw + bw * 0.15} y={top + 1} width={bw * 0.7} height={Math.max(height - 2, 0.5)} fill={SERIES[ci % SERIES.length]} rx={2} />;
              })}
            </g>
          );
        })}
        <polyline points={line} fill="none" stroke="var(--text)" strokeWidth={2} strokeLinejoin="round" />
        {rows.map((r, i) => (i % Math.ceil(rows.length / 12) === 0 ? (
          <text key={r.month} x={(i + 0.5) * bw} y={h + 15} fontSize={11} textAnchor="middle" fill="var(--muted)">{r.month}</text>
        ) : null))}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${((hover + 0.5) / rows.length) * 100}%` }}>
          <b>{rows[hover].month}</b>
          <br />Przychód: {money(rows[hover].gross, cur)}
          <br />Wydatki: {money(rows[hover].spend, cur)}
          <br />Na 1 {cur} reklam: {num(rows[hover].revenuePerSpend, 2)}
        </div>
      )}
    </div>
  );
}

const SCOPE_KEY = (id: string) => `anl_econ_scope_${id}`;

/** Zawężenie Ekonomii do kampanii i produktu (zapamiętywane w tej przeglądarce). */
function ScopeBar({ value, onApply }: { value: { campaigns: string; products: string }; onApply: (v: { campaigns: string; products: string }) => void }) {
  const [c, setC] = useState(value.campaigns);
  const [p, setP] = useState(value.products);
  useEffect(() => {
    setC(value.campaigns);
    setP(value.products);
  }, [value]);
  const active = !!(value.campaigns || value.products);
  return (
    <form
      className={`card scope-bar ${active ? "on" : ""}`}
      onSubmit={(e) => {
        e.preventDefault();
        onApply({ campaigns: c.trim(), products: p.trim() });
      }}
    >
      <b>Zakres analizy</b>
      <span className="hint">{active ? "Zawężone – liczby dotyczą tylko wybranych kampanii / produktu." : "Cały projekt: wszystkie kampanie i wszystkie produkty."}</span>
      <div className="scope-fields">
        <label className="field">
          Kampanie (wydatki)
          <input value={c} onChange={(e) => setC(e.target.value)} placeholder="np. meta:VSL 797 (puste = wszystkie)" />
        </label>
        <label className="field">
          Produkt (przychód, CAC, LTV)
          <input value={p} onChange={(e) => setP(e.target.value)} placeholder="np. dykcja dla każdego (puste = produkt główny z ustawień)" />
        </label>
        <div className="row" style={{ alignSelf: "end" }}>
          <button className="btn primary small">Zastosuj</button>
          {active && (
            <button type="button" className="btn small" onClick={() => onApply({ campaigns: "", products: "" })}>Cały projekt</button>
          )}
        </div>
      </div>
      <span className="hint">
        Kampanie: fragmenty nazw po przecinku, prefiks <code>meta:</code> / <code>google:</code> zawęża platformę. Produkt: fragmenty nazw – pasujące pozycje
        liczone są jako produkt główny, przychód tylko z zamówień, które je zawierają (z dodatkami w tym samym zamówieniu). LTV obejmuje późniejsze zakupy klienta.
      </span>
    </form>
  );
}

export function EconomicsPanel({ projectId }: { projectId: string }) {
  const [d, setD] = useState<Econ | null>(null);
  const [err, setErr] = useState("");
  const [scope, setScope] = useState<{ campaigns: string; products: string }>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem(SCOPE_KEY(projectId)) : null;
      if (raw) return JSON.parse(raw);
    } catch {
      /* brak pamięci przeglądarki */
    }
    return { campaigns: "", products: "" };
  });
  const [a, setA] = useState(0);
  const [b, setB] = useState(1);
  const [ltvWindow, setLtvWindow] = useState(90);
  useEffect(() => {
    const qs = new URLSearchParams();
    if (scope.campaigns) qs.set("campaigns", scope.campaigns);
    if (scope.products) qs.set("products", scope.products);
    setD(null);
    api<Econ>(`/api/projects/${projectId}/economics?${qs}`).then(setD).catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [projectId, scope]);
  const applyScope = (v: { campaigns: string; products: string }) => {
    try {
      localStorage.setItem(SCOPE_KEY(projectId), JSON.stringify(v));
    } catch {
      /* brak pamięci przeglądarki */
    }
    setScope(v);
  };

  const categories = useMemo(() => {
    if (!d || d.empty) return [];
    const tot = new Map<string, number>();
    for (const m of d.monthly) for (const [c, v] of Object.entries(m.byCategory)) tot.set(c, (tot.get(c) ?? 0) + v);
    return [...tot.entries()].sort((x, y) => y[1] - x[1]).map(([c]) => c);
  }, [d]);

  if (err) return <p className="error">{err}</p>;
  if (!d) return (
    <div>
      <ScopeBar value={scope} onApply={applyScope} />
      <p className="hint">Liczę…</p>
    </div>
  );
  if (d.empty)
    return (
      <div className="card">
        <h2>Ekonomia jednostkowa</h2>
        <p className="hint">Brak danych. Zaimportuj zamówienia i wydatki reklamowe w zakładce <Link href={`/projects/${projectId}?tab=dane`}>Dane</Link>.</p>
      </div>
    );
  const cur = d.settings.currency;
  const s = d.settings;
  const periods = d.periods;
  const comp = periods.length > 1 && periods[a] && periods[b] ? shapley(periods[a], periods[b], ltvWindow) : null;

  const rows: [string, (p: PeriodStats) => React.ReactNode, "data" | "assumption" | "interp"][] = [
    ["Zakres", (p) => `${p.from} – ${p.to}`, "data"],
    ["Wydatki reklamowe", (p) => money(p.spend, cur), "data"],
    ["Przychód brutto", (p) => money(p.gross, cur), "data"],
    [`Przychód netto (VAT ${s.vat}%)`, (p) => money(p.net, cur), "assumption"],
    ["Przychód na 1 zł reklam", (p) => num(p.revenuePerSpend, 2), "data"],
    ["Zamówienia", (p) => num(p.orders), "data"],
    [`Sprzedane: ${s.mainCategory} (szt.)`, (p) => num(p.mainUnits), "data"],
    [`Mediana ceny: ${s.mainCategory}`, (p) => money(p.mainPriceMedian, cur), "data"],
    ["Nowi klienci (pierwszy zakup produktu głównego)", (p) => num(p.newMainCustomers), "data"],
    ["CAC (wydatki ÷ nowi klienci)", (p) => money(p.cac, cur), "data"],
    ...[30, 90, 365].map(
      (w) =>
        [
          `LTV ${w} dni (netto)`,
          (p: PeriodStats) => {
            const l = p.ltv.find((x) => x.days === w)!;
            return l.net == null ? <span className="tag tag-gap">okno niedojrzałe</span> : `${money(l.net, cur)} (n=${l.matured}${l.matured < p.newMainCustomers ? ` z ${p.newMainCustomers}` : ""})`;
          },
          "data",
        ] as [string, (p: PeriodStats) => React.ReactNode, "data"],
    ),
    ["LTV 90 ÷ CAC", (p) => (p.ltvCac90 == null ? "—" : `${num(p.ltvCac90, 2)}${p.ltvCac90 < 3 ? " (poniżej 3:1)" : ""}`), "interp"],
    ["Klienci kupujący ponownie", (p) => pct(p.repeatRate), "data"],
    ["Back-end na klienta (zakupy po pierwszym)", (p) => money(p.backendPerCustomer, cur), "data"],
    ["Zamówienia z dodatkiem (order bump)", (p) => pct(p.orderBumpRate), "data"],
    ["Na 10 000 zł reklam: nowi klienci", (p) => num(p.per10k.newCustomers, 1), "interp"],
    ["Na 10 000 zł reklam: przychód netto 90 dni", (p) => money(p.per10k.netRevenue90, cur), "interp"],
    ["Na 10 000 zł reklam: po odjęciu reklam", (p) => money(p.per10k.afterAds, cur), "interp"],
    ["Zysk szacunkowy po podatku", (p) => money(p.profit.afterTax, cur), "assumption"],
  ];

  return (
    <div>
      <h2>Ekonomia jednostkowa</h2>
      <p className="sub">
        Dane: {num(d.counts.orders)} zamówień, {num(d.counts.adRows)} wierszy reklam, {num(d.counts.customersIdentified)} klientów rozpoznanych po e-mailu.
        Ostatnie zamówienie: {d.lastOrder ?? "—"}. Ustawienia (VAT, produkt główny, okresy, koszty) zmienisz w zakładce{" "}
        <Link href={`/projects/${projectId}?tab=ustawienia`}>Ustawienia klienta</Link>.
      </p>
      <ScopeBar value={scope} onApply={applyScope} />
      {d.scope?.campaigns && (
        <p className="hint">Wydatki: {num(d.counts.adRows)} z {num(d.counts.adRowsAll)} wierszy reklam pasuje do „{d.scope.campaigns}”.</p>
      )}
      <p className="hint">
        Oznaczenia: <span className="tag tag-data">dane</span> <span className="tag tag-assumption">założenie</span>{" "}
        <span className="tag tag-interp">interpretacja</span> <span className="tag tag-gap">brak danych</span>
      </p>

      <div className="card">
        <h3>Przychód i reklamy miesięcznie</h3>
        <RevenueChart rows={d.monthly} categories={categories} cur={cur} />
        <details style={{ marginTop: 8 }}>
          <summary>Tabela miesięczna</summary>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Miesiąc</th><th className="num">Przychód brutto</th>
                  {categories.map((c) => <th key={c} className="num">{c}</th>)}
                  <th className="num">Wydatki</th><th className="num">Na 1 zł</th><th className="num">Reklamy % przych.</th><th className="num">Nowi klienci</th>
                </tr>
              </thead>
              <tbody>
                {d.monthly.map((m) => (
                  <tr key={m.month}>
                    <td>{m.month}</td>
                    <td className="num">{money(m.gross, cur)}</td>
                    {categories.map((c) => <td key={c} className="num">{money(m.byCategory[c] ?? 0, cur)}</td>)}
                    <td className="num">{money(m.spend, cur)}</td>
                    <td className="num">{num(m.revenuePerSpend, 2)}</td>
                    <td className="num">{pct(m.adsShare)}</td>
                    <td className="num">{num(m.newMainCustomers)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3>Okresy</h3>
        {!s.periods.length && <p className="hint">Bez zdefiniowanych okresów liczony jest cały zakres. Dodaj okresy w ustawieniach klienta, aby je porównać.</p>}
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Wskaźnik</th>{periods.map((p) => <th key={p.name} className="num">{p.name}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(([label, f, kind]) => (
                <tr key={label}>
                  <td>
                    {label}{" "}
                    {kind === "assumption" && <span className="tag tag-assumption">założenie</span>}
                    {kind === "interp" && <span className="tag tag-interp">interpretacja</span>}
                  </td>
                  {periods.map((p) => <td key={p.name} className="num">{f(p)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="hint">
          <li>CAC to górna granica – reklamy sprzedają też inne produkty niż główny.</li>
          <li>LTV liczone tylko dla klientów z pełnym oknem (n = liczba takich klientów). „Okno niedojrzałe” = za mało czasu od zakupu.</li>
          <li>Klienci bez e-maila liczeni jako osobne osoby (zaniża LTV i odsetek powrotów).</li>
          <li>Porównania okresów to nie test A/B – na wynik wpływa też rynek i inne zmiany.</li>
        </ul>
      </div>

      {periods.length > 1 && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>Rozkład przyczyn zmiany (na stałe 10 000 zł reklam)</h3>
          <div className="row">
            <select value={a} onChange={(e) => setA(Number(e.target.value))}>{periods.map((p, i) => <option key={i} value={i}>{p.name}</option>)}</select>
            <span>→</span>
            <select value={b} onChange={(e) => setB(Number(e.target.value))}>{periods.map((p, i) => <option key={i} value={i}>{p.name}</option>)}</select>
            <select value={ltvWindow} onChange={(e) => setLtvWindow(Number(e.target.value))}>
              <option value={30}>LTV 30 dni</option>
              <option value={90}>LTV 90 dni</option>
              <option value={365}>LTV 365 dni</option>
            </select>
          </div>
          {comp ? (
            <>
              <div className="kpi-row" style={{ marginTop: 12 }}>
                <div className="kpi"><span className="hint">Przychód netto z 10 000 zł – {periods[a].name}</span><b>{money(comp.from, cur)}</b></div>
                <div className="kpi"><span className="hint">{periods[b].name}</span><b>{money(comp.to, cur)}</b></div>
                <div className="kpi"><span className="hint">Zmiana</span><b>{money(comp.total, cur)}</b></div>
                <div className="kpi"><span className="hint">Wpływ kosztu pozyskania (CAC)</span><b>{signed(comp.cacEffect, cur)}</b><span className="hint">{comp.cacEffect >= 0 ? "poprawa" : "pogorszenie"}</span></div>
                <div className="kpi"><span className="hint">Wpływ wartości klienta (LTV {ltvWindow} dni)</span><b>{signed(comp.ltvEffect, cur)}</b><span className="hint">{comp.ltvEffect >= 0 ? "poprawa" : "pogorszenie"}</span></div>
              </div>
              <p className="hint">
                Metoda Shapleya (średnia z obu kolejności podstawienia): oba wpływy sumują się do zmiany. Gdy czynniki działają w przeciwnych
                kierunkach, jeden może być większy niż cała zmiana. <span className="tag tag-interp">interpretacja</span>
              </p>
            </>
          ) : (
            <p className="hint">Brak CAC lub LTV w jednym z okresów (np. niedojrzałe okno) – wybierz krótsze okno LTV lub inne okresy.</p>
          )}
        </div>
      )}

      {!!d.products?.length && (
        <details className="card" style={{ marginTop: 16 }}>
          <summary><b>Produkty w danych ({d.from} – {d.to})</b> <span className="hint">– sprawdź, czy kategorie i produkt główny są przypisane dobrze</span></summary>
          <div className="tbl-wrap" style={{ marginTop: 8 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Produkt</th>
                  <th className="num">Sprzedane</th>
                  <th className="num">Mediana ceny</th>
                  <th>Kategoria (reguły)</th>
                  {d.scope?.products && <th>W zawężeniu</th>}
                </tr>
              </thead>
              <tbody>
                {d.products.map((pr) => (
                  <tr key={pr.name}>
                    <td>{pr.name}</td>
                    <td className="num">{num(pr.count)}</td>
                    <td className="num">{money(pr.medianPrice, cur)}</td>
                    <td>{pr.category === s.mainCategory ? <b>{pr.category} (główny)</b> : pr.category}</td>
                    {d.scope?.products && <td>{pr.inScope ? "✓" : ""}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">Reguły kategorii i produkt główny zmienisz w <Link href={`/projects/${projectId}?tab=ustawienia`}>Ustawieniach klienta</Link>. Pokazano do 60 najczęstszych produktów.</p>
        </details>
      )}
    </div>
  );
}
