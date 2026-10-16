"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../forms";
import { Tip } from "../Tip";
import Link from "next/link";
import {
  AlignLeft, ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, CircleCheck, CircleX, Clapperboard, Compass, Flag, Hourglass, Layers, Link as LinkIcon, Lock, Megaphone,
  MousePointerClick, Palette, Pencil, Plus, Quote, RefreshCw, ShoppingBag, Sparkles, TriangleAlert, Trophy, Users, X, Zap,
} from "lucide-react";
import { STATUS_ICON, pct, splitName, zl } from "./AdTestsHome";
import {
  ELEMENTS, IDEA_SOURCES, LETTERS, META_URL_PARAMS, budgetPerVariant, variantLink, verdictDate, type Decision, type TestSettings,
} from "@/lib/ad-tests";
import type { RoundResult, TestResult, VariantResult } from "@/lib/ad-tests-data";

const REFRESH_MS = 30_000;

function Copy({ text, label = "Kopiuj" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="btn small" onClick={() => navigator.clipboard.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); })}>
      {ok ? "Skopiowano ✓" : label}
    </button>
  );
}

export function AdTestView({ projectId, testId, openCreator }: { projectId: string; testId: string; openCreator: boolean }) {
  const [data, setData] = useState<{ settings: TestSettings; test: TestResult } | null>(null);
  const [err, setErr] = useState("");
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const [creator, setCreator] = useState(openCreator);
  const load = useCallback(
    () =>
      api<{ settings: TestSettings; test: TestResult }>(`/api/ad-tests/${testId}`)
        .then((d) => {
          setData(d);
          setLoadedAt(new Date());
        })
        .catch((e) => setErr(e.message)),
    [testId],
  );
  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  if (err) return <p className="error">{err}</p>;
  if (!data) return <p className="hint">Liczę wyniki…</p>;
  const { test: t, settings: s } = data;
  const rounds = [...t.rounds].reverse();

  return (
    <div>
      <Link href={`/projects/${projectId}/testy`} className="back-link"><ArrowLeft size={16} /> Testy</Link>
      <div className="at-head">
        <h1>{t.angle}</h1>
        <div className="seg" role="group" aria-label="Status testu">
          {(["planowany", "w toku", "zakończony"] as const).map((st) => {
            const SI = STATUS_ICON[st];
            return (
              <button
                key={st}
                className={t.status === st ? "on" : ""}
                onClick={async () => {
                  await api(`/api/ad-tests/${testId}`, "PATCH", { status: st });
                  load();
                }}
              >
                <SI size={15} /> {st}
              </button>
            );
          })}
        </div>
        <button className="btn primary" onClick={() => setCreator((v) => !v)}>{creator ? <><X size={16} /> Zamknij</> : <><Plus size={16} /> Nowa runda</>}</button>
      </div>
      <div className="tt-chips big">
        <span title={`Wariant wygrywa przy koszcie kursanta poniżej ${zl(s.cacMax)}. Werdykt po wydaniu ${zl(budgetPerVariant(s))} na wariant.`}><Trophy size={15} /> poniżej {zl(s.cacMax)}</span>
        <span className="copper" title="Powyżej tej kwoty wariant przegrywa"><X size={15} /> powyżej {zl(s.loseCac)}</span>
        <span title={s.productMatch.join(", ") || "Produkt główny nie ustawiony"} className={s.productMatch.length ? "" : "warn"}>
          <ShoppingBag size={15} /> {s.productMatch.length ? (s.productMatch.length === 1 ? splitName(s.productMatch[0])[0] : `${s.productMatch.length} produkty`) : "brak produktu"}
        </span>
        <button className="icon-btn" onClick={load} title={`Odśwież (automatycznie co 30 s, ostatnio ${loadedAt?.toLocaleTimeString("pl-PL") ?? "—"})`} aria-label="Odśwież"><RefreshCw size={15} /></button>
      </div>

      {creator && <RoundCreator testId={testId} angle={t.angle} settings={s} rounds={t.rounds} onDone={() => { setCreator(false); load(); }} />}

      {t.watch.length > 0 && <Watch watch={t.watch} />}

      {rounds.map((r) => (
        <RoundTable key={r.id} r={r} s={s} onChanged={load} />
      ))}
      {!rounds.length && !creator && <div className="empty-box"><Plus size={24} /> Brak rund – kliknij „Nowa runda”.</div>}
    </div>
  );
}

