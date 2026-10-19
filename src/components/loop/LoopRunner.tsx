"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown, CircleAlert, CircleCheck, Flag, Lock, Minus, Pause, Sparkles, Target, X,
} from "lucide-react";
import { api } from "../forms";
import { Tip } from "../Tip";
import { hypothesisValue, improve, METRICS, modelProfit, type MetricKey } from "@/lib/levers";
import { ELEMENTS, NO_CHANGE, STEPS } from "@/lib/loop-def";
import type { LoopState } from "@/lib/loop";
import type { EngineResult } from "@/lib/loop-data";
import { CopyBrief, DecisionCard, DecisionTasks, fm, plus, range, Verdict, Waiting, zl, zlSigned } from "./Decisions";

const pct = (v: number | null | undefined, dd = 1) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toLocaleString("pl-PL", { maximumFractionDigits: dd })}%`);
const num = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : Math.round(v).toLocaleString("pl-PL"));

function Arrow({ now, prev, invert }: { now: number | null | undefined; prev: number | null | undefined; invert?: boolean }) {
  if (now == null || prev == null || !prev) return <span className="lp-arrow"><Minus size={14} /></span>;
  const flat = Math.abs(now - prev) / Math.abs(prev) < 0.01;
  const up = now > prev;
  const good = invert ? !up : up;
  const I = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return <span className={`lp-arrow ${flat ? "" : good ? "up" : "down"}`} title="vs poprzedni okres"><I size={14} />{flat ? "" : pct(Math.abs((now - prev) / Math.abs(prev)), 0)}</span>;
}

interface Gap {
  goal: { period: string; date_from: string; date_to: string; profit_target: number; approved_by: string };
  achieved: number;
  totalDays: number;
  elapsed: number;
  left: number;
  target: number;
  gap: number;
  needPerDay: number;
  needPerWeek: number;
  needFromNow: number | null;
  pacePerDay: number | null;
  forecast: number | null;
  gaps: string[];
}

/** Stały pasek celu: profit vs cel, tempo, luka, prognoza „duch”. */
export function GoalBar({ g }: { g: Gap | null }) {
  if (!g) return <div className="gb gb-empty"><Target size={16} /> Brak celu profitu – ustawisz go w kroku 1 albo w Ustawieniach.</div>;
  const share = g.target > 0 ? Math.max(0, Math.min(1, g.achieved / g.target)) : 0;
  const timeShare = g.totalDays ? g.elapsed / g.totalDays : 0;
  const fShare = g.forecast != null && g.target > 0 ? Math.max(0, Math.min(1.2, g.forecast / g.target)) : null;
  return (
    <div className="gb">
      <div className="gb-nums">
        <span><em>Profit</em><b>{zl(g.achieved)}</b><small>z {zl(g.target)}</small></span>
        <span><em>Luka</em><b className={g.gap > 0 ? "neg" : "pos"}>{zl(g.gap)}</b></span>
        <span><em>Tempo teraz</em><b>{zl(g.pacePerDay)}/dz.</b></span>
        <span><em>Potrzebne od dziś</em><b>{zl(g.needFromNow)}/dz.</b></span>
        <span className="gb-ghost" title="Prosta ekstrapolacja obecnego tempa – nie model, tylko orientacyjnie."><em>Prognoza</em><b>{zl(g.forecast)}</b></span>
      </div>
      <div className="gb-track" title={`${g.elapsed} z ${g.totalDays} dni okresu`}>
        <i className="gb-fill" style={{ width: `${share * 100}%` }} />
        {fShare != null && <i className="gb-fc" style={{ width: `${Math.min(1, fShare) * 100}%` }} />}
        <i className="gb-time" style={{ left: `${timeShare * 100}%` }} />
      </div>
      <div className="gb-foot">{g.goal.date_from} – {g.goal.date_to} · dzień {g.elapsed}/{g.totalDays}</div>
    </div>
  );
}

/* ---------- główny komponent ---------- */

export function LoopRunner({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [st, setSt] = useState<LoopState | null>(null);
  const [g, setG] = useState<Gap | null>(null);
  const [view, setView] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [miss, setMiss] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const s = await api<LoopState>(`/api/projects/${projectId}/loop`);
    if (!s.active) {
      await api(`/api/projects/${projectId}/loop`, "POST");
      return load();
    }
    setSt(s);
    setG(await api<Gap | null>(`/api/projects/${projectId}/loop/gap`));
  }, [projectId]);
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);

  if (err && !st) return <p className="error">{err}</p>;
  if (!st?.active) return <p>Wczytuję…</p>;
  const loop = st.active;
  const step = view ?? Math.min(loop.step, STEPS.length - 1);
  const S = STEPS[step];
  const saved = (loop.data[S.key] ?? {}) as Record<string, unknown>;
  const val = <T,>(k: string, d: T): T => (k in draft ? (draft[k] as T) : ((saved[k] as T) ?? d));
  const set = (k: string, v: unknown) => setDraft((x) => ({ ...x, [k]: v }));
  const go = (i: number) => {
    setView(i);
    setDraft({});
    setMiss([]);
    window.scrollTo({ top: 0 });
  };
  const next = async () => {
    setBusy(true);
    setErr("");
    try {
      const r = await api<{ missing: string[]; finished?: boolean }>(`/api/loops/${loop.id}`, "PATCH", { step, patch: draft, advance: true });
      if (r.missing.length) {
        setMiss(r.missing);
        await load();
        return;
      }
      if (r.finished) {
        router.push(`/projects/${projectId}?analiza=zakonczona`);
        return;
      }
      await load();
      go(step + 1);
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const saveDraft = async () => {
    if (!Object.keys(draft).length) return;
    await api(`/api/loops/${loop.id}`, "PATCH", { step, patch: draft, advance: false });
    setDraft({});
    await load();
  };
  const props: StepProps = { projectId, st, g, val, set, reload: load, loopId: loop.id, saveDraft };

  return (
    <div className="lp">
      <div className="lp-top">
        <Link href={`/projects/${projectId}`} className="back-btn" title="Przerwij – wrócisz do tego kroku" aria-label="Przerwij"><Pause size={18} /></Link>
        <ol className="lp-steps">
          {STEPS.map((s, i) => {
            const done = i < loop.step;
            const open = i <= loop.step;
            return (
              <li key={s.key} className={`${i === step ? "on" : ""} ${done ? "done" : ""} ${open ? "" : "lock"}`}>
                <button disabled={!open} onClick={() => open && saveDraft().then(() => go(i))} title={open ? s.title : "Najpierw zakończ wcześniejsze kroki"}>
                  <span>{done ? <Check size={11} /> : open ? i + 1 : <Lock size={10} />}</span>
                  {s.title}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      {step >= 2 && <GoalBar g={g} />}
      <section className="lp-step">
        <div className="lp-step-head">
          <span className="lp-n">Krok {step + 1}</span>
          <h1>{S.question}</h1>
        </div>
        {S.key === "cel" && <StepGoal {...props} />}
        {S.key === "predykcja" && <StepPredict {...props} />}
        {S.key === "rzeczywistosc" && <StepReality {...props} />}
        {S.key === "luka" && <StepGap {...props} />}
        {S.key === "kwota" && <StepMoney {...props} />}
        {S.key === "pytania" && <StepQuestions {...props} />}
        {S.key === "decyzja" && <StepDecision {...props} />}
        {S.key === "kalendarz" && <StepCalendar {...props} />}
        {S.key === "rozstrzygniecie" && <StepVerdict {...props} />}
        {S.key === "wnioski" && <StepLearn {...props} />}
      </section>
      {miss.length > 0 && (
        <div className="lp-miss">
          <b><CircleAlert size={16} /> Krok niewykonany – brakuje:</b>
          <ul>{miss.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
      {err && <p className="error">{err}</p>}
      <div className="lp-nav">
        {step > 0 ? <button className="btn" onClick={() => saveDraft().then(() => go(step - 1))}><ArrowLeft size={15} /> {STEPS[step - 1].title}</button> : <span />}
        <button className="btn primary big" disabled={busy} onClick={next}>
          {step === STEPS.length - 1 ? <><CircleCheck size={16} /> Zakończ sesję i wróć do celu</> : <>Zapisz i dalej: {STEPS[step + 1].title} <ArrowRight size={16} /></>}
        </button>
      </div>
    </div>
  );
}

interface StepProps {
  projectId: string;
  loopId: string;
  st: LoopState;
  g: Gap | null;
  val: <T>(k: string, d: T) => T;
  set: (k: string, v: unknown) => void;
  reload: () => Promise<void>;
  saveDraft: () => Promise<void>;
}

const snapshotOf = (st: LoopState) => (st.active?.data.kwota?.snapshot ?? null) as EngineResult | null;

/* ---------- Krok 1: Cel + zakres ---------- */

function periodRange(p: string, base = new Date()): [string, string] {
  const y = base.getFullYear(), m = base.getMonth();
  const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (p === "kwartał") { const q0 = Math.floor(m / 3) * 3; return [f(new Date(y, q0, 1)), f(new Date(y, q0 + 3, 0))]; }
  if (p === "rok") return [`${y}-01-01`, `${y}-12-31`];
  return [f(new Date(y, m, 1)), f(new Date(y, m + 1, 0))];
}

export function GoalForm({ projectId, last, onSaved, onCancel }: { projectId: string; last: LoopState["lastGoal"]; onSaved: () => void; onCancel?: () => void }) {
  // Auto-uzupełnienie: ten sam typ okresu i ta sama kwota co ostatnio – na bieżący okres.
  const p0 = last?.period && ["miesiąc", "kwartał", "rok"].includes(last.period) ? last.period : "miesiąc";
  const [period, setPeriod] = useState(p0);
  const [[from, to], setRange] = useState(periodRange(p0));
  const [target, setTarget] = useState(last ? String(Math.round(last.profit_target)) : "");
  const [err, setErr] = useState("");
  const save = async () => {
    setErr("");
    try {
      await api(`/api/projects/${projectId}/goals`, "POST", { period, date_from: from, date_to: to, profit_target: Number(target.replace(/\s/g, "").replace(",", ".")) });
      onSaved();
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  return (
    <div className="lp-card">
      <label className="lp-l">Okres celu</label>
      <div className="seg">
        {["miesiąc", "kwartał", "rok"].map((p) => (
          <button key={p} className={period === p ? "on" : ""} onClick={() => { setPeriod(p); setRange(periodRange(p)); }}>{p}</button>
        ))}
      </div>
      <div className="row"><input type="date" value={from} onChange={(e) => setRange([e.target.value, to])} /> – <input type="date" value={to} onChange={(e) => setRange([from, e.target.value])} /></div>
      <label className="lp-l">Cel profitu (zł) <Tip text="Profit po wszystkim = przychód netto − reklamy − koszty zmienne i stałe − podatek (z Ustawień klienta)." /></label>
      <div className="money-input"><input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /><span>zł</span></div>
      {err && <p className="error">{err}</p>}
      <div className="row"><button className="btn primary" disabled={!target.trim()} onClick={save}><Check size={15} /> Zapisz cel</button>{onCancel && <button className="btn" onClick={onCancel}>Anuluj</button>}</div>
    </div>
  );
}

function ScopePicker({ projectId, st, reload }: { projectId: string; st: LoopState; reload: () => Promise<void> }) {
  const [lists, setLists] = useState<{ campaigns: { name: string; platform: string; spend: number }[]; products: { name: string; gross: number | null }[] } | null>(null);
  const init = st.scope ?? st.economicsScope;
  const [camps, setCamps] = useState<string[]>(init.campaigns);
  const [prods, setProds] = useState<string[]>(init.products);
  const [saved, setSaved] = useState(!!st.scope);
  useEffect(() => {
    api<NonNullable<typeof lists>>(`/api/projects/${projectId}/loop/scope`).then(setLists).catch(() => {});
  }, [projectId]);
  const toggle = (xs: string[], x: string, f: (v: string[]) => void) => { f(xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]); setSaved(false); };
  const save = async () => {
    await api(`/api/projects/${projectId}/loop/scope`, "PUT", { campaigns: camps, products: prods });
    setSaved(true);
    await reload();
  };
  if (!lists) return <div className="lp-card"><p>Wczytuję kampanie i produkty…</p></div>;
  const Pick = ({ title, tip, items, sel, setSel }: { title: string; tip: string; items: { name: string; sub: string }[]; sel: string[]; setSel: (v: string[]) => void }) => (
    <div className="sc-col">
      <div className="sc-head">
        <b>{title} <Tip text={tip} /></b>
        <button className={`chip ${sel.length === 0 ? "on" : ""}`} onClick={() => { setSel([]); setSaved(false); }}>wszystko</button>
      </div>
      <div className="sc-list">
        {items.map((x) => (
          <label key={x.name} className={`sc-item ${sel.includes(x.name) ? "on" : ""}`}>
            <input type="checkbox" checked={sel.includes(x.name)} onChange={() => toggle(sel, x.name, setSel)} />
            <span>{x.name}</span><small>{x.sub}</small>
          </label>
        ))}
        {sel.filter((s) => !items.some((x) => x.name === s)).map((s) => (
          <label key={s} className="sc-item on old"><input type="checkbox" checked onChange={() => toggle(sel, s, setSel)} /><span>{s}</span><small>brak w ostatnich 60 dniach</small></label>
        ))}
      </div>
    </div>
  );
  return (
    <div className="lp-card">
      <h3>Z czego liczymy</h3>
      <div className="sc">
        <Pick title="Kampanie" tip="Koszty, wyświetlenia i kliknięcia tylko z zaznaczonych kampanii. Nic nie zaznaczone = wszystkie." items={lists.campaigns.map((c) => ({ name: c.name, sub: `${c.platform} · ${zl(c.spend)}` }))} sel={camps} setSel={setCamps} />
        <Pick title="Produkty" tip="Zamówienia zawierające zaznaczone produkty (cała wartość zamówienia). Nic nie zaznaczone = wszystkie zamówienia." items={lists.products.map((p) => ({ name: p.name, sub: p.gross == null ? "" : zl(p.gross) }))} sel={prods} setSel={setProds} />
      </div>
      <div className="row">
        <button className="btn primary" onClick={save}><Check size={15} /> Zatwierdź zakres</button>
        {saved && <span className="saved"><CircleCheck size={15} /> zakres zapisany – zostanie na kolejne sesje</span>}
      </div>
    </div>
  );
}

function StepGoal({ projectId, loopId, st, g, val, reload }: StepProps) {
  const [edit, setEdit] = useState(!st.goal);
  const ratings = val<Record<string, { effect?: string; carry?: boolean }>>("ratings", {});
  const rate = async (taskId: string, effect: string, carry = false) => {
    await api(`/api/loops/${loopId}/rate`, "POST", { taskId, effect, carry, due: plus(3) });
    await reload();
  };
  return (
    <div className="lp-body">
      {st.prev && st.prevActions.length > 0 && (
        <div className="lp-card copper">
          <h3><Flag size={16} /> Rozliczenie działań z poprzedniej sesji ({st.prev.finished_at})</h3>
          <ul className="lp-rate">
            {st.prevActions.map((a) => {
              const r = ratings[a.id];
              return (
                <li key={a.id} className={r?.effect ? "rated" : ""}>
                  <span className={`lp-done ${a.done ? "y" : "n"}`}>{a.done ? <CircleCheck size={15} /> : <X size={15} />} {a.done ? "zrobione" : "niezrobione"}</span>
                  <span className="lp-rate-t">{a.title}<small>do {a.due}</small></span>
                  <span className="seg small">
                    {(a.done ? ["pomogło", "nie pomogło", "za wcześnie"] : ["porzucam", "przenoszę"]).map((e) => (
                      <button key={e} className={r?.effect === e ? "on" : ""} onClick={() => rate(a.id, e, e === "przenoszę")}>{e}</button>
                    ))}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {!edit && st.goal ? (
        <div className="lp-card">
          <div className="lp-goal">
            <span><em>Cel profitu</em><b>{zl(st.goal.profit_target)}</b></span>
            <span><em>Okres</em><b>{st.goal.period}: {st.goal.date_from} – {st.goal.date_to}</b></span>
            <span><em>Tempo potrzebne</em><b>{zl(g?.needPerWeek)}/tydz. · {zl(g?.needPerDay)}/dz.</b></span>
          </div>
          <button className="btn small" onClick={() => setEdit(true)}>Zmień cel</button>
        </div>
      ) : (
        <GoalForm projectId={projectId} last={st.goal ?? st.lastGoal} onSaved={() => { setEdit(false); reload(); }} onCancel={st.goal ? () => setEdit(false) : undefined} />
      )}
      <ScopePicker projectId={projectId} st={st} reload={reload} />
    </div>
  );
}

/* ---------- Krok 2: Predykcja ---------- */

const STAGE_OPTIONS = [...METRICS.map((m) => ({ key: m.key as string, label: `${m.stage} (${m.label.split(" ")[0]})` })), { key: "żaden", label: "Żaden się nie pogorszył" }];
const stageLabel = (k: string | null | undefined) => (k == null ? "brak danych" : STAGE_OPTIONS.find((o) => o.key === k)?.label ?? k);

function StepPredict({ loopId, st, reload }: StepProps) {
  const p = st.prediction;
  const [profit, setProfit] = useState(p ? String(Math.round(p.profit_guess)) : "");
  const [stage, setStage] = useState(p?.stage_guess ?? "");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState(!!p);
  const save = async () => {
    setErr("");
    try {
      await api(`/api/loops/${loopId}/prediction`, "POST", { profit: Number(profit.replace(/\s/g, "").replace(",", ".")), stage });
      setOk(true);
      await reload();
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  return (
    <div className="lp-body">
      <div className="lp-card">
        <label className="lp-l">Ile wyniósł profit w ostatnim tygodniu (7 pełnych dni)?</label>
        <div className="money-input"><input inputMode="decimal" value={profit} onChange={(e) => { setProfit(e.target.value); setOk(false); }} /><span>zł</span></div>
        <label className="lp-l">Który etap lejka się pogorszył (ostatnie 7 dni vs poprzednie 7)?</label>
        <div className="lever-grid">
          {STAGE_OPTIONS.map((o) => (
            <button key={o.key} className={`lever ${stage === o.key ? "on" : ""}`} onClick={() => { setStage(o.key); setOk(false); }}>
              <b>{o.label}</b>{stage === o.key && <CircleCheck size={18} className="lever-ok" />}
            </button>
          ))}
        </div>
        {err && <p className="error">{err}</p>}
        <div className="row">
          <button className="btn primary" disabled={!profit.trim() || !stage} onClick={save}><Check size={15} /> Zapisz predykcję</button>
          {ok && <span className="saved"><CircleCheck size={15} /> zapisana – po przejściu dalej nie da się jej zmienić</span>}
        </div>
      </div>
    </div>
  );
}

/* ---------- Krok 3: Rzeczywistość ---------- */

interface Money { from: string; to: string; revenue: number; spend: number; profit: number; orders: number; variableCosts: number; fixedCosts: number; tax: number }
interface Reality {
  wide: Money; widePrev: Money; weeks: Money[]; days: Money[]; daily60: Money[];
  events: { day: string; title: string }[];
  gaps: string[];
  sourceOf: { revenue: string | null; spend: string | null };
}

function ProfitLine({ rows, events }: { rows: Money[]; events: { day: string; title: string }[] }) {
  const w = 900, h = 180;
  const vals = rows.map((r) => r.profit);
  const min = Math.min(0, ...vals);
  const top = Math.max(0, ...vals);
  const span = top - min || 1;
  const x = (i: number) => (i / Math.max(1, rows.length - 1)) * w;
  const y = (v: number) => h - ((v - min) / span) * (h - 10) - 5;
  return (
    <svg viewBox={`0 0 ${w} ${h + 18}`} width="100%" role="img" aria-label="Profit dzień po dniu">
      <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="var(--border)" />
      {events.map((e) => {
        const i = rows.findIndex((r) => r.from === e.day);
        return i < 0 ? null : <g key={e.day + e.title}><line x1={x(i)} x2={x(i)} y1={0} y2={h} stroke="#c2683c" strokeDasharray="3 4" /><title>{e.day}: {e.title}</title></g>;
      })}
      <polyline points={rows.map((r, i) => `${x(i)},${y(r.profit)}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth={2.2} strokeLinejoin="round" />
      <text x={0} y={h + 14} fontSize={11} fill="var(--muted)">{rows[0]?.from}</text>
      <text x={w} y={h + 14} fontSize={11} fill="var(--muted)" textAnchor="end">{rows[rows.length - 1]?.from}</text>
    </svg>
  );
}

