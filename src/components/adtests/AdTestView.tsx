"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "../forms";
import { Tip } from "../Tip";
import Link from "next/link";
import { ArrowLeft, CalendarDays, CircleCheck, CircleX, Flag, Hourglass, Plus, RefreshCw, ShoppingBag, Target, TriangleAlert, Trophy, Wallet, X } from "lucide-react";
import { STATUS_ICON, pct, zl } from "./AdTestsHome";
import {
  ELEMENTS, IDEA_SOURCES, LETTERS, META_URL_PARAMS, adName, budgetPerVariant, variantLink, verdictDate, type Decision, type TestSettings,
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
        <span title="Maksymalny koszt kursanta"><Target size={15} /> maks. {zl(s.cacMax)}</span>
        <span title="Budżet na wariant do werdyktu"><Wallet size={15} /> {zl(budgetPerVariant(s))} / wariant</span>
        <span title={s.productMatch.join(", ") || "Produkt główny nie ustawiony"} className={s.productMatch.length ? "" : "warn"}>
          <ShoppingBag size={15} /> {s.productMatch.length ? (s.productMatch.length === 1 ? s.productMatch[0] : `${s.productMatch.length} produkty`) : "brak produktu"}
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

function RoundTable({ r, s, onChanged }: { r: RoundResult; s: TestSettings; onChanged: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="card round">
      <div className="round-head">
        <span className="round-n">R{r.number}</span>
        <h3>{r.element}</h3>
        <div className="tt-chips">
          <span title="Start rundy"><CalendarDays size={14} /> {r.start_date}</span>
          <span title="Data werdyktu"><Flag size={14} /> {r.verdict_date ?? "—"}</span>
          {r.daysToVerdict != null && <span title="Do werdyktu"><Hourglass size={14} /> {r.daysToVerdict > 0 ? `${r.daysToVerdict} dn.` : "teraz"}</span>}
          {r.status !== "w toku" && <span><CircleCheck size={14} /> {r.status}</span>}
        </div>
      </div>
      {r.hints.map((h, i) => (
        <div key={i} className="round-hint"><TriangleAlert size={14} /> {h}</div>
      ))}
      <div className="tbl-wrap">
        <table className="tbl round-tbl">
          <thead>
            <tr>
              <th /><th>Wariant</th><th>Wydano</th><th className="num">CTR</th><th className="num">Kursy</th><th className="num">Koszt kursanta</th><th>Podpowiedź</th><th>Decyzja</th>
            </tr>
          </thead>
          <tbody>
            {r.variants.map((v) => (
              <VariantRow key={v.id} v={v} isBase={false} open={open === v.id} onToggle={() => setOpen(open === v.id ? null : v.id)} onChanged={onChanged} s={s} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const SRC_LABEL = { api: "Meta API", manual: "ręcznie", tracked: "sklep (UTM)" } as const;

function VariantRow({ v, open, onToggle, onChanged, s }: { v: VariantResult; isBase: boolean; open: boolean; onToggle: () => void; onChanged: () => void; s: TestSettings }) {
  const sug = v.suggestion;
  const tone = v.decision === "wygrał" || sug.code === "zwyciezca" ? "win" : ["wylacz", "przegrywa"].includes(sug.code) || ["przegrał", "wyłączony"].includes(v.decision) ? "lose" : "run";
  const decide = async (decision: Decision) => {
    await api(`/api/ad-test-variants/${v.id}`, "PATCH", { decision });
    onChanged();
  };
  return (
    <>
      <tr className={`vrow ${tone}`} onClick={onToggle} title="Kliknij, żeby zobaczyć szczegóły">
        <td><span className={`v-letter ${tone}`}>{v.letter}</span></td>
        <td title={v.hypothesis}><b>{v.change_to || "—"}</b></td>
        <td>
          <div className="spend-cell">
            <span>{zl(v.totals.spend)}</span>
            <div className="bar" title={`${Math.round(v.d.progress * 100)}% budżetu do werdyktu`}><span style={{ width: `${Math.min(100, Math.round(v.d.progress * 100))}%` }} /></div>
          </div>
        </td>
        <td className="num">{pct(v.d.ctr, 2)}</td>
        <td className="num">{v.totals.mainOrders}</td>
        <td className="num"><b>{zl(v.d.cac)}</b></td>
        <td><span className={`sug ${sug.code}`}>{tone === "win" ? <Trophy size={13} /> : tone === "lose" ? <CircleX size={13} /> : <Hourglass size={13} />} {sug.label}</span></td>
        <td onClick={(e) => e.stopPropagation()}>
          {v.decision !== "w toku" ? (
            <span className={`badge dec-${v.decision}`}>{v.decision}</span>
          ) : sug.decision !== "w toku" ? (
            <div className="row" style={{ gap: 4 }}>
              <button className="btn small primary" onClick={() => decide(sug.decision)} title={`Zapisz decyzję: ${sug.decision}`}>Zatwierdź</button>
              <select value="" onChange={(e) => e.target.value && decide(e.target.value as Decision)} aria-label="Inna decyzja">
                <option value="">inna…</option>
                <option>wygrał</option><option>przegrał</option><option>remis</option><option>wyłączony</option>
              </select>
            </div>
          ) : (
            <select value="" onChange={(e) => e.target.value && decide(e.target.value as Decision)} aria-label="Decyzja">
              <option value="">w toku</option>
              <option>wygrał</option><option>przegrał</option><option>remis</option><option>wyłączony</option>
            </select>
          )}
        </td>
      </tr>
      {open && (
        <tr className="vdetail">
          <td colSpan={8}>
            <VariantDetail v={v} s={s} onChanged={onChanged} />
          </td>
        </tr>
      )}
    </>
  );
}

function VariantDetail({ v, s, onChanged }: { v: VariantResult; s: TestSettings; onChanged: () => void }) {
  const [m, setM] = useState({ day: new Date().toISOString().slice(0, 10), spend: "", impressions: "", linkClicks: "", video3s: "", thruplay: "", orders: "", revenue: "" });
  const [err, setErr] = useState("");
  const max = Math.max(1, ...v.daily.map((d) => d.spend));
  return (
    <div className="vd">
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
        {v.hypothesis && <p><b>Hipoteza:</b> {v.hypothesis}</p>}
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

function RoundCreator({ testId, angle, settings: s, rounds, onDone }: { testId: string; angle: string; settings: TestSettings; rounds: RoundResult[]; onDone: () => void }) {
  const last = rounds[rounds.length - 1];
  const base = last?.variants.find((v) => v.id === last.winner_variant_id);
  const number = (last?.number ?? 0) + 1;
  const [element, setElement] = useState<string>(ELEMENTS[0]);
  const [start, setStart] = useState(new Date().toISOString().slice(0, 10));
  const [pageUrl, setPageUrl] = useState(last?.page_url ?? "");
  const [count, setCount] = useState(s.variantsPerRound);
  const defBudget = Math.round(budgetPerVariant(s) / 7);
  const [vars, setVars] = useState(() => LETTERS.map(() => ({ changeTo: "", ideaSource: "", hypothesis: "", dailyBudget: String(defBudget) })));
  const [library, setLibrary] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<{ number: number; verdictDate: string | null; variants: { letter: string; name: string }[] } | null>(null);
  useEffect(() => {
    const pid = location.pathname.split("/")[2];
    api<{ change_to: string; element: string }[]>(`/api/projects/${pid}/winning-elements`).then((r) => setLibrary(r.map((x) => `${x.element}: ${x.change_to}`))).catch(() => {});
  }, []);
  const minBudget = Math.min(...vars.slice(0, count).map((v) => Number(v.dailyBudget) || Infinity));
  const vd = Number.isFinite(minBudget) ? verdictDate(start, minBudget, s) : null;

  if (result)
    return (
      <section className="card creator">
        <h3 style={{ marginTop: 0 }}>Runda {result.number} utworzona ✓</h3>
        <p>Teraz w Menedżerze reklam utwórz reklamy o <b>dokładnie takich nazwach</b> i w polu „Parametry URL” wklej parametry poniżej. Po tej nazwie aplikacja połączy wydatki z Meta, wejścia i zamówienia.</p>
        <div className="row" style={{ marginBottom: 8 }}><code className="wrap">{META_URL_PARAMS}</code><Copy text={META_URL_PARAMS} label="Kopiuj parametry URL" /></div>
        <table className="tbl">
          <tbody>
            {result.variants.map((v) => (
              <tr key={v.letter}>
                <td><b>{v.letter}</b></td>
                <td><code>{v.name}</code> <Copy text={v.name} label="Kopiuj nazwę" /></td>
                <td>{pageUrl ? <><code className="wrap">{variantLink(pageUrl, v.name)}</code> <Copy text={variantLink(pageUrl, v.name)} label="Kopiuj link" /></> : <span className="hint">(bez adresu strony)</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="tt-chips big">
          <span><Flag size={15} /> werdykt: <b>{result.verdictDate ?? "—"}</b></span>
          <Tip text="Zamiast parametrów URL możesz wkleić gotowy link z kolumny obok jako adres docelowy reklamy." />
        </div>
        <button className="btn primary" onClick={onDone}>Gotowe – pokaż tabelę</button>
      </section>
    );

  return (
    <section className="card creator">
      <h3 style={{ marginTop: 0 }}>Nowa runda {number}</h3>
      <div className="settings-grid">
        <label className="field">
          Co zmieniasz w tej rundzie (jeden element)
          <select value={element} onChange={(e) => setElement(e.target.value)}>
            {ELEMENTS.map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="field">Start<input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></label>
        <label className="field">Strona docelowa (do linków z UTM)<input value={pageUrl} onChange={(e) => setPageUrl(e.target.value)} placeholder="https://…/vsl" /></label>
        <label className="field">
          Wariantów
          <select value={count} onChange={(e) => setCount(Number(e.target.value))}>{[2, 3, 4].map((n) => <option key={n}>{n}</option>)}</select>
        </label>
      </div>
      <div className="tt-chips big">
        <span title="Wygrany z poprzedniej rundy – punkt odniesienia"><Trophy size={15} /> baza: {base ? `${base.letter} – ${base.change_to}` : "brak (pierwsza runda)"}</span>
      </div>
      <datalist id="idea-sources">
        {[...IDEA_SOURCES, ...library].map((x) => <option key={x} value={x} />)}
      </datalist>
      {vars.slice(0, count).map((v, i) => (
        <div key={i} className="creator-var">
          <div className="creator-letter">
            <b>{LETTERS[i]}</b>
            <code>{adName(s.namingPattern, angle, number, LETTERS[i])}</code>
          </div>
          <input placeholder={`Na co zmieniono (${element})`} value={v.changeTo} onChange={(e) => setVars(vars.map((x, k) => (k === i ? { ...x, changeTo: e.target.value } : x)))} />
          <input placeholder="Źródło pomysłu" list="idea-sources" value={v.ideaSource} onChange={(e) => setVars(vars.map((x, k) => (k === i ? { ...x, ideaSource: e.target.value } : x)))} />
          <input placeholder="Hipoteza (dlaczego ma wygrać)" value={v.hypothesis} onChange={(e) => setVars(vars.map((x, k) => (k === i ? { ...x, hypothesis: e.target.value } : x)))} />
          <input placeholder="Budżet dzienny zł" inputMode="decimal" value={v.dailyBudget} onChange={(e) => setVars(vars.map((x, k) => (k === i ? { ...x, dailyBudget: e.target.value } : x)))} />
        </div>
      ))}
      <div className="tt-chips big">
        <span><Flag size={15} /> werdykt: <b>{vd ?? "—"}</b></span>
        <Tip text={`Data werdyktu = start + ${zl(budgetPerVariant(s))} (budżet na wariant) ÷ budżet dzienny.`} />
      </div>
      {err && <p className="error">{err}</p>}
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button
          className="btn primary"
          onClick={async () => {
            setErr("");
            try {
              const r = await api<{ number: number; verdictDate: string | null; variants: { letter: string; name: string }[] }>(`/api/ad-tests/${testId}/rounds`, "POST", {
                element,
                startDate: start,
                pageUrl,
                variants: vars.slice(0, count).map((v) => ({ ...v, dailyBudget: Number(v.dailyBudget.replace(",", ".")) || 0 })),
              });
              setResult(r);
            } catch (e) {
              setErr((e as Error).message);
            }
          }}
        >
          Utwórz rundę i pokaż nazwy reklam
        </button>
      </div>
    </section>
  );
}