const ELEMENT_ICON: Record<string, typeof Flag> = {
  hook: Zap, body: AlignLeft, close: Lock, "kąt": Compass, CTA: MousePointerClick, format: Clapperboard, odbiorcy: Users, "styl graficzno-wizualny": Palette,
  // nazwy z wcześniejszych rund
  "pierwsze zdanie": Quote, "środek": AlignLeft, obietnica: Sparkles, wezwanie: MousePointerClick,
};

/** Nazwy reklam do Meta + linki z UTM dla rundy (po utworzeniu i później, z widoku rundy). */
function RoundLinks({ variants, pageUrl, verdictDate }: { variants: { letter: string; name: string }[]; pageUrl: string; verdictDate: string | null }) {
  return (
    <div className="round-links">
      <p>W Menedżerze reklam nazwij reklamy <b>dokładnie tak</b> i wklej parametry URL – po nazwie aplikacja połączy wydatki, wejścia i zamówienia.</p>
      <div className="row" style={{ marginBottom: 8 }}><code className="wrap">{META_URL_PARAMS}</code><Copy text={META_URL_PARAMS} label="Kopiuj parametry URL" /></div>
      <div className="ad-grid">
        {variants.map((v) => (
          <div key={v.letter} className="ad-card run">
            <div className="ad-mock static"><span className="ad-mock-top"><span className="ad-dot" /><span className="ad-line" /></span><span className="ad-mock-img"><Megaphone size={26} /></span><span className="ad-letter">{v.letter}</span></div>
            <code className="wrap">{v.name}</code>
            <Copy text={v.name} label="Kopiuj nazwę" />
            {pageUrl && <Copy text={variantLink(pageUrl, v.name)} label="Kopiuj link z UTM" />}
          </div>
        ))}
      </div>
      {verdictDate && <div className="tt-chips big"><span><Flag size={15} /> werdykt: <b>{verdictDate}</b></span></div>}
    </div>
  );
}