function MoneyTable({ rows, label }: { rows: Money[]; label: (r: Money) => string }) {
  return (
    <div className="tbl-wrap">
      <table className="tbl lp-tbl">
        <thead><tr><th /><th className="num">Profit</th><th className="num">Przychód</th><th className="num">Reklamy</th><th className="num">Zamówienia</th><th /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.from}>
              <td>{label(r)}</td>
              <td className={`num b ${r.profit < 0 ? "neg" : ""}`}>{zl(r.profit)}</td>
              <td className="num">{zl(r.revenue)}</td>
              <td className="num">{zl(r.spend)}</td>
              <td className="num">{num(r.orders)}</td>
              <td><Arrow now={r.profit} prev={rows[i - 1]?.profit} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StepReality({ projectId, st, val, set }: StepProps) {
  const [r, setR] = useState<Reality | null>(null);
  const [scale, setScale] = useState<"szeroka" | "srednia" | "waska">("szeroka");
  useEffect(() => {
    api<Reality>(`/api/projects/${projectId}/loop/reality`).then(setR).catch(() => {});
  }, [projectId]);
  const reliable = val<boolean | null>("reliable", null);
  const p = st.prediction;
  if (!r) return <p>Liczę profit z danych…</p>;
  const W = r.wide, P = r.widePrev;
  const err = p && p.profit_actual != null ? p.profit_guess - p.profit_actual : null;
  return (
    <div className="lp-body">
      {p && (
        <div className="lp-card pr">
          <h3>Twoja predykcja vs dane <small>({p.window_from} – {p.window_to})</small></h3>
          <div className="pr-grid">
            <div><em>Profit tygodnia</em><span>Ty: <b>{zl(p.profit_guess)}</b></span><span>Dane: <b>{zl(p.profit_actual)}</b></span><span className={`pr-diff ${err != null && Math.abs(err) <= Math.abs(p.profit_actual ?? 0) * 0.1 ? "ok" : "bad"}`}>różnica {zlSigned(err)}</span></div>
            <div><em>Pogorszony etap</em><span>Ty: <b>{stageLabel(p.stage_guess)}</b></span><span>Dane: <b>{stageLabel(p.stage_actual)}</b></span>
              <span className={`pr-diff ${p.stage_actual && p.stage_actual === p.stage_guess ? "ok" : "bad"}`}>{p.stage_actual == null ? "za mała próba" : p.stage_actual === p.stage_guess ? "trafione" : "nietrafione"}</span></div>
          </div>
        </div>
      )}
      {r.gaps.length > 0 && (
        <div className="lp-card copper">
          <h3><CircleAlert size={16} /> Luki w danych</h3>
          <ul className="lp-gaps">{r.gaps.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      )}
      <div className="seg big">
        {([["szeroka", "Do 2 mies."], ["srednia", "Tygodnie"], ["waska", "Dni"]] as const).map(([k, l]) => (
          <button key={k} className={scale === k ? "on" : ""} onClick={() => setScale(k)}>{l}</button>
        ))}
      </div>
      {scale === "szeroka" && (
        <div className="lp-card">
          <div className="lp-kpis">
            <div><em>Profit 60 dni</em><b className={W.profit < 0 ? "neg" : ""}>{zl(W.profit)}</b><Arrow now={W.profit} prev={P.profit} /></div>
            <div><em>Przychód</em><b>{zl(W.revenue)}</b><Arrow now={W.revenue} prev={P.revenue} /><small>{r.sourceOf.revenue ?? <span className="gap-tag">brak danych</span>}</small></div>
            <div><em>Koszt reklam</em><b>{zl(W.spend)}</b><Arrow now={W.spend} prev={P.spend} invert /><small>{r.sourceOf.spend ?? <span className="gap-tag">brak danych</span>}</small></div>
            <div><em>Pozostałe koszty</em><b>{zl(W.variableCosts + W.fixedCosts + W.tax)}</b><small>ustawienia klienta</small></div>
          </div>
          <ProfitLine rows={r.daily60} events={r.events} />
          <p className="lp-legend"><i className="l-acc" /> profit dziennie <i className="l-cop" /> zdarzenie z osi czasu</p>
        </div>
      )}
      {scale === "srednia" && <div className="lp-card"><MoneyTable rows={r.weeks} label={(m) => `${m.from.slice(5)} – ${m.to.slice(5)}`} /></div>}
      {scale === "waska" && <div className="lp-card"><MoneyTable rows={r.days} label={(m) => new Date(`${m.from}T12:00:00`).toLocaleDateString("pl-PL", { weekday: "short", day: "numeric", month: "numeric" })} /></div>}
      <div className="lp-card lp-decide">
        <h3>Czy dane są wiarygodne?</h3>
        <div className="seg big">
          <button className={reliable === true ? "on" : ""} onClick={() => set("reliable", true)}><CircleCheck size={15} /> Tak, liczby się zgadzają</button>
          <button className={reliable === false ? "on" : ""} onClick={() => set("reliable", false)}><X size={15} /> Nie</button>
        </div>
        {reliable === false && (
          <p className="lp-stop"><CircleAlert size={16} /> Sesja stoi. Najpierw napraw pomiar w <Link href={`/projects/${projectId}/dane`}>Źródłach danych</Link>, potem wróć do tego kroku.</p>
        )}
      </div>
    </div>
  );
}

/* ---------- Krok 4: Luka ---------- */

function StepGap({ g }: StepProps) {
  if (!g) return <p>Brak celu – wróć do kroku 1.</p>;
  return (
    <div className="lp-body">
      <div className="lp-card">
        <div className="lp-kpis big">
          <div><em>Brakuje do celu</em><b className={g.gap > 0 ? "neg" : "pos"}>{zl(g.gap)}</b><small>{g.target ? `${pct(g.gap / g.target, 0)} celu` : ""}</small></div>
          <div><em>Od dziś trzeba</em><b>{zl(g.needFromNow)}/dz.</b><small>{g.left} dni do końca okresu</small></div>
          <div><em>Tempo obecne</em><b>{zl(g.pacePerDay)}/dz.</b><small>potrzebne średnio {zl(g.needPerDay)}/dz.</small></div>
          <div><em>Różnica tempa</em><b className={(g.pacePerDay ?? 0) < (g.needFromNow ?? 0) ? "neg" : "pos"}>{g.needFromNow != null && g.pacePerDay != null ? `${zlSigned(g.pacePerDay - g.needFromNow)}/dz.` : "—"}</b><small>{g.needFromNow != null && g.pacePerDay != null ? `${zlSigned((g.pacePerDay - g.needFromNow) * 30)}/mies.` : ""}</small></div>
          <div className="gb-ghost"><em>Prognoza (duch)</em><b>{zl(g.forecast)}</b><small>jeśli tempo się utrzyma</small></div>
        </div>
      </div>
      {g.gaps.length > 0 && <div className="lp-card copper"><ul className="lp-gaps">{g.gaps.map((x) => <li key={x}>{x}</li>)}</ul></div>}
    </div>
  );
}

/* ---------- Krok 5: Kwota na stole ---------- */

function LeverValue({ v, r, low }: { v: number | null; r: [number, number] | null; low: boolean }) {
  if (v == null) return <span className="gap-tag">brak danych</span>;
  return (
    <span className="lv-val">
      <b>{low ? range(r) : `${zlSigned(v)}`}</b><small>/mies.</small>
      {low && <span className="conf-low" title={`Środek: ${zlSigned(v)}`}><CircleAlert size={12} /> niska pewność</span>}
    </span>
  );
}

/** Mikroliczby etapu – każda z ekwiwalentem w zł/mies. */
function StageDetail({ eng, k }: { eng: EngineResult; k: MetricKey }) {
  const W = eng.window;
  const b = eng.ranking.base;
  const u = eng.units;
  const budget = eng.ranking.budget;
  const now = eng.ranking.profitNow;
  const sens = (over: Partial<Record<MetricKey, number>>) => {
    const p = modelProfit(budget, b, eng.econ, over);
    return p == null || now == null ? null : p - now;
  };
  const cpc = b.cpm != null && b.ctr ? b.cpm / (1000 * b.ctr) : null;
  const cpa = W.orders ? W.spend / W.orders : null;
  const rows: Record<MetricKey, { label: string; value: string; eq: string; tip?: string }[]> = {
    cpm: [
      { label: "Wydatki (30 dni)", value: zl(W.spend), eq: "budżet stały w modelu" },
      { label: "Wyświetlenia", value: num(W.impressions), eq: `1000 wyśw. = ${zl(u.perMille)}` },
      { label: "CPM", value: fm("cpm", b.cpm), eq: `−10% = ${zlSigned(b.cpm == null ? null : sens({ cpm: improve("cpm", b.cpm, 0.1) }))}/mies.` },
    ],
    ctr: [
      { label: "Kliknięcia w link", value: num(W.clicks), eq: `1 klik = ${zl(u.perClick)}` },
      { label: "CTR", value: fm("ctr", b.ctr), eq: `+10% = ${zlSigned(b.ctr == null ? null : sens({ ctr: improve("ctr", b.ctr, 0.1) }))}/mies.` },
      { label: "CPC", value: fm("cpm", cpc), eq: `−10% = ${zlSigned(b.cpm == null ? null : sens({ cpm: improve("cpm", b.cpm, 0.1) }))}/mies.`, tip: "CPC = CPM ÷ (1000 × CTR); −10% CPC przy tym samym CTR = −10% CPM." },
    ],
    cr: [
      { label: "Zamówienia", value: num(W.orders), eq: `1 zamówienie = ${zl(u.perOrder)}` },
      { label: "CR", value: fm("cr", b.cr), eq: `+10% = ${zlSigned(b.cr == null ? null : sens({ cr: improve("cr", b.cr, 0.1) }))}/mies.` },
      { label: "Koszt zamówienia (CPA)", value: zl(cpa), eq: `−10% = ${zlSigned(b.cr == null ? null : sens({ cr: b.cr / 0.9 }))}/mies.`, tip: "CPA = wydatki ÷ zamówienia; −10% CPA przy stałym budżecie = +11% zamówień." },
    ],
    aov: [
      { label: "Przychód netto (30 dni)", value: zl(W.net), eq: `1 zamówienie = ${zl(u.perOrder)}` },
      { label: "AOV netto", value: fm("aov", b.aov), eq: `+10% = ${zlSigned(b.aov == null ? null : sens({ aov: improve("aov", b.aov, 0.1) }))}/mies.` },
      { label: "LTV 30 ponad 1. zakup", value: eng.ltv.value == null ? "brak danych" : zl(eng.ltv.value), eq: eng.ltv.value == null ? "liczone z samego AOV" : `${eng.ltv.matured} klientów z pełnym oknem` },
    ],
  };
  const i = METRICS.findIndex((m) => m.key === k);
  const show = METRICS.filter((_, j) => Math.abs(j - i) <= 1);
  return (
    <div className="sd">
      {show.map((m) => (
        <div key={m.key} className={`sd-col ${m.key === k ? "on" : ""}`}>
          <b>{m.stage}</b>
          {rows[m.key].map((r) => (
            <div key={r.label} className="sd-row"><span>{r.label}{r.tip && <Tip text={r.tip} />}</span><b>{r.value}</b><small>{r.eq}</small></div>
          ))}
        </div>
      ))}
    </div>
  );
}

function StepMoney({ loopId, st, reload }: StepProps) {
  const eng = snapshotOf(st);
  const guess = st.prediction?.lever_guess ?? null;
  const [pick, setPick] = useState("");
  const [open, setOpen] = useState<MetricKey | null>(null);
  const [err, setErr] = useState("");
  const focus = (st.active?.data.pytania?.focus ?? st.active?.data.kwota?.focus ?? null) as MetricKey | null;
  const reveal = async () => {
    setErr("");
    try {
      await api(`/api/loops/${loopId}/lever`, "POST", { guess: pick });
      await reload();
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  if (!guess || !eng)
    return (
      <div className="lp-body">
        <div className="lp-card">
          <label className="lp-l">Gdzie Twoim zdaniem jest największa dźwignia?</label>
          <div className="lever-grid">
            {METRICS.map((m) => (
              <button key={m.key} className={`lever ${pick === m.key ? "on" : ""}`} onClick={() => setPick(m.key)}>
                <span className="lever-dir">{m.better === "up" ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />} {m.stage}</span>
                <b>{m.label}</b>{pick === m.key && <CircleCheck size={18} className="lever-ok" />}
              </button>
            ))}
          </div>
          {err && <p className="error">{err}</p>}
          <div className="row"><button className="btn primary" disabled={!pick} onClick={reveal}><Sparkles size={15} /> Odpowiedz i pokaż ranking</button></div>
        </div>
      </div>
    );
  const top = eng.ranking.levers.find((l) => l.value != null);
  const setFocus = async (k: MetricKey) => {
    await api(`/api/loops/${loopId}/questions`, "POST", { focus: k });
    await reload();
  };
  return (
    <div className="lp-body">
      <div className={`lp-card pr ${top && top.key === guess ? "" : "copper"}`}>
        <span>Twoja odpowiedź: <b>{METRICS.find((m) => m.key === guess)?.label}</b> · dane: <b>{top ? top.label : "brak danych"}</b> {top && (top.key === guess ? <span className="pr-diff ok">trafione</span> : <span className="pr-diff bad">nietrafione</span>)}</span>
      </div>
      {eng.gaps.length > 0 && <div className="lp-card copper"><ul className="lp-gaps">{eng.gaps.map((x) => <li key={x}>{x}</li>)}</ul></div>}
      <div className="lp-card">
        <p className="lp-sub">
          Okno {eng.window.from} – {eng.window.to} · budżet {zl(eng.ranking.budget)}/mies. · model: profit po wszystkich kosztach{eng.ltv.value != null ? ", przychód = AOV + LTV 30" : ", przychód = AOV (brak LTV 30)"}
          <Tip text="Założenia przy każdej pozycji: budżet stały, reszta lejka bez zmian, zmienia się tylko ta jedna metryka – do poziomu benchmarku." />
        </p>
        <div className="lv">
          {eng.ranking.levers.map((l, i) => (
            <div key={l.key} className={`lv-item ${open === l.key ? "open" : ""} ${focus === l.key ? "focus" : ""}`}>
              <button className="lv-row" onClick={() => setOpen(open === l.key ? null : l.key)} aria-expanded={open === l.key}>
                <span className="stage-n">{i + 1}</span>
                <span className="lv-name"><b>{l.label}</b><small>{l.stage}</small></span>
                <span className="lv-m"><small>teraz</small>{fm(l.key, l.current)}</span>
                <span className="lv-m"><small>benchmark</small>{fm(l.key, l.benchmark)}</span>
                <LeverValue v={l.value} r={l.range} low={l.lowConfidence} />
                <ChevronDown size={16} className="lv-chev" />
              </button>
              {open === l.key && (
                <div className="lv-detail">
                  <p className="lp-sub">{l.missing ? <span className="gap-tag">brak danych: {l.missing}</span> : <>Benchmark: {l.benchmarkSource}. Zakres 90%: {range(l.range)}/mies.</>} · +10% poprawy = {zlSigned(l.per10)}/mies.</p>
                  <StageDetail eng={eng} k={l.key} />
                  {focus !== l.key && <button className="btn small" onClick={() => setFocus(l.key)}><Flag size={14} /> Pogłębiam tę dźwignię</button>}
                </div>
              )}
              {focus === l.key && <span className="lv-flag"><Flag size={13} /> pogłębiamy</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Krok 6: Pytania sokratejskie ---------- */

function StepQuestions({ loopId, st, val, set, saveDraft, reload }: StepProps) {
  const [qs, setQs] = useState<{ questions: string[]; focus: MetricKey | null } | null>(null);
  const [claude, setClaude] = useState<string>((st.active?.data.pytania?.claude as string) ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<{ questions: string[]; focus: MetricKey | null }>(`/api/loops/${loopId}/questions`).then(setQs).catch((e) => setErr(e.message));
  }, [loopId]);
  const answers = val<Record<string, string>>("answers", {});
  const eng = snapshotOf(st);
  if (!qs) return <p>{err || "Układam pytania…"}</p>;
  const L = eng?.ranking.levers.find((l) => l.key === qs.focus);
  const all = qs.questions.length > 0 && qs.questions.every((_, i) => (answers[i] ?? "").trim());
  const ask = async () => {
    setBusy(true);
    setErr("");
    try {
      await saveDraft();
      const r = await api<{ text: string }>(`/api/loops/${loopId}/claude`, "POST");
      setClaude(r.text);
      await reload();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="lp-body">
      {L && (
        <div className="lp-card pr">
          <span><Flag size={14} /> <b>{L.label}</b> · teraz {fm(L.key, L.current)} · benchmark {fm(L.key, L.benchmark)} · <LeverValue v={L.value} r={L.range} low={L.lowConfidence} /></span>
        </div>
      )}
      {!qs.questions.length && <p className="lp-stop"><CircleAlert size={16} /> Brak dźwigni z danymi – wróć do kroku „Kwota na stole”.</p>}
      {qs.questions.map((q, i) => (
        <div key={q} className="lp-card">
          <label className="lp-l">{i + 1}. {q}</label>
          <textarea rows={2} value={answers[i] ?? ""} onChange={(e) => set("answers", { ...answers, [i]: e.target.value })} />
        </div>
      ))}
      <div className="lp-card">
        <div className="row">
          <button className="btn" disabled={!all || busy} onClick={ask}><Sparkles size={15} /> {busy ? "Claude analizuje…" : claude ? "Pokaż analizę Claude ponownie" : "Pokaż analizę Claude"}</button>
          {!all && <span className="lp-sub"><Lock size={13} /> najpierw Twoje odpowiedzi</span>}
        </div>
        {err && <p className="error">{err}</p>}
        {claude && <div className="claude-box">{claude}</div>}
      </div>
    </div>
  );
}

/* ---------- Krok 7: Decyzja = zlecenie ---------- */

function DecisionForm({ projectId, loopId, st, g, reload }: { projectId: string; loopId: string; st: LoopState; g: Gap | null; reload: () => Promise<void> }) {
  const eng = snapshotOf(st);
  const focus = (st.active?.data.pytania?.focus ?? st.active?.data.kwota?.focus ?? "cr") as MetricKey;
  const L = eng?.ranking.levers.find((l) => l.key === focus);
  const gapTxt = g ? `Luka do celu: ${zl(g.gap)}. ` : "";
  const autoWhy = L
    ? `${gapTxt}Kwota na stole: ${L.label} – ${L.value == null ? "brak danych" : L.lowConfidence ? `${range(L.range)}/mies. (niska pewność)` : `${zlSigned(L.value)}/mies.`} (teraz ${fm(L.key, L.current)}, benchmark ${fm(L.key, L.benchmark)}).`
    : "";
  const [kind, setKind] = useState<"zmiana" | typeof NO_CHANGE>("zmiana");
  const [f, setF] = useState({ what: "", who: "", why: autoWhy, element: "reklama", metric: focus, to: "", check: plus(14), ad: "" });
  const [err, setErr] = useState("");
  const isRate = f.metric === "ctr" || f.metric === "cr";
  const toNum = f.to.trim() ? Number(f.to.replace(",", ".")) / (isRate ? 100 : 1) : NaN;
  const base = eng?.ranking.base;
  const A = base?.[f.metric as MetricKey] ?? null;
  const expected = eng && Number.isFinite(toNum) ? hypothesisValue(eng.ranking.budget, eng.ranking.base, eng.econ, f.metric as MetricKey, toNum) : null;
  const m = METRICS.find((x) => x.key === f.metric)!;
  const save = async () => {
    setErr("");
    try {
      await api(`/api/loops/${loopId}/decision`, "POST", kind === NO_CHANGE
        ? { kind, why: f.why, who: f.who, check_date: f.check }
        : { kind, what: f.what, who: f.who, why: f.why, element: f.element, metric: f.metric, to_value: toNum, check_date: f.check, ad_test_id: f.ad || null });
      await reload();
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  return (
    <div className="lp-card df">
      <div className="seg big">
        <button className={kind === "zmiana" ? "on" : ""} onClick={() => setKind("zmiana")}>Zmieniam jedną rzecz</button>
        <button className={kind === NO_CHANGE ? "on" : ""} onClick={() => setKind(NO_CHANGE)}>Nic nie zmieniam</button>
      </div>
      {kind === "zmiana" && (
        <>
          <label className="lp-l">Co – jedna konkretna zmiana</label>
          <input value={f.what} onChange={(e) => setF({ ...f, what: e.target.value })} />
          <label className="lp-l">Kto</label>
          <input value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })} />
        </>
      )}
      <label className="lp-l">Dlaczego {kind === "zmiana" && <Tip text="Uzupełnione z luki i kwoty na stole – możesz dopisać." />}</label>
      <textarea rows={3} value={f.why} onChange={(e) => setF({ ...f, why: e.target.value })} />
      {kind === "zmiana" && (
        <>
          <label className="lp-l">Etap zmiany</label>
          <div className="seg">{ELEMENTS.map((x) => <button key={x} className={f.element === x ? "on" : ""} onClick={() => setF({ ...f, element: x })}>{x}</button>)}</div>
          <label className="lp-l">Hipoteza: jeśli {f.what || "…"}, to</label>
          <div className="hy">
            <select value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value as MetricKey, to: "" })}>
              {METRICS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}
            </select>
            <span>z <b>{fm(f.metric, A)}</b> do</span>
            <div className="money-input"><input inputMode="decimal" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} aria-label="Wartość docelowa" /><span>{isRate ? "%" : "zł"}</span></div>
          </div>
          <div className="hy-val">
            <em>Wartość oczekiwana</em>
            <b className={(expected ?? 0) < 0 ? "neg" : "pos"}>{expected == null ? "—" : `${zlSigned(expected)}/mies.`}</b>
            <small>{m.label}: budżet stały, reszta lejka bez zmian</small>
          </div>
          {st.adTests.length > 0 && (
            <label className="lp-mini">Test reklam do tej decyzji (opcjonalnie)
              <select value={f.ad} onChange={(e) => setF({ ...f, ad: e.target.value })}><option value="">—</option>{st.adTests.map((a) => <option key={a.id} value={a.id}>{a.angle}</option>)}</select>
            </label>
          )}
          <Link href={`/projects/${projectId}/testy`} className="btn small" target="_blank">Utwórz test w Testach reklam</Link>
        </>
      )}
      <label className="lp-l">Data sprawdzenia</label>
      <input type="date" value={f.check} min={plus(1)} onChange={(e) => setF({ ...f, check: e.target.value })} />
      {err && <p className="error">{err}</p>}
      <div className="row"><button className="btn primary" onClick={save}><Check size={15} /> Zapisz decyzję</button></div>
    </div>
  );
}

function StepDecision({ projectId, loopId, st, g, reload }: StepProps) {
  const mine = st.decisions.find((d) => d.loop_id === loopId);
  if (!mine) return <div className="lp-body"><DecisionForm projectId={projectId} loopId={loopId} st={st} g={g} reload={reload} /></div>;
  return (
    <div className="lp-body">
      <DecisionCard d={mine} onDelete={async () => { if (confirm("Usunąć decyzję i zapisać inną?")) { await api(`/api/decisions/${mine.id}`, "DELETE"); await reload(); } }}>
        <div className="row"><CopyBrief d={mine} /><span className="saved"><CircleCheck size={15} /> na osi czasu</span></div>
      </DecisionCard>
    </div>
  );
}

/* ---------- Krok 8: Kalendarz + checklista ---------- */

function StepCalendar({ projectId, loopId, st, reload }: StepProps) {
  const mine = st.decisions.find((d) => d.loop_id === loopId);
  if (!mine) return <p>Brak decyzji – wróć do kroku 7.</p>;
  return (
    <div className="lp-body">
      <DecisionCard d={mine}>
        {mine.kind === NO_CHANGE ? <p className="lp-sub">Nic do wdrożenia. Sprawdzenie {mine.check_date} – pojawi się w kalendarzu.</p> : <DecisionTasks d={mine} reload={reload} />}
        <div className="row"><CopyBrief d={mine} /><Link className="btn small" href={`/projects/${projectId}#kalendarz`} target="_blank">Kalendarz</Link></div>
      </DecisionCard>
    </div>
  );
}

/* ---------- Krok 9: Rozstrzygnięcie ---------- */

function StepVerdict({ loopId, st, reload }: StepProps) {
  const t = new Date().toISOString().slice(0, 10);
  const waiting = st.decisions.filter((d) => !d.verdict && d.check_date > t);
  const doneHere = st.decisions.filter((d) => d.verdict_loop_id === loopId);
  return (
    <div className="lp-body">
      {st.due.map((d) => <Verdict key={d.id} d={d} onDone={reload} />)}
      {doneHere.map((d) => (
        <div key={d.id} className="lp-card"><span className="saved"><CircleCheck size={15} /> {d.what} – {d.verdict}{d.impact_month != null ? ` · ${zlSigned(d.impact_month)}/mies.${d.low_confidence ? " (niska pewność)" : ""}` : ""}</span></div>
      ))}
      {!st.due.length && !doneHere.length && <div className="lp-card"><span><CircleCheck size={16} /> Żadna decyzja nie czeka dziś na sprawdzenie.</span></div>}
      {waiting.length > 0 && (
        <div className="lp-card">
          <h3>Czekają na dzień sprawdzenia</h3>
          <ul className="dc-waits">{waiting.map((d) => <Waiting key={d.id} d={d} />)}</ul>
        </div>
      )}
    </div>
  );
}

/* ---------- Krok 10: Wnioski ---------- */

export function Counter({ c }: { c: LoopState["counter"] }) {
  const trend = c.lastError != null && c.earlierError != null && Math.round(c.lastError) !== Math.round(c.earlierError) ? (c.lastError < c.earlierError ? "up" : "down") : null;
  return (
    <div className="cn">
      <div><em>Decyzje z analityki <Tip text="Suma zweryfikowanych wpływów (zł/mies.) z rozstrzygniętych decyzji – bez „za mało danych”." /></em><b><span className="pos">{zlSigned(c.plus)}</span> / <span className="neg">{zlSigned(c.minus)}</span></b><small>{c.verifiedCount} zweryfikowanych</small></div>
      <div><em>Trafność hipotez</em><b>{c.hitRate == null ? "—" : pct(c.hitRate, 0)}</b><small>{c.judged} rozstrzygniętych</small></div>
      <div><em>Średni błąd predykcji profitu</em><b>{zl(c.meanError)}</b><small>{trend ? <span className={`lp-arrow ${trend}`}>{trend === "up" ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />} ostatnio {zl(c.lastError)}</span> : `${c.predictions} predykcji`}</small></div>
      <div><em>Trafione etapy / dźwignie</em><b>{c.stageHit == null ? "—" : pct(c.stageHit, 0)} / {c.leverHit == null ? "—" : pct(c.leverHit, 0)}</b></div>
    </div>
  );
}

function StepLearn({ st, g, val, set }: StepProps) {
  const [filter, setFilter] = useState("");
  const reg = st.learnings.filter((l) => !filter || `${l.stage} ${l.element} ${l.text}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="lp-body">
      <div className="lp-card">
        <label className="lp-l">Czego się nauczyłeś w tej sesji? (1 zdanie)</label>
        <textarea rows={2} value={val("summary", "")} onChange={(e) => set("summary", e.target.value)} />
        <div className="lp-kpis">
          <div><em>Profit w okresie celu</em><b>{zl(g?.achieved)}</b><small>z {zl(g?.target)}</small></div>
          <div><em>Luka</em><b className={(g?.gap ?? 0) > 0 ? "neg" : ""}>{zl(g?.gap)}</b></div>
        </div>
      </div>
      <div className="lp-card"><Counter c={st.counter} /></div>
      <div className="lp-card">
        <h3>Rejestr wniosków</h3>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Szukaj" aria-label="Szukaj" />
        <ul className="lp-gaps">{reg.slice(0, 30).map((l) => <li key={l.id}><span className="tt-chips"><span>{l.stage || "—"}</span>{l.element && <span>{l.element}</span>}</span> {l.text}{l.profit_delta != null && <b> ({zlSigned(l.profit_delta)}/mies.)</b>} <small>{l.created_at}</small></li>)}</ul>
        {!reg.length && <p>Brak wniosków.</p>}
      </div>
    </div>
  );
}
