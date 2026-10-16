"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, ChartColumnBig, ChartPie, Info, Megaphone, Minus, Pencil, ShoppingBag, Target, X } from "lucide-react";
import { shapley, type MonthRow, type PeriodStats } from "@/lib/economics";
import type { ProjectSettings } from "@/lib/settings";
import { RangePicker, isoDay, lastDays } from "../dashboard/RangePicker";
import { api } from "../forms";
import { GREEN, GREEN_SERIES } from "@/lib/palette";

interface Econ {
  empty: boolean;
  from: string;
  to: string;
  dataFrom: string | null;
  dataTo: string | null;
  counts: { orders: number; adRows: number; adRowsAll?: number; customersIdentified: number };
  campaignList?: { name: string; platform: string; spend: number }[];
  products?: { name: string; count: number; medianPrice: number | null; gross: number | null; category: string; inScope: boolean | null }[];
  settings: ProjectSettings;
  monthly: MonthRow[];
  periods: PeriodStats[];
}

// Paleta kategorii (zwalidowana, stała kolejność – kolor idzie za kategorią, nie za pozycją).
export const SERIES = GREEN_SERIES;
const REVENUE = GREEN[700];
const SPEND = "#c2683c";

const money = (v: number | null | undefined, cur: string) =>
  v == null || !Number.isFinite(v) ? "—" : `${v.toLocaleString("pl-PL", { maximumFractionDigits: 0 })} ${cur}`;
const num = (v: number | null | undefined, d = 0) => (v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("pl-PL", { maximumFractionDigits: d }));
const signed = (v: number, cur: string) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString("pl-PL", { maximumFractionDigits: 0 })} ${cur}`;
const pct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toLocaleString("pl-PL", { maximumFractionDigits: 1 })}%`);
const pl = (d: string) => d.split("-").reverse().join(".");
const MONTHS = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

/* ---------- Wykresy ---------- */