function RoundTable({ r, s, onChanged }: { r: RoundResult; s: TestSettings; onChanged: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [links, setLinks] = useState(false);
  const EI = ELEMENT_ICON[r.element] ?? Flag;
  const sel = r.variants.find((v) => v.id === open);
  return (
    <section className="card round">
      <div className="round-head">
        <span className="round-n">R{r.number}</span>
        <EI size={18} className="round-el" />
        <h3>{r.element}</h3>
        <div className="tt-chips">
          <span title="Start rundy"><CalendarDays size={14} /> {r.start_date}</span>
          <span title="Data werdyktu"><Flag size={14} /> {r.verdict_date ?? "—"}</span>
          {r.daysToVerdict != null && <span title="Do werdyktu"><Hourglass size={14} /> {r.daysToVerdict > 0 ? `${r.daysToVerdict} dn.` : "teraz"}</span>}
          {r.status !== "w toku" && <span><CircleCheck size={14} /> {r.status}</span>}
        </div>
        <button className={`btn small ${links ? "primary" : ""}`} style={{ marginLeft: "auto" }} onClick={() => setLinks((v) => !v)}><LinkIcon size={14} /> Nazwy i linki</button>
      </div>
      {links && <RoundLinks variants={r.variants.map((v) => ({ letter: v.letter, name: v.meta_ad_name }))} pageUrl={r.page_url ?? ""} verdictDate={r.verdict_date} />}
      {r.hints.map((h, i) => (
        <div key={i} className="round-hint"><TriangleAlert size={14} /> {h}</div>
      ))}
      <div className="ad-grid">
        {r.variants.map((v) => (
          <AdCard key={v.id} v={v} open={open === v.id} onToggle={() => setOpen(open === v.id ? null : v.id)} onChanged={onChanged} />
        ))}
      </div>
      {sel && <VariantDetail v={sel} s={s} onChanged={onChanged} />}
    </section>
  );
}

const SRC_LABEL = { api: "Meta API", manual: "ręcznie", tracked: "sklep (UTM)" } as const;

/** Wariant jako karta reklamy: litera + ikona reklamy, a pod spodem: ile wydano i co to dało. */
function AdCard({ v, open, onToggle, onChanged }: { v: VariantResult; open: boolean; onToggle: () => void; onChanged: () => void }) {
  const sug = v.suggestion;
  const tone = v.decision === "wygrał" || sug.code === "zwyciezca" ? "win" : ["wylacz", "przegrywa"].includes(sug.code) || ["przegrał", "wyłączony"].includes(v.decision) ? "lose" : "run";
  const decide = async (decision: Decision) => {
    await api(`/api/ad-test-variants/${v.id}`, "PATCH", { decision });
    onChanged();
  };
  const progress = Math.min(100, Math.round(v.d.progress * 100));
  const perBuyer = v.totals.mainOrders ? v.totals.revenue / v.totals.mainOrders : null;
  return (
    <div className={`ad-card ${tone} ${open ? "open" : ""}`}>
      <button type="button" className="ad-mock" onClick={onToggle} title={v.change_to}>
        <span className="ad-mock-top"><span className="ad-dot" /><span className="ad-line" /></span>
        <span className="ad-mock-img"><Megaphone size={26} /></span>
        <span className="ad-letter">{v.letter}</span>
        {tone === "win" && <Trophy size={18} className="ad-badge" />}
      </button>
      <div className="ad-spend">
        <div className="row" style={{ justifyContent: "space-between" }}><span>Wydano</span><b>{zl(v.totals.spend)}</b></div>
        <div className="bar wide" title={`${progress}% budżetu do werdyktu`}><span style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="ad-stats">
        <div><span>Kursanci</span><b>{v.totals.mainOrders}</b></div>
        <div><span>Koszt kursanta</span><b>{zl(v.d.cac)}</b></div>
        <div><span>Przychód</span><b>{zl(v.totals.revenue)}</b></div>
        <div><span>Z 1 zł</span><b>{v.d.revPerSpend == null ? "—" : `${v.d.revPerSpend.toLocaleString("pl-PL", { maximumFractionDigits: 2 })} zł`}</b></div>
        <div><span>Na kursanta</span><b>{zl(perBuyer)}</b></div>
        <div><span>CTR</span><b>{pct(v.d.ctr, 2)}</b></div>
      </div>
      <span className={`sug ${sug.code}`}>{tone === "win" ? <Trophy size={13} /> : tone === "lose" ? <CircleX size={13} /> : <Hourglass size={13} />} {sug.label}</span>
      <div className="ad-actions">
        {v.decision !== "w toku" ? (
          <span className={`badge dec-${v.decision}`}>{v.decision}</span>
        ) : (
          <>
            {sug.decision !== "w toku" && <button className="btn small primary" onClick={() => decide(sug.decision)} title={`Zapisz decyzję: ${sug.decision}`}><Check size={14} /> Zatwierdź</button>}
            <select value="" onChange={(e) => e.target.value && decide(e.target.value as Decision)} aria-label="Decyzja">
              <option value="">{sug.decision !== "w toku" ? "inna…" : "decyzja…"}</option>
              <option>wygrał</option><option>przegrał</option><option>remis</option><option>wyłączony</option>
            </select>
          </>
        )}
        <button className="icon-btn" onClick={onToggle} title="Szczegóły" aria-label="Szczegóły"><ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : undefined }} /></button>
      </div>
    </div>
  );
}

function VariantDetail({ v, s, onChanged }: { v: VariantResult; s: TestSettings; onChanged: () => void }) {
  const [m, setM] = useState({ day: new Date().toISOString().slice(0, 10), spend: "", impressions: "", linkClicks: "", video3s: "", thruplay: "", orders: "", revenue: "" });
  const [err, setErr] = useState("");
  const max = Math.max(1, ...v.daily.map((d) => d.spend));
  return (
    <div className="vd card">
      <div className="vd-change">
        <span className="ad-letter big">{v.letter}</span>
        <div>
          <span className="vd-label">Co zmieniono</span>
          <p className="vd-text">{v.change_to || "—"}</p>
          {v.idea_source && <><span className="vd-label">Skąd pomysł</span><p>{v.idea_source}</p></>}
          {v.hypothesis && <><span className="vd-label">Hipoteza</span><p>{v.hypothesis}</p></>}
        </div>
      </div>
      <div>
        <b>Dzień po dniu</b>
        {v.daily.length ? (
          <div className="daybars" title="Słupek = wydatki, liczba = kursy">
            {v.daily.map((d) => (
              <div key={d.day} className="daybar">
                <span style={{ height: `${Math.round((d.spend / max) * 60)}px` }} />
                <em>{d.mainOrders || ""}</em>
                <small>{d.day.slice(5)}</small>
              </div>
            ))}
          </div>
        ) : (
          <p className="hint">Brak danych dziennych.</p>
        )}
        <div className="vd-stats">
          <span title="Hook rate (odtworzenia 3 s ÷ wyświetlenia)"><b>{pct(v.d.hook, 0)}</b> hook</span>
          <span title="Utrzymanie (ThruPlay ÷ odtworzenia 3 s)"><b>{pct(v.d.retention, 0)}</b> utrzymanie</span>
          <span title="Przychód z 1 zł wydanego na wariant"><b>{v.d.revPerSpend == null ? "—" : v.d.revPerSpend.toLocaleString("pl-PL", { maximumFractionDigits: 2 })}</b> zł z 1 zł</span>
          <span title="Różnica kosztu kursanta do najlepszego wariantu"><b>{v.suggestion.diffToBest == null ? "—" : v.suggestion.diffToBest === 0 ? "najlepszy" : `+${pct(v.suggestion.diffToBest, 0)}`}</b> vs najlepszy</span>
          <span title="Wejścia z linku wariantu (utm_content)"><b>{v.totals.visits}</b> wejść</span>
          <span title="Wszystkie zamówienia przypisane do wariantu"><b>{v.totals.orders}</b> zamówień</span>
          <span title="CPA raportowane przez Meta – tylko do porównania"><b>{zl(v.d.metaCpa)}</b> CPA Meta</span>
          <span title="Skąd dane"><b>{v.sources.meta ? SRC_LABEL[v.sources.meta] : "brak"}</b> wydatki</span>
        </div>
      </div>
      <div>
        <b>Do Menedżera reklam</b>
        <div className="row" style={{ marginTop: 4 }}><code>{v.meta_ad_name}</code><Copy text={v.meta_ad_name} label="Kopiuj nazwę" /></div>
        <div style={{ marginTop: 6 }}>Parametry URL <Tip text="Wklej w polu „Parametry URL” reklamy. Meta sama wstawi nazwę kampanii i reklamy." /></div>
        <div className="row"><code className="wrap">{META_URL_PARAMS}</code><Copy text={META_URL_PARAMS} /></div>
      </div>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setErr("");
          try {
            const n = (x: string) => (x.trim() ? Number(x.replace(",", ".")) : 0);
            await api(`/api/ad-test-variants/${v.id}/manual`, "POST", {
              day: m.day, spend: n(m.spend), impressions: n(m.impressions), linkClicks: n(m.linkClicks), video3s: n(m.video3s), thruplay: n(m.thruplay), orders: n(m.orders), revenue: n(m.revenue),
            });
            setM({ ...m, spend: "", impressions: "", linkClicks: "", video3s: "", thruplay: "", orders: "", revenue: "" });
            onChanged();
          } catch (e2) {
            setErr((e2 as Error).message);
          }
        }}
      >
        <b>Wpisz ręcznie</b> <Tip text="Gdy integracja nie działa. Liczby automatyczne (Meta / sklep) zastąpią ręczne, gdy zaczną spływać." />
        <div className="manual-grid">
          <input type="date" value={m.day} onChange={(e) => setM({ ...m, day: e.target.value })} />
          {(
            [
              ["spend", "Wydatki zł"], ["impressions", "Wyświetlenia"], ["linkClicks", "Kliknięcia linku"], ["video3s", "Odtw. 3 s"],
              ["thruplay", "ThruPlay"], ["orders", "Kursy"], ["revenue", "Przychód zł"],
            ] as [keyof typeof m, string][]
          ).map(([k, l]) => (
            <input key={k} placeholder={l} value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value })} inputMode="decimal" />
          ))}
          <button className="btn small">Dodaj dzień</button>
        </div>
        {err && <p className="error">{err}</p>}
      </form>
    </div>
  );
}