function Donut({ parts, total, cur }: { parts: { name: string; value: number; color: string }[]; total: number; cur: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const r = 70;
  const C = 2 * Math.PI * r;
  const sum = parts.reduce((a, p) => a + p.value, 0) || 1;
  let acc = 0;
  const shown = hover ? parts.find((p) => p.name === hover) : null;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 180 180" width={200} height={200} role="img" aria-label="Udział produktów w przychodzie">
        <g transform="rotate(-90 90 90)">
          <circle cx={90} cy={90} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={26} />
          {parts.map((p) => {
            const len = (p.value / sum) * C;
            const gap = parts.length > 1 ? Math.min(2, len / 2) : 0;
            const el = (
              <circle
                key={p.name}
                cx={90} cy={90} r={r} fill="none" stroke={p.color}
                strokeWidth={hover === p.name ? 32 : 26}
                strokeDasharray={`${Math.max(len - gap, 0.01)} ${C}`}
                strokeDashoffset={-acc}
                opacity={hover && hover !== p.name ? 0.35 : 1}
                onMouseEnter={() => setHover(p.name)}
                onMouseLeave={() => setHover(null)}
              />
            );
            acc += len;
            return el;
          })}
        </g>
        <text x={90} y={84} textAnchor="middle" fontSize={11} fill="var(--muted)">{shown ? shown.name.slice(0, 22) : "Przychód"}</text>
        <text x={90} y={104} textAnchor="middle" fontSize={17} fontWeight={700} fill="var(--text)">{money(shown ? shown.value : total, cur)}</text>
        {shown && <text x={90} y={121} textAnchor="middle" fontSize={12} fill="var(--text-2)">{pct(shown.value / sum)}</text>}
      </svg>
      <ul className="donut-legend">
        {parts.map((p) => (
          <li key={p.name} onMouseEnter={() => setHover(p.name)} onMouseLeave={() => setHover(null)} className={hover === p.name ? "on" : ""}>
            <i style={{ background: p.color }} />
            <span className="dl-name">{p.name}</span>
            <b>{pct(p.value / sum)}</b>
            <span className="dl-val">{money(p.value, cur)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MonthBars({ rows, cur }: { rows: MonthRow[]; cur: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const w = 900;
  const h = 220;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.gross, r.spend)));
  const L = 46; // miejsce na podpisy osi
  const bw = (w - L) / Math.max(rows.length, 1);
  const y = (v: number) => h - (v / max) * (h - 12);
  const ticks = [0.25, 0.5, 0.75, 1].map((f) => f * max);
  return (
    <div style={{ position: "relative" }}>
      <div className="chart-legend">
        <span><i style={{ background: REVENUE }} /> Przychód</span>
        <span><i style={{ background: SPEND }} /> Wydatki na reklamy</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h + 22}`} width="100%" role="img" aria-label="Przychód i wydatki na reklamy w kolejnych miesiącach">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={w} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray="3 4" />
            <text x={L - 6} y={y(t) + 3} fontSize={10} textAnchor="end" fill="var(--muted)">{t >= 1000 ? `${num(t / 1000, 1)} tys.` : num(t)}</text>
          </g>
        ))}
        <line x1={L} x2={w} y1={h} y2={h} stroke="var(--border)" />
        {rows.map((r, i) => {
          const gw = Math.min(bw * 0.32, 34);
          const cx = L + (i + 0.5) * bw;
          return (
            <g key={r.month} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} opacity={hover === null || hover === i ? 1 : 0.45}>
              <rect x={L + i * bw} y={0} width={bw} height={h} fill="transparent" />
              <rect x={cx - gw - 1} y={y(r.gross)} width={gw} height={Math.max(h - y(r.gross), 0.5)} fill={REVENUE} rx={3} />
              <rect x={cx + 1} y={y(r.spend)} width={gw} height={Math.max(h - y(r.spend), 0.5)} fill={SPEND} rx={3} />
              {rows.length <= 24 || i % Math.ceil(rows.length / 24) === 0 ? (
                <text x={cx} y={h + 15} fontSize={11} textAnchor="middle" fill="var(--muted)">{monthLabel(r.month)}</text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="chart-tip" style={{ left: `${((L + (hover + 0.5) * bw) / w) * 100}%` }}>
          <b>{monthLabel(rows[hover].month)}</b>
          <br />Przychód: {money(rows[hover].gross, cur)}
          <br />Reklamy: {money(rows[hover].spend, cur)}
          <br />Z 1 {cur} reklam: {num(rows[hover].revenuePerSpend, 2)} {cur}
        </div>
      )}
    </div>
  );
}

/* ---------- Zakres analizy ---------- */

function Picker({ items, selected, onChange, note }: { items: { name: string; meta: string }[]; selected: string[]; onChange: (v: string[]) => void; note?: string }) {
  const [q, setQ] = useState("");
  const sel = new Set(selected);
  const shown = items.filter((i) => !q.trim() || i.name.toLowerCase().includes(q.trim().toLowerCase()));
  const toggle = (n: string) => onChange(sel.has(n) ? selected.filter((x) => x !== n) : [...selected, n]);
  return (
    <div className="picker">
      {note && <div className="picker-note"><Info size={14} /> {note}</div>}
      <div className="row">
        <input placeholder="Szukaj…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 1 }} />
        {q.trim() && shown.length > 1 && (
          <button type="button" className="btn small" onClick={() => onChange([...new Set([...selected, ...shown.map((i) => i.name)])])}>
            Zaznacz pasujące ({shown.length})
          </button>
        )}
        {selected.length > 0 && <button type="button" className="btn small" onClick={() => onChange([])}>Odznacz wszystko</button>}
      </div>
      <div className="picker-list">
        {shown.map((i) => (
          <label key={i.name} className={sel.has(i.name) ? "on" : ""}>
            <input type="checkbox" checked={sel.has(i.name)} onChange={() => toggle(i.name)} />
            <span className="picker-name">{i.name}</span>
            <span className="picker-meta">{i.meta}</span>
          </label>
        ))}
        {!shown.length && <span className="hint">Brak pozycji.</span>}
      </div>
    </div>
  );
}

const listLabel = (xs: string[], all: string) => (!xs.length ? all : xs.length === 1 ? xs[0] : `${xs[0]} +${xs.length - 1}`);

/** Zakres jako równanie: wydatki z wybranych kampanii ÷ nowi klienci wybranego produktu = CAC. Kliknięcie karty = zmiana wyboru. */
function ScopeFlow({ projectId, d, cur, current, onSaved }: { projectId: string; d: Econ; cur: string; current: PeriodStats; onSaved: () => void }) {
  const saved = d.settings.economicsScope ?? { campaigns: [], products: [] };
  const [open, setOpen] = useState<"c" | "p" | null>(null);
  const [c, setC] = useState<string[]>(saved.campaigns);
  const [p, setP] = useState<string[]>(saved.products);
  const [busy, setBusy] = useState(false);
  const active = saved.campaigns.length > 0 || saved.products.length > 0;
  const save = async (scope: { campaigns: string[]; products: string[] }) => {
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/settings`, "PUT", { ...d.settings, economicsScope: scope });
      setOpen(null);
      onSaved();
    } finally {
      setBusy(false);
    }
  };
  const lists = { campaigns: d.campaignList ?? [], products: d.products ?? [] };
  // Zapisane pozycje, których nie ma w bieżących danych, też muszą być widoczne (żeby dało się je odznaczyć).
  const campaignItems = [
    ...lists.campaigns.map((x) => ({ name: x.name, meta: `${x.platform} · ${money(x.spend, cur)}` })),
    ...c.filter((n) => !lists.campaigns.some((x) => x.name === n)).map((n) => ({ name: n, meta: "0 wydatków w okresie" })),
  ];
  const productItems = [
    ...lists.products.map((x) => ({ name: x.name, meta: `${num(x.count)} szt. · ${money(x.gross, cur)}` })),
    ...p.filter((n) => !lists.products.some((x) => x.name === n)).map((n) => ({ name: n, meta: "0 sprzedaży w okresie" })),
  ];
  const mainLabel = saved.products.length ? listLabel(saved.products, "") : (d.settings.mainCategory || "produkt główny").replace(/^wybrane: /, "");
  return (
    <section className="scope-flow-wrap">
      <div className="scope-flow">
        <button className={`sf-card ${open === "c" ? "open" : ""} ${saved.campaigns.length ? "set" : ""}`} onClick={() => setOpen(open === "c" ? null : "c")}>
          <span className="sf-icon t-orange"><Megaphone size={18} /></span>
          <span className="sf-label">Wydatki z kampanii</span>
          <b className="sf-value">{money(current.spend, cur)}</b>
          <span className="sf-chip"><Pencil size={12} /> {listLabel(saved.campaigns, `wszystkie kampanie (${lists.campaigns.length})`)}</span>
        </button>
        <span className="sf-op">÷</span>
        <button className={`sf-card ${open === "p" ? "open" : ""} ${saved.products.length ? "set" : ""}`} onClick={() => setOpen(open === "p" ? null : "p")}>
          <span className="sf-icon t-violet"><ShoppingBag size={18} /></span>
          <span className="sf-label">Nowi klienci produktu</span>
          <b className="sf-value">{num(current.newMainCustomers)}</b>
          <span className="sf-chip"><Pencil size={12} /> {mainLabel}</span>
        </button>
        <span className="sf-op">=</span>
        <div className="sf-card sf-result">
          <span className="sf-icon t-blue"><Target size={18} /></span>
          <span className="sf-label">Koszt pozyskania klienta (CAC)</span>
          <b className="sf-value">{money(current.cac, cur)}</b>
          {active && (
            <button className="sf-reset" disabled={busy} onClick={() => save({ campaigns: [], products: [] })}>
              <X size={12} /> cały projekt
            </button>
          )}
        </div>
      </div>
      {open && (
        <div className="card sf-editor">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <b>{open === "c" ? "Z których kampanii liczyć wydatki?" : "Który produkt sprzedaje ten lejek?"}</b>
            <span className="sf-count">{open === "c" ? (c.length ? `wybrano ${c.length}` : "wszystkie") : p.length ? `wybrano ${p.length}` : "produkt główny z ustawień"}</span>
          </div>
          {open === "c" ? (
            <Picker items={campaignItems} selected={c} onChange={setC} />
          ) : (
            <Picker items={productItems} selected={p} onChange={setP} note="Zaznacz tylko produkt główny. Dodatki z tego samego zamówienia (order bump) liczą się same." />
          )}
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn" onClick={() => setOpen(null)}>Anuluj</button>
            <button className="btn primary" disabled={busy} onClick={() => save({ campaigns: c, products: p })}>{busy ? "Zapisuję…" : "Zapisz"}</button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------- Tabela wskaźników ---------- */

type Row = [string, (p: PeriodStats) => React.ReactNode, ((p: PeriodStats) => number | null)?, boolean?];

function Delta({ a, b, invert }: { a: number | null; b: number | null; invert?: boolean }) {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || !a) return <span className="kpi-delta"><Minus size={13} /></span>;
  const d = b / a - 1;
  const flat = Math.abs(d) < 0.005;
  const good = invert ? d < 0 : d > 0;
  const Arrow = flat ? Minus : d > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`kpi-delta pill ${flat ? "" : good ? "up" : "down"}`}>
      <Arrow size={13} />
      {Math.abs(d * 100).toLocaleString("pl-PL", { maximumFractionDigits: 0 })}%
    </span>
  );
}

const LtvCell = ({ p, w, cur }: { p: PeriodStats; w: number; cur: string }) => {
  const l = p.ltv.find((x) => x.days === w)!;
  if (l.net == null) return <span className="tag tag-gap" title={`Od zakupów w tym okresie minęło mniej niż ${w} dni – jeszcze nie da się policzyć.`}>za wcześnie</span>;
  return <span title={`Policzone dla ${l.matured} z ${p.newMainCustomers} nowych klientów (tych, od których zakupu minęło ${w} dni).`}>{money(l.net, cur)}</span>;
};

/* ---------- Panel ---------- */

export function EconomicsPanel({ projectId, from: fromQ, to: toQ, cmp: cmpQ }: { projectId: string; from?: string; to?: string; cmp?: string }) {
  const router = useRouter();
  const def = lastDays(90);
  const from = fromQ ?? def.from;
  const to = toQ ?? def.to;
  const cmp = cmpQ === "ustawienia" ? "ustawienia" : "poprzedni";
  const [d, setD] = useState<Econ | null>(null);
  const [err, setErr] = useState("");
  const [reload, setReload] = useState(0);
  const [chart, setChart] = useState<"kolo" | "miesiace">("kolo");
  const [a, setA] = useState(0);
  const [b, setB] = useState(1);
  const [ltvWindow, setLtvWindow] = useState(90);
  useEffect(() => {
    api<Econ>(`/api/projects/${projectId}/economics?from=${from}&to=${to}&compare=${cmp}`)
      .then((x) => {
        setD(x);
        setA(0);
        setB(Math.max(0, (x.periods?.length ?? 1) - 1));
      })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, [projectId, from, to, cmp, reload]);
  const pick = (f: string, t: string, c = "poprzedni") => router.push(`?from=${f}&to=${t}${c === "ustawienia" ? "&cmp=ustawienia" : ""}`);

  const categories = useMemo(() => {
    const cur = d?.periods?.[d.periods.length - 1];
    if (!cur) return [];
    return Object.entries(cur.byCategory).filter(([, v]) => v > 0).sort((x, y) => y[1] - x[1]);
  }, [d]);

  if (err) return <p className="error">{err}</p>;
  if (!d) return <p className="hint">Liczę…</p>;
  if (d.empty)
    return (
      <div className="card">
        <p>Brak danych. Podłącz sklep i reklamy albo zaimportuj pliki w <Link href={`/projects/${projectId}/dane?s=api`}>Źródłach danych</Link>.</p>
      </div>
    );
  const cur = d.settings.currency;
  const s = d.settings;
  const periods = d.periods;
  const current = periods[periods.length - 1];
  const two = periods.length === 2;
  const presets = [lastDays(30), lastDays(90), { ...lastDays(365), label: "12 mies." }, ...(d.dataFrom && d.dataTo ? [{ label: "Wszystko", from: d.dataFrom, to: isoDay(Date.now()) }] : [])];
  const comp = periods.length > 1 && periods[a] && periods[b] ? shapley(periods[a], periods[b], ltvWindow) : null;

  const groups: [string, Row[]][] = [
    ["Reklamy → sprzedaż", [
      ["Wydatki na reklamy", (p) => money(p.spend, cur), (p) => p.spend, true],
      ["Zamówienia", (p) => num(p.orders), (p) => p.orders],
      ["Nowi klienci", (p) => num(p.newMainCustomers), (p) => p.newMainCustomers],
      ["Koszt pozyskania klienta (CAC)", (p) => money(p.cac, cur), (p) => p.cac, true],
      ["Przychód brutto", (p) => money(p.gross, cur), (p) => p.gross],
      [`Przychód netto (bez VAT ${s.vat}%)`, (p) => money(p.net, cur), (p) => p.net],
      ["Przychód z 1 zł reklam", (p) => (p.revenuePerSpend == null ? "—" : `${num(p.revenuePerSpend, 2)} ${cur}`), (p) => p.revenuePerSpend],
    ]],
    ["Produkt", [
      ["Sprzedane sztuki", (p) => num(p.mainUnits), (p) => p.mainUnits],
      ["Typowa cena (mediana)", (p) => money(p.mainPriceMedian, cur), (p) => p.mainPriceMedian],
      ["Zamówienia z dodatkiem (order bump)", (p) => pct(p.orderBumpRate), (p) => p.orderBumpRate],
    ]],
    ["Wartość klienta", [
      ...[30, 90, 365].map((w) => [`Wartość klienta po ${w} dniach (LTV)`, (p: PeriodStats) => <LtvCell p={p} w={w} cur={cur} />, (p: PeriodStats) => p.ltv.find((x) => x.days === w)?.net ?? null] as Row),
      ["LTV 90 dni ÷ CAC", (p) => (p.ltvCac90 == null ? "—" : `${num(p.ltvCac90, 2)}×`), (p) => p.ltvCac90],
      ["Klienci kupujący ponownie", (p) => pct(p.repeatRate), (p) => p.repeatRate],
      ["Dalsze zakupy na klienta", (p) => money(p.backendPerCustomer, cur), (p) => p.backendPerCustomer],
    ]],
    ["Wynik", [
      ["Z 10 000 zł reklam: nowi klienci", (p) => num(p.per10k.newCustomers, 1), (p) => p.per10k.newCustomers],
      ["Z 10 000 zł reklam: przychód netto (90 dni)", (p) => money(p.per10k.netRevenue90, cur), (p) => p.per10k.netRevenue90],
      ["Z 10 000 zł reklam: zostaje po reklamach", (p) => money(p.per10k.afterAds, cur), (p) => p.per10k.afterAds],
      ["Zysk szacunkowy po podatku", (p) => money(p.profit.afterTax, cur), (p) => p.profit.afterTax],
    ]],
  ];
  const maxGross = Math.max(1, ...d.monthly.map((m) => m.gross));

  return (
    <div className="econ">
      <div className="econ-bar">
        <RangePicker from={from} to={to} presets={presets} onPick={(f, t) => pick(f, t)} active={cmp === "ustawienia" ? "Okresy z ustawień" : undefined} />
        {s.periods.length > 0 && (
          <button className={`btn small ${cmp === "ustawienia" ? "primary" : ""}`} onClick={() => pick(from, to, cmp === "ustawienia" ? "poprzedni" : "ustawienia")}>
            Okresy z ustawień ({s.periods.length})
          </button>
        )}
      </div>

      <ScopeFlow key={JSON.stringify(s.economicsScope)} projectId={projectId} d={d} cur={cur} current={current} onSaved={() => setReload((x) => x + 1)} />

      <div className="card econ-card">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h3 style={{ margin: 0 }}>Przychód {pl(current.from)} – {pl(current.to)}</h3>
          <div className="seg" role="group" aria-label="Rodzaj wykresu">
            <button className={chart === "kolo" ? "on" : ""} onClick={() => setChart("kolo")}><ChartPie size={15} /> Z czego</button>
            <button className={chart === "miesiace" ? "on" : ""} onClick={() => setChart("miesiace")}><ChartColumnBig size={15} /> Miesiące + reklamy</button>
          </div>
        </div>
        {chart === "kolo" ? (
          categories.length ? (
            <div className="econ-split">
              <Donut parts={categories.map(([n, v], i) => ({ name: n, value: v, color: SERIES[i % SERIES.length] }))} total={current.gross} cur={cur} />
              <div className="econ-money">
                <div><span>Przychód</span><b style={{ color: REVENUE }}>{money(current.gross, cur)}</b></div>
                <div><span>Wydatki na reklamy</span><b>− {money(current.spend, cur)}</b></div>
                <div className="em-bar" aria-hidden>
                  <i style={{ width: `${Math.min(100, current.gross ? (current.spend / current.gross) * 100 : 100)}%`, background: SPEND }} />
                </div>
                <div className="em-total"><span>Zostaje po reklamach</span><b>{money(current.gross - current.spend, cur)}</b></div>
                <div className="em-note">{current.gross ? `Reklamy zjadają ${pct(current.spend / current.gross)} przychodu` : ""}</div>
              </div>
            </div>
          ) : (
            <p>Brak sprzedaży w tym okresie.</p>
          )
        ) : (
          <MonthBars rows={d.monthly} cur={cur} />
        )}
        <details style={{ marginTop: 12 }}>
          <summary>Tabela miesięczna</summary>
          <div className="tbl-wrap">
            <table className="tbl month-tbl">
              <thead>
                <tr>
                  <th>Miesiąc</th><th className="num">Wydatki</th><th>Przychód</th><th className="num">Z 1 zł reklam</th><th className="num">Nowi klienci</th><th className="num">CAC</th>
                </tr>
              </thead>
              <tbody>
                {d.monthly.map((m) => (
                  <tr key={m.month}>
                    <td>{monthLabel(m.month)}</td>
                    <td className="num">{money(m.spend, cur)}</td>
                    <td>
                      <span className="mt-bar"><i style={{ width: `${(m.gross / maxGross) * 100}%` }} /></span>
                      <span className="mt-val">{money(m.gross, cur)}</span>
                    </td>
                    <td className="num">
                      {m.revenuePerSpend == null ? "—" : <span className={`roi ${m.revenuePerSpend >= 1 ? "up" : "down"}`}>{num(m.revenuePerSpend, 2)} {cur}</span>}
                    </td>
                    <td className="num">{num(m.newMainCustomers)}</td>
                    <td className="num">{m.newMainCustomers ? money(m.spend / m.newMainCustomers, cur) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>

      <div className="card econ-card">
        <h3>Wskaźniki</h3>
        <div className="tbl-wrap">
          <table className="tbl kpi-tbl">
            <thead>
              <tr>
                <th />
                {periods.map((p) => (
                  <th key={p.name} className="num">
                    {two ? (p === current ? "Wybrany okres" : "Poprzedni okres") : p.name}
                    <span className="th-dates">{pl(p.from)} – {pl(p.to)}</span>
                  </th>
                ))}
                {two && <th className="num">Zmiana</th>}
              </tr>
            </thead>
            {groups.map(([g, rows]) => (
              <tbody key={g}>
                <tr className="grp"><td colSpan={periods.length + (two ? 2 : 1)}>{g}</td></tr>
                {rows.map(([label, f, v, invert]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    {periods.map((p) => <td key={p.name} className="num">{f(p)}</td>)}
                    {two && <td className="num">{v ? <Delta a={v(periods[0])} b={v(periods[1])} invert={invert} /> : null}</td>}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </div>

      {periods.length > 1 && (
        <div className="card econ-card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 style={{ margin: 0 }}>Co zmieniło wynik z 10 000 zł reklam</h3>
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
          </div>
          {comp ? (
            <div className="kpi2-row">
              <div className="kpi2"><span className="kpi2-label">{periods[a].name}</span><b className="kpi2-value">{money(comp.from, cur)}</b></div>
              <div className="kpi2"><span className="kpi2-label">{periods[b].name}</span><b className="kpi2-value">{money(comp.to, cur)}</b></div>
              <div className="kpi2"><span className="kpi2-label">Wpływ kosztu pozyskania</span><b className="kpi2-value" style={{ color: comp.cacEffect >= 0 ? "var(--ok)" : "var(--danger)" }}>{signed(comp.cacEffect, cur)}</b></div>
              <div className="kpi2"><span className="kpi2-label">Wpływ wartości klienta</span><b className="kpi2-value" style={{ color: comp.ltvEffect >= 0 ? "var(--ok)" : "var(--danger)" }}>{signed(comp.ltvEffect, cur)}</b></div>
            </div>
          ) : (
            <p>Za mało danych w jednym z okresów – wybierz krótsze LTV albo dłuższy okres.</p>
          )}
        </div>
      )}
    </div>
  );
}