function Watch({ watch }: { watch: TestResult["watch"] }) {
  return (
    <section className="card round">
      <h3 style={{ marginTop: 0 }}><Trophy size={17} /> Zwycięzcy w skalowaniu</h3>
      {watch.map((w) => (
        <div key={w.variantId} className="watch">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <b>R{w.round} {w.letter} · <code>{w.name}</code></b>
            {w.fatigue ? <span className="sug przegrywa"><TriangleAlert size={13} /> {w.fatigue}</span> : <span className="sug zwyciezca"><CircleCheck size={13} /> bez zmęczenia</span>}
          </div>
          {w.scaling && <div className="sug zwyciezca" style={{ marginTop: 4 }}>{w.scaling}</div>}
          <table className="tbl" style={{ marginTop: 6 }}>
            <thead><tr><th>Tydzień</th><th>Od</th><th className="num">Wydatki</th><th className="num">CTR</th><th className="num">Kursy</th><th className="num">CAC</th></tr></thead>
            <tbody>
              {w.weeks.map((x) => (
                <tr key={x.week}><td>{x.week + 1}</td><td>{x.from}</td><td className="num">{zl(x.spend)}</td><td className="num">{pct(x.ctr, 2)}</td><td className="num">{x.mainOrders}</td><td className="num">{zl(x.cac)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

interface VarDraft { changeTo: string; ideas: string[]; own: string; hypothesis: string }

const ideaText = (v: VarDraft) => [...v.ideas, ...(v.own.trim() ? [v.own.trim()] : [])].join(", ");

/** Kreator rundy w oknie: element → ustawienia → wariant A, B, C… (każdy osobno, zatwierdzany) → podsumowanie. */
function RoundCreator({ testId, settings: s, rounds, onDone }: { testId: string; angle: string; settings: TestSettings; rounds: RoundResult[]; onDone: () => void }) {
  const last = rounds[rounds.length - 1];
  const number = (last?.number ?? 0) + 1;
  const [element, setElement] = useState<string>("");
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [pageUrl, setPageUrl] = useState(last?.page_url ?? "");
  const [count, setCount] = useState(Math.min(LETTERS.length, Math.max(2, s.variantsPerRound)));
  const [custom, setCustom] = useState(false);
  const [daily, setDaily] = useState(String(Math.round(budgetPerVariant(s) / 7)));
  const [vars, setVars] = useState<VarDraft[]>(() => LETTERS.map(() => ({ changeTo: "", ideas: [], own: "", hypothesis: "" })));
  const [step, setStep] = useState(0); // 0 element, 1 ustawienia, 2..(2+count-1) warianty, 2+count podsumowanie
  const [fromSummary, setFromSummary] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ number: number; verdictDate: string | null; variants: { letter: string; name: string }[] } | null>(null);
  const vd = Number(daily) > 0 ? verdictDate(start, Number(daily), s) : null;
  const summary = 2 + count;
  const vi = step - 2;
  const setVar = (i: number, patch: Partial<VarDraft>) => setVars(vars.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  const labels = ["Element", "Ustawienia", ...LETTERS.slice(0, count), "Gotowe"];
  const close = () => (result ? onDone() : window.confirm("Zamknąć kreator? Wpisane warianty nie zostaną zapisane.") && onDone());

  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal wiz wide rc" role="dialog" aria-modal="true" aria-label={`Nowa runda ${number}`}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <b className="wiz-title"><Layers size={18} /> {result ? `Runda ${result.number} gotowa` : `Nowa runda ${number}`}</b>
          <button className="icon-btn" onClick={close} aria-label="Zamknij"><X size={18} /></button>
        </div>
        {result ? (
          <>
            <RoundLinks variants={result.variants} pageUrl={pageUrl} verdictDate={result.verdictDate} />
            <div className="wiz-nav"><span /><button className="btn primary" onClick={onDone}>Gotowe</button></div>
          </>
        ) : (
          <>
            <ol className="wiz-steps">
              {labels.map((x, i) => (
                <li key={x} className={i === step ? "on" : i < step ? "done" : ""}><span>{i < step ? <Check size={11} /> : i + 1}</span>{x}</li>
              ))}
            </ol>

            {step === 0 && (
              <div className="wiz-body">
                <label className="wiz-q">Co zmieniasz w tej rundzie? <Tip text="W jednej rundzie zmieniasz tylko jeden element reklamy – wtedy wiadomo, co dało wynik." /></label>
                <div className="el-grid">
                  {ELEMENTS.map((x) => {
                    const EI = ELEMENT_ICON[x] ?? Flag;
                    return (
                      <button type="button" key={x} className={`el-tile ${element === x ? "on" : ""}`} onClick={() => { setElement(x); setStep(1); }}>
                        <EI size={22} />
                        <b>{x}</b>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {step === 1 && (
              <form className="wiz-body" onSubmit={(e) => { e.preventDefault(); setStep(2); }}>
                <div className="rc-grid">
                  <label className="rc-field"><span><CalendarDays size={15} /> Start</span><input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
                  <label className="rc-field"><span><Megaphone size={15} /> Budżet dzienny na wariant <Tip text="Z niego liczy się data werdyktu: start + budżet na wariant ÷ budżet dzienny." /></span>
                    <span className="money-input sm"><input inputMode="decimal" value={daily} onChange={(e) => setDaily(e.target.value.replace(",", "."))} /><span>zł</span></span>
                  </label>
                  <label className="rc-field wide"><span><Flag size={15} /> Strona, na którą prowadzi reklama <Tip text="Potrzebna do gotowych linków z UTM. Możesz zostawić puste i użyć parametrów URL." /></span><input value={pageUrl} onChange={(e) => setPageUrl(e.target.value)} /></label>
                </div>
                <label className="wiz-q small">Ile wariantów?</label>
                <div className="count-tiles">
                  {[2, 3, 4].map((n) => (
                    <button type="button" key={n} className={!custom && count === n ? "on" : ""} onClick={() => { setCustom(false); setCount(n); }}>{n}</button>
                  ))}
                  <button type="button" className={custom ? "on" : ""} onClick={() => setCustom(true)}>inna</button>
                  {custom && (
                    <input className="count-input" type="number" min={2} max={LETTERS.length} value={count} onChange={(e) => setCount(Math.min(LETTERS.length, Math.max(2, Number(e.target.value) || 2)))} aria-label="Liczba wariantów" />
                  )}
                </div>
                {vd && <div className="tt-chips big"><span><Flag size={15} /> werdykt: <b>{vd}</b></span></div>}
                <div className="wiz-nav">
                  <button type="button" className="btn" onClick={() => setStep(0)}><ArrowLeft size={16} /> Wstecz</button>
                  <button className="btn primary">Dalej <ArrowRight size={16} /></button>
                </div>
              </form>
            )}

            {step >= 2 && step < summary && (
              <form
                className="wiz-body"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!vars[vi].changeTo.trim()) return;
                  setStep(fromSummary ? summary : step + 1);
                  setFromSummary(false);
                }}
              >
                <div className="rc-var">
                  <span className="ad-letter big">{LETTERS[vi]}</span>
                  <div className="rc-var-fields">
                    <label className="wiz-q small">Co zmieniasz w wariancie {LETTERS[vi]}? <span className="el-chip">{element}</span></label>
                    <textarea key={`c${vi}`} autoFocus rows={4} value={vars[vi].changeTo} onChange={(e) => setVar(vi, { changeTo: e.target.value })} />
                    <label className="wiz-q small">Skąd pomysł? <Tip text="Możesz zaznaczyć kilka." /></label>
                    <div className="idea-grid">
                      {IDEA_SOURCES.map((x) => {
                        const on = vars[vi].ideas.includes(x);
                        return (
                          <button type="button" key={x} className={`idea-tile ${on ? "on" : ""}`} onClick={() => setVar(vi, { ideas: on ? vars[vi].ideas.filter((y) => y !== x) : [...vars[vi].ideas, x] })}>
                            {on ? <CircleCheck size={16} /> : <span className="pp-dot" />} {x}
                          </button>
                        );
                      })}
                      <label className={`idea-tile own ${vars[vi].own.trim() ? "on" : ""}`}>
                        <Pencil size={15} />
                        <input value={vars[vi].own} onChange={(e) => setVar(vi, { own: e.target.value })} aria-label="Własne źródło pomysłu" placeholder="własne" />
                      </label>
                    </div>
                    <label className="wiz-q small">Hipoteza <Tip text="Dlaczego ten wariant ma wygrać – pomaga potem zrozumieć, czego uczy wynik." /></label>
                    <textarea key={`h${vi}`} rows={3} value={vars[vi].hypothesis} onChange={(e) => setVar(vi, { hypothesis: e.target.value })} />
                  </div>
                </div>
                <div className="wiz-nav">
                  <button type="button" className="btn" onClick={() => { setFromSummary(false); setStep(fromSummary ? summary : step - 1); }}><ArrowLeft size={16} /> Wstecz</button>
                  <button className="btn primary" disabled={!vars[vi].changeTo.trim()}><Check size={16} /> Zatwierdź {LETTERS[vi]}</button>
                </div>
              </form>
            )}

            {step === summary && (
              <div className="wiz-body">
                <label className="wiz-q">Sprawdź warianty <Tip text="Kliknij wariant, żeby go poprawić." /></label>
                <div className="sum-grid">
                  {vars.slice(0, count).map((v, i) => (
                    <button type="button" key={i} className="sum-tile" onClick={() => { setFromSummary(true); setStep(2 + i); }} title="Edytuj">
                      <span className="ad-mock-img sm"><Megaphone size={22} /></span>
                      <span className="ad-letter">{LETTERS[i]}</span>
                      <CircleCheck size={18} className="sum-ok" />
                      <Pencil size={14} className="sum-edit" />
                    </button>
                  ))}
                </div>
                <div className="tt-chips big">
                  <span>{(() => { const EI = ELEMENT_ICON[element] ?? Flag; return <EI size={15} />; })()} {element}</span>
                  <span><CalendarDays size={15} /> {start}</span>
                  <span><Flag size={15} /> werdykt: <b>{vd ?? "—"}</b></span>
                </div>
                {err && <p className="error">{err}</p>}
                <div className="wiz-nav">
                  <button type="button" className="btn" onClick={() => setStep(summary - 1)} disabled={busy}><ArrowLeft size={16} /> Wstecz</button>
                  <button
                    className="btn primary"
                    disabled={busy}
                    onClick={async () => {
                      setErr("");
                      setBusy(true);
                      try {
                        const r = await api<{ number: number; verdictDate: string | null; variants: { letter: string; name: string }[] }>(`/api/ad-tests/${testId}/rounds`, "POST", {
                          element,
                          startDate: start,
                          pageUrl,
                          variants: vars.slice(0, count).map((v) => ({ changeTo: v.changeTo, ideaSource: ideaText(v), hypothesis: v.hypothesis, dailyBudget: Number(daily) || 0 })),
                        });
                        setResult(r);
                      } catch (e) {
                        setErr((e as Error).message);
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    {busy ? "Tworzę…" : "Utwórz rundę"} <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
