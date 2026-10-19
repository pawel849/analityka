"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Calendar, CalendarDays, CalendarRange, Check, CircleAlert, CircleCheck, Eye, FlaskConical, Flag, Gift, Globe, Loader2,
  Megaphone, MousePointerClick, MoreHorizontal, Package, Pause, Pencil, Square, Target, CalendarClock, RotateCw, ShoppingCart, Sparkles, Video, Wallet, X,
} from "lucide-react";
import { api } from "../forms";
import { hypothesisValue, METRICS, modelProfit, type MetricKey } from "@/lib/levers";
import { ELEMENTS, LEVER_NAMES, NO_CHANGE, STEPS } from "@/lib/loop-def";
import type { LoopState, ReportData } from "@/lib/loop";
import type { EngineResult } from "@/lib/loop-data";
import { DecisionCard, DecisionTasks, CopyBrief, Deadline, Verdict } from "./Decisions";
import { daysTo } from "./ui";
import { LeverBars, LeverDetail, PredictionVs, ReportView, stageName } from "./ReportView";
import {
  DataGaps, dayLabel, fm, formatAmount, GoalChart, MoneyInput, PaceBars, plus, ProfitBars, range, RichText, zl, zlSigned, type GoalGap,
} from "./ui";

const LEVER_ICON: Record<string, typeof Eye> = { cpm: Eye, ctr: MousePointerClick, cr: ShoppingCart, aov: Wallet };

/* ---------- główny komponent ---------- */

export function LoopRunner({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [st, setSt] = useState<LoopState | null>(null);
  const [g, setG] = useState<GoalGap | null>(null);
  const [view, setView] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [miss, setMiss] = useState<string[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const s = await api<LoopState>(`/api/projects/${projectId}/loop`);
    if (!s.active) {
      router.replace(`/projects/${projectId}`);
      return;
    }
    setSt(s);
    setG(await api<GoalGap | null>(`/api/projects/${projectId}/loop/gap`));
  }, [projectId, router]);
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);

  if (err && !st) return <p className="error">{err}</p>;
  if (!st?.active) return <p className="ss-load"><Loader2 className="spin" size={18} /> Wczytuję…</p>;
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
        router.push(`/projects/${projectId}/raporty/${loop.id}`);
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
  const nextLabel = step === STEPS.length - 1 ? "Zapisz raport i zakończ" : `Dalej: ${STEPS[step + 1].title}`;

  return (
    <div className="ss">
      <div className="ss-top">
        <Link href={`/projects/${projectId}`} className="back-btn" title="Przerwij – wrócisz w to samo miejsce" aria-label="Przerwij"><Pause size={18} /></Link>
        <div className="ss-prog" aria-label={`Postęp sesji: ${step + 1} z ${STEPS.length}`}>
          {STEPS.map((s, i) => <i key={s.key} className={i < loop.step ? "done" : i === step ? "on" : ""} />)}
        </div>
      </div>
      <h1 className="ss-title">{S.title}</h1>
      <section className="ss-body">
        {S.key === "cel" && <StepGoal {...props} />}
        {S.key === "predykcja" && <StepPredict {...props} />}
        {S.key === "rzeczywistosc" && <StepReality {...props} />}
        {S.key === "luka" && <StepGap {...props} />}
        {S.key === "kwota" && <StepMoney {...props} />}
        {S.key === "pytania" && <StepQuestions {...props} />}
        {S.key === "analiza" && <StepAnalysis {...props} />}
        {S.key === "decyzja" && <StepDecision {...props} />}
        {S.key === "kalendarz" && <StepCalendar {...props} />}
        {S.key === "rozstrzygniecie" && <StepVerdict {...props} />}
        {S.key === "raport" && <StepReport {...props} />}
      </section>
      {miss.length > 0 && (
        <div className="lp-miss">
          <b><CircleAlert size={16} /> Brakuje:</b>
          <ul>{miss.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
      {err && <p className="error">{err}</p>}
      <div className="lp-nav">
        {step > 0 ? <button className="btn" onClick={() => saveDraft().then(() => go(step - 1))}><ArrowLeft size={15} /> Wstecz</button> : <span />}
        <button className="btn primary big" disabled={busy} onClick={next}>
          {busy ? <Loader2 className="spin" size={16} /> : step === STEPS.length - 1 ? <CircleCheck size={16} /> : null} {nextLabel} {step < STEPS.length - 1 && <ArrowRight size={16} />}
        </button>
      </div>
    </div>
  );
}

interface StepProps {
  projectId: string;
  loopId: string;
  st: LoopState;
  g: GoalGap | null;
  val: <T>(k: string, d: T) => T;
  set: (k: string, v: unknown) => void;
  reload: () => Promise<void>;
  saveDraft: () => Promise<void>;
}

const snapshotOf = (st: LoopState) => (st.active?.data.kwota?.snapshot ?? null) as EngineResult | null;

/* ---------- 1. Cel i zakres ---------- */

const PERIODS = [
  { key: "miesiąc", icon: Calendar },
  { key: "kwartał", icon: CalendarRange },
  { key: "rok", icon: CalendarDays },
] as const;

function periodRange(p: string, base = new Date()): [string, string] {
  const y = base.getFullYear(), m = base.getMonth();
  const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (p === "kwartał") { const q0 = Math.floor(m / 3) * 3; return [f(new Date(y, q0, 1)), f(new Date(y, q0 + 3, 0))]; }
  if (p === "rok") return [`${y}-01-01`, `${y}-12-31`];
  return [f(new Date(y, m, 1)), f(new Date(y, m + 1, 0))];
}

const MONTHS = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];

/** Okres jako kalendarz: kratki dni (miesiąc) albo miesięcy (kwartał, rok); dziś wyróżnione. */
function PeriodBar({ from, to }: { from: string; to: string }) {
  const a = new Date(`${from}T12:00:00`), b = new Date(`${to}T12:00:00`), now = new Date();
  const today = now.toISOString().slice(0, 10);
  const left = Math.max(0, Math.round((b.getTime() - Date.parse(`${today}T12:00:00`)) / 864e5) + 1);
  const days = Math.round((b.getTime() - a.getTime()) / 864e5) + 1;
  const title = days <= 31 ? a.toLocaleDateString("pl-PL", { month: "long", year: "numeric" }) : `${MONTHS[a.getMonth()]} – ${MONTHS[b.getMonth()]} ${b.getFullYear()}`;
  const cells = days <= 31
    ? Array.from({ length: days }, (_, i) => {
        const d = new Date(a.getTime() + i * 864e5).toISOString().slice(0, 10);
        return { key: d, label: String(i + 1), state: d < today ? "past" : d === today ? "now" : "next" };
      })
    : Array.from({ length: (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() + 1 }, (_, i) => {
        const m = new Date(a.getFullYear(), a.getMonth() + i, 1);
        const cur = m.getFullYear() === now.getFullYear() && m.getMonth() === now.getMonth();
        return { key: String(i), label: MONTHS[m.getMonth()], state: cur ? "now" : m < now ? "past" : "next" };
      });
  return (
    <div className="cal">
      <div className="cal-head"><b>{title}</b><span>{left > 0 ? `zostało ${left} ${left === 1 ? "dzień" : "dni"}` : "okres minął"}</span></div>
      <div className={`cal-grid ${days <= 31 ? "d" : "m"}`}>
        {cells.map((c) => <span key={c.key} className={c.state} title={c.state === "now" ? "dziś" : undefined}>{c.label}</span>)}
      </div>
    </div>
  );
}

export function GoalForm({ projectId, last, onSaved, onCancel }: { projectId: string; last: LoopState["lastGoal"]; onSaved: () => void; onCancel?: () => void }) {
  const p0 = last?.period && ["miesiąc", "kwartał", "rok"].includes(last.period) ? last.period : "miesiąc";
  const [period, setPeriod] = useState(p0);
  const [[from, to], setRange] = useState(periodRange(p0));
  const [target, setTarget] = useState<number | null>(last ? Math.round(last.profit_target) : null);
  const [dirty, setDirty] = useState(!last);
  const [err, setErr] = useState("");
  const save = async () => {
    setErr("");
    try {
      await api(`/api/projects/${projectId}/goals`, "POST", { period, date_from: from, date_to: to, profit_target: target });
      setDirty(false);
      onSaved();
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  return (
    <div className="gf">
      <div className="gf-periods">
        {PERIODS.map(({ key, icon: I }) => (
          <button key={key} className={`tile ${period === key ? "on" : ""}`} onClick={() => { setPeriod(key); setRange(periodRange(key)); setDirty(true); }}>
            <I size={22} /> {key}
          </button>
        ))}
      </div>
      <PeriodBar from={from} to={to} />
      <div className="gf-amount">
        <span>Cel profitu</span>
        <MoneyInput big value={target} onChange={(v) => { setTarget(v); setDirty(true); }} ariaLabel="Cel profitu" />
      </div>
      {err && <p className="error">{err}</p>}
      <div className="row">
        <button className={`btn primary ${dirty && target ? "pulse" : ""}`} disabled={!target} onClick={save}><Check size={15} /> Zapisz cel</button>
        {onCancel && <button className="btn" onClick={onCancel}>Anuluj</button>}
      </div>
    </div>
  );
}

function ScopePicker({ projectId, st, reload }: { projectId: string; st: LoopState; reload: () => Promise<void> }) {
  const [lists, setLists] = useState<{ campaigns: { name: string; platform: string; spend: number }[]; products: { name: string; gross: number | null }[] } | null>(null);
  const init = st.scope ?? st.economicsScope;
  const [camps, setCamps] = useState<string[]>(init.campaigns);
  const [prods, setProds] = useState<string[]>(init.products);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    api<NonNullable<typeof lists>>(`/api/projects/${projectId}/loop/scope`).then(setLists).catch(() => {});
  }, [projectId]);
  // pierwsze wejście: zapisz zakres od razu (nic nie trzeba zatwierdzać)
  useEffect(() => {
    if (!st.scope) api(`/api/projects/${projectId}/loop/scope`, "PUT", { campaigns: init.campaigns, products: init.products }).then(reload).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const persist = (c: string[], p: string[]) => {
    setSaving(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await api(`/api/projects/${projectId}/loop/scope`, "PUT", { campaigns: c, products: p });
      setSaving(false);
    }, 600);
  };
  if (!lists) return <div className="sc3"><p className="ss-load"><Loader2 className="spin" size={16} /> Wczytuję kampanie i produkty…</p></div>;
  const Box = ({ icon: I, title, items, sel, setSel, other }: { icon: typeof Megaphone; title: string; items: { name: string; sub: string }[]; sel: string[]; setSel: (v: string[]) => void; other: (v: string[]) => void }) => {
    const names = items.map((i) => i.name);
    const all = sel.length === 0;
    const isOn = (n: string) => all || sel.includes(n);
    const apply = (next: string[]) => {
      const norm = next.length >= names.length && names.every((n) => next.includes(n)) ? [] : next;
      setSel(norm);
      other(norm);
    };
    const toggle = (n: string) => apply(all ? names.filter((x) => x !== n) : sel.includes(n) ? sel.filter((x) => x !== n) : [...sel, n]);
    const count = all ? names.length : sel.filter((x) => names.includes(x)).length;
    return (
      <div className="sc3-box">
        <div className="sc3-head">
          <span className="sc3-ic"><I size={20} /></span>
          <div><b>{title}</b><small>{all ? `wszystkie (${names.length})` : `${count} z ${names.length}`}</small></div>
          <button className={`sw ${all ? "on" : ""}`} role="switch" aria-checked={all} disabled={all} onClick={() => apply([])} title={all ? "Odznacz pojedyncze pozycje poniżej" : "Zaznacz wszystkie"}>
            <i /><span>wszystkie</span>
          </button>
        </div>
        <div className="sc3-pills">
          {items.map((x) => (
            <button key={x.name} className={`pill ${isOn(x.name) ? "on" : ""}`} onClick={() => toggle(x.name)} aria-pressed={isOn(x.name)} title={x.name}>
              {isOn(x.name) ? <Check size={14} /> : <span className="pill-dot" />}
              <span className="pill-name">{x.name}</span>
              {x.sub && <small>{x.sub}</small>}
            </button>
          ))}
        </div>
      </div>
    );
  };
  return (
    <div className="sc3">
      <div className="sc3-title"><b>Z czego liczymy</b>{saving ? <span className="saving"><Loader2 className="spin" size={13} /> zapisuję</span> : <span className="saved"><CircleCheck size={14} /> zapisane</span>}</div>
      <div className="sc3-cols">
        <Box icon={Megaphone} title="Kampanie" items={lists.campaigns.map((c) => ({ name: c.name, sub: zl(c.spend) }))} sel={camps} setSel={setCamps} other={(c) => persist(c, prods)} />
        <Box icon={Package} title="Produkty" items={lists.products.map((p) => ({ name: p.name, sub: p.gross == null ? "" : zl(p.gross) }))} sel={prods} setSel={setProds} other={(p) => persist(camps, p)} />
      </div>
    </div>
  );
}

/* okres sesji (z jakiego czasu raport) */
const isoD = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function presetRanges(): { key: string; label: string; from: string; to: string }[] {
  const now = new Date();
  const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const back = (n: number) => isoD(new Date(y.getFullYear(), y.getMonth(), y.getDate() - n + 1));
  const dow = (now.getDay() + 6) % 7; // pon = 0
  const lastMon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow - 7);
  const lastSun = new Date(lastMon.getFullYear(), lastMon.getMonth(), lastMon.getDate() + 6);
  const pmFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const pmTo = new Date(now.getFullYear(), now.getMonth(), 0);
  return [
    { key: "7", label: "Ostatnie 7 dni", from: back(7), to: isoD(y) },
    { key: "14", label: "Ostatnie 14 dni", from: back(14), to: isoD(y) },
    { key: "30", label: "Ostatnie 30 dni", from: back(30), to: isoD(y) },
    { key: "pw", label: "Poprzedni tydzień", from: isoD(lastMon), to: isoD(lastSun) },
    { key: "pm", label: "Poprzedni miesiąc", from: isoD(pmFrom), to: isoD(pmTo) },
  ];
}

function RangePicker({ loopId, st, reload }: { loopId: string; st: LoopState; reload: () => Promise<void> }) {
  const presets = presetRanges();
  const r = st.range;
  const hit = presets.find((p) => p.from === r.from && p.to === r.to);
  const [custom, setCustom] = useState(!hit);
  const [c, setC] = useState(r);
  const [busy, setBusy] = useState(false);
  const save = async (range: { from: string; to: string }) => {
    setBusy(true);
    await api(`/api/loops/${loopId}`, "PATCH", { step: 0, patch: { range }, advance: false });
    await reload();
    setBusy(false);
  };
  const yesterday = presets[0].to;
  const len = Math.round((Date.parse(`${r.to}T12:00:00`) - Date.parse(`${r.from}T12:00:00`)) / 864e5) + 1;
  return (
    <div className="card-s rng">
      <h3><CalendarRange size={20} /> Z jakiego okresu robimy raport?</h3>
      <div className="rng-big">
        <b>{dayLabel(r.from)} – {dayLabel(r.to)}</b>
        <span>{len} {len === 1 ? "dzień" : "dni"}{busy && <Loader2 className="spin" size={14} />}</span>
      </div>
      <div className="rng-presets">
        {presets.map((p) => <button key={p.key} className={`tile sm ${!custom && hit?.key === p.key ? "on" : ""}`} onClick={() => { setCustom(false); save(p); }}>{p.label}</button>)}
        <button className={`tile sm ${custom ? "on" : ""}`} onClick={() => setCustom(true)}>Własny</button>
      </div>
      {custom && (
        <div className="rng-custom">
          <input type="date" value={c.from} max={c.to} onChange={(e) => setC({ ...c, from: e.target.value })} aria-label="Od" />
          <span>–</span>
          <input type="date" value={c.to} min={c.from} max={yesterday} onChange={(e) => setC({ ...c, to: e.target.value })} aria-label="Do" />
          <button className="btn primary" disabled={!c.from || !c.to || c.from > c.to || c.to > yesterday} onClick={() => save(c)}><Check size={15} /> Ustaw</button>
        </div>
      )}
    </div>
  );
}

function StepGoal({ projectId, loopId, st, val, reload }: StepProps) {
  const [edit, setEdit] = useState(!st.goal);
  const ratings = val<Record<string, { effect?: string; carry?: boolean }>>("ratings", {});
  const rate = async (taskId: string, effect: string, carry = false) => {
    await api(`/api/loops/${loopId}/rate`, "POST", { taskId, effect, carry, due: plus(3) });
    await reload();
  };
  return (
    <div className="ss-stack">
      {st.prev && st.prevActions.length > 0 && (
        <div className="card-s copper">
          <h3><Flag size={16} /> Działania z poprzedniej sesji</h3>
          <ul className="lp-rate">
            {st.prevActions.map((a) => {
              const r = ratings[a.id];
              return (
                <li key={a.id} className={r?.effect ? "rated" : ""}>
                  <span className={`lp-done ${a.done ? "y" : "n"}`}>{a.done ? <CircleCheck size={15} /> : <X size={15} />}</span>
                  <span className="lp-rate-t">{a.title}</span>
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
      <RangePicker loopId={loopId} st={st} reload={reload} />
      <div className="card-s">
        {!edit && st.goal ? (
          <div className="gf-done">
            <div><em>Cel profitu ({st.goal.period})</em><b>{zl(st.goal.profit_target)}</b></div>
            <PeriodBar from={st.goal.date_from} to={st.goal.date_to} />
            <button className="btn small" onClick={() => setEdit(true)}>Zmień</button>
          </div>
        ) : (
          <GoalForm projectId={projectId} last={st.goal ?? st.lastGoal} onSaved={() => { setEdit(false); reload(); }} onCancel={st.goal ? () => setEdit(false) : undefined} />
        )}
      </div>
      <ScopePicker projectId={projectId} st={st} reload={reload} />
    </div>
  );
}

/* ---------- 2. Predykcja ---------- */

const STAGE_OPTIONS = [
  { key: "cpm", icon: Eye }, { key: "ctr", icon: MousePointerClick }, { key: "cr", icon: ShoppingCart }, { key: "aov", icon: Wallet }, { key: "żaden", icon: CircleCheck },
] as const;

function StepPredict({ st, g, val, set }: StepProps) {
  const p = st.prediction;
  const weekly = g ? (g.target / Math.max(1, g.totalDays)) * 7 : 5000;
  const step = weekly > 20000 ? 500 : weekly > 2000 ? 100 : 10;
  const min = -Math.ceil((weekly * 1.5) / step) * step;
  const max = Math.ceil((weekly * 3) / step) * step;
  const profit = val<number | null>("profit_guess", p?.profit_guess ?? null);
  const stage = val<string>("stage_guess", p?.stage_guess ?? "");
  const locked = false;
  return (
    <div className="ss-stack">
      <div className="card-s pd">
        <h3>Ile zarobiłeś na czysto w 7 dniach do {dayLabel(st.range.to)}?</h3>
        <div className="pd-value">{profit == null ? "?" : `${formatAmount(Math.round(profit))} zł`}</div>
        <input type="range" className="pd-slider" min={min} max={max} step={step} value={profit ?? 0} disabled={locked} onChange={(e) => set("profit_guess", Number(e.target.value))} aria-label="Profit tygodnia" />
        <div className="pd-scale"><span>{formatAmount(min)} zł</span><span>0</span><span>{formatAmount(max)} zł</span></div>
        {!locked && <div className="pd-exact"><span>albo wpisz</span><MoneyInput allowNegative value={profit} onChange={(v) => set("profit_guess", v)} ariaLabel="Profit tygodnia" /></div>}
      </div>
      <div className="card-s">
        <h3>Co się pogorszyło w tym tygodniu (vs tydzień wcześniej)?</h3>
        <div className="pd-stages">
          {STAGE_OPTIONS.map(({ key, icon: I }) => (
            <button key={key} disabled={locked} className={`tile ${stage === key ? "on" : ""}`} onClick={() => set("stage_guess", key)}>
              <I size={26} />
              <b>{key === "żaden" ? "Nic" : LEVER_NAMES[key].name}</b>
              {key !== "żaden" && <small>{LEVER_NAMES[key].short}</small>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- 3. Wynik vs cel ---------- */

interface Money { from: string; to: string; profit: number }
interface Reality { weeks: Money[]; days: Money[]; daily60: Money[]; gaps: string[] }

function GoalHero({ g }: { g: GoalGap }) {
  return (
    <div className="gh">
      <div className="gh-nums">
        <div><em>Masz</em><b>{zl(g.achieved)}</b></div>
        <div><em>Cel</em><b>{zl(g.target)}</b></div>
        <div className={g.gap > 0 ? "miss" : "ok"}><em>{g.gap > 0 ? "Brakuje" : "Ponad cel"}</em><b>{zl(Math.abs(g.gap))}</b></div>
        <div><em>Zostało dni</em><b>{g.left}</b></div>
      </div>
      <GoalChart g={g} />
    </div>
  );
}

function StepReality({ projectId, st, g }: StepProps) {
  const [r, setR] = useState<Reality | null>(null);
  const [scale, setScale] = useState<"dni60" | "tygodnie" | "dni14">("tygodnie");
  useEffect(() => {
    api<Reality>(`/api/projects/${projectId}/loop/reality`).then(setR).catch(() => {});
  }, [projectId]);
  const p = st.prediction;
  const extra = p?.stage_actual && p.stage_actual !== "żaden" ? [`Wąskie gardło w ostatnim tygodniu: ${stageName(p.stage_actual)} – pogorszyło się najbardziej.`] : [];
  return (
    <div className="ss-stack">
      <div className="card-s duo">
        {g ? <GoalHero g={g} /> : <p>Brak celu – ustaw go w pierwszym kroku.</p>}
        {p && <PredictionVs p={p} />}
      </div>
      {r ? <DataGaps gaps={r.gaps} extra={extra} /> : null}
      <div className="card-s">
        <div className="seg">
          {([["tygodnie", "Tydzień po tygodniu"], ["dni14", "Ostatnie 14 dni"], ["dni60", "60 dni dzień po dniu"]] as const).map(([k, l]) => (
            <button key={k} className={scale === k ? "on" : ""} onClick={() => setScale(k)}>{l}</button>
          ))}
        </div>
        <h3 className="ss-h3">Profit na czysto {scale === "tygodnie" ? "w każdym tygodniu" : "każdego dnia"}</h3>
        {!r ? <p className="ss-load"><Loader2 className="spin" size={16} /> Liczę…</p> : (
          <ProfitBars items={(scale === "tygodnie" ? r.weeks : scale === "dni14" ? r.days : r.daily60).map((m) => ({ label: dayLabel(m.from), value: m.profit }))} />
        )}
      </div>
    </div>
  );
}

/* ---------- 4. Luka ---------- */

function StepGap({ st, g }: StepProps) {
  if (!g) return <p>Brak celu – ustaw go w pierwszym kroku.</p>;
  const p = st.prediction;
  const extra = p?.stage_actual && p.stage_actual !== "żaden" ? [`Wąskie gardło w ostatnim tygodniu: ${stageName(p.stage_actual)}.`] : [];
  return (
    <div className="ss-stack">
      <div className="card-s gap-hero">
        <div className={`gap-big ${g.gap > 0 ? "miss" : "ok"}`}>
          <em>{g.gap > 0 ? "Brakuje do celu" : "Cel osiągnięty z nadwyżką"}</em>
          <b>{zl(Math.abs(g.gap))}</b>
          <span>{g.left} dni do końca okresu</span>
        </div>
        <div className="gap-pace">
          <PaceBars pace={g.pacePerDay} need={g.needFromNow} />
        </div>
      </div>
      <DataGaps gaps={g.gaps} extra={extra} />
    </div>
  );
}

/* ---------- 5. Gdzie leżą pieniądze ---------- */

function StepMoney({ loopId, st, reload }: StepProps) {
  const eng = snapshotOf(st);
  const guess = st.prediction?.lever_guess ?? null;
  const [pick, setPick] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const focus = (st.active?.data.pytania?.focus ?? st.active?.data.kwota?.focus ?? null) as MetricKey | null;
  const reveal = async (k: string) => {
    setPick(k);
    setErr("");
    try {
      await api(`/api/loops/${loopId}/lever`, "POST", { guess: k });
      await reload();
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  if (!guess || !eng)
    return (
      <div className="ss-stack">
        <div className="card-s">
          <h3 className="ss-ask">Gdzie Twoim zdaniem leży najwięcej pieniędzy?</h3>
          <div className="guess">
            {METRICS.map((m) => {
              const I = LEVER_ICON[m.key];
              return (
                <button key={m.key} className={`guess-tile ${pick === m.key ? "on" : ""}`} onClick={() => reveal(m.key)}>
                  <I size={34} />
                  <b>{LEVER_NAMES[m.key].name}</b>
                  <small>{LEVER_NAMES[m.key].short}</small>
                </button>
              );
            })}
          </div>
          {err && <p className="error">{err}</p>}
        </div>
      </div>
    );
  // łącznie: wszystkie metryki z benchmarkiem naraz (efekty się mnożą, więc to nie jest prosta suma pasków)
  const over = Object.fromEntries(eng.ranking.levers.filter((l) => l.benchmark != null && !l.missing && (l.value ?? 0) > 0).map((l) => [l.key, l.benchmark as number]));
  const all = Object.keys(over).length ? modelProfit(eng.ranking.budget, eng.ranking.base, eng.econ, over) : null;
  const total = all != null && eng.ranking.profitNow != null ? all - eng.ranking.profitNow : null;
  const anyLow = eng.ranking.levers.some((l) => l.key in over && l.lowConfidence);
  const setFocus = async (k: string) => {
    await api(`/api/loops/${loopId}/questions`, "POST", { focus: k });
    await reload();
  };
  return (
    <div className="ss-stack">
      <div className="tot">
        <Sparkles size={22} />
        <div><em>Gdyby wszystko wróciło do najlepszych tygodni</em><b>{total == null ? "brak danych" : `${zlSigned(total)} / mies.`}</b>{anyLow && <small>mało danych w części pomiarów – liczba orientacyjna</small>}</div>
      </div>
      <div className="card-s">
        <h3 className="ss-h3">Ile więcej profitu miesięcznie, gdyby każda rzecz wróciła do najlepszego tygodnia</h3>
        <div className="guess-mini"><span>Twój typ:</span>{METRICS.map((m) => { const I = LEVER_ICON[m.key]; return <button key={m.key} className={`tile sm ${guess === m.key ? "on" : ""}`} onClick={() => reveal(m.key)}><I size={16} /> {LEVER_NAMES[m.key].short}</button>; })}</div>
        <LeverBars levers={eng.ranking.levers} focus={focus} open={open} guess={guess} onPick={(k) => setOpen(open === k ? null : k)}
          detail={(k) => (
            <>
              <LeverDetail eng={eng} k={k as MetricKey} />
              {focus !== k && <button className="btn" onClick={() => setFocus(k)}><Flag size={14} /> Tę dźwignię pogłębiamy</button>}
            </>
          )} />
      </div>
      {eng.gaps.length > 0 && <DataGaps gaps={eng.gaps} />}
    </div>
  );
}

/* ---------- 6. Pytania ---------- */

function FocusHero({ eng, focus }: { eng: EngineResult | null; focus: MetricKey | null }) {
  const L = eng?.ranking.levers.find((l) => l.key === focus);
  if (!L || !focus) return null;
  const I = LEVER_ICON[focus];
  return (
    <div className="fh">
      <I size={26} />
      <div><b>{LEVER_NAMES[focus].name}</b><span>{fm(focus, L.current)} → {fm(focus, L.benchmark)}</span></div>
      <strong>{L.lowConfidence ? range(L.range) : zlSigned(L.value)}<small>/mies.</small></strong>
    </div>
  );
}

function StepQuestions({ loopId, st, val, set }: StepProps) {
  const [qs, setQs] = useState<{ questions: string[]; focus: MetricKey | null; source: string | null; error: string | null } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    api<NonNullable<typeof qs>>(`/api/loops/${loopId}/questions`).then(setQs).catch((e) => setErr(e.message));
  }, [loopId]);
  const answers = val<Record<string, string>>("answers", {});
  if (!qs) return <p className="ss-load"><Loader2 className="spin" size={18} /> {err || "Claude układa pytania…"}</p>;
  return (
    <div className="ss-stack">
      <FocusHero eng={snapshotOf(st)} focus={qs.focus} />
      {qs.source === "dane" && <div className="dg"><div className="dg-head"><CircleAlert size={18} /> <b>Claude niedostępny – pytania z danych</b></div><ul><li>{qs.error}</li></ul></div>}
      {qs.questions.map((q, i) => (
        <div key={q} className="card-s qa">
          <span className="qa-n">{i + 1}</span>
          <div>
            <p>{q}</p>
            <textarea rows={2} value={answers[i] ?? ""} onChange={(e) => set("answers", { ...answers, [i]: e.target.value })} placeholder="1–2 zdania" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- 7. Analiza Claude ---------- */

function StepAnalysis({ loopId, st, reload }: StepProps) {
  const text = (st.active?.data.analiza?.text as string | undefined) ?? "";
  const skipped = st.active?.data.analiza?.skipped === true;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const eng = snapshotOf(st);
  const focus = (st.active?.data.pytania?.focus ?? null) as MetricKey | null;
  const run = useCallback(async () => {
    setBusy(true);
    setErr("");
    try {
      await api(`/api/loops/${loopId}/analysis`, "POST");
      await reload();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  }, [loopId, reload]);
  useEffect(() => {
    if (!text && !skipped) run();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const skip = async (on: boolean) => {
    await api(`/api/loops/${loopId}`, "PATCH", { step: STEPS.findIndex((x) => x.key === "analiza"), patch: { skipped: on, skipReason: on ? err : "" }, advance: false });
    await reload();
  };
  const L = eng && focus ? eng.ranking.levers.find((l) => l.key === focus) : null;
  const prev = eng && focus ? eng.metricsPrev[focus] : null;
  const vals = L ? [prev, L.current, L.benchmark] : [];
  const max = Math.max(0, ...vals.map((v) => v ?? 0)) || 1;
  return (
    <div className="ss-stack">
      <FocusHero eng={eng} focus={focus} />
      {L && focus && (
        <div className="card-s">
          <h3 className="ss-h3">{LEVER_NAMES[focus].short}: jak było, jak jest, do czego dążymy</h3>
          <div className="an-bars">
            {[["Poprzednie 30 dni", prev], ["Ostatnie 30 dni", L.current], ["Najlepszy tydzień", L.benchmark]].map(([l, v]) => (
              <div key={l as string}><i style={{ height: `${(((v as number | null) ?? 0) / max) * 100}%` }} /><b>{fm(focus, v as number | null)}</b><span>{l as string}</span></div>
            ))}
          </div>
        </div>
      )}
      <div className="card-s claude">
        <h3><Sparkles size={18} /> Analiza Claude</h3>
        {busy && <p className="ss-load"><Loader2 className="spin" size={18} /> Claude czyta liczby i Twoje odpowiedzi…</p>}
        {!busy && err && !text && (
          <div className="an-fail">
            <CircleAlert size={26} />
            <b>Analiza Claude nie działa</b>
            <small>{err}</small>
            {skipped ? <span className="saved"><CircleCheck size={15} /> pominięta – możesz iść dalej</span> : (
              <div className="row">
                <button className="btn" onClick={run}><RotateCw size={15} /> Spróbuj ponownie</button>
                <button className="btn primary" onClick={() => skip(true)}>Pomiń analizę</button>
              </div>
            )}
          </div>
        )}
        {!busy && !err && skipped && !text && <div className="an-fail"><b>Analiza pominięta</b><button className="btn" onClick={() => skip(false).then(run)}><RotateCw size={15} /> Spróbuj teraz</button></div>}
        {!busy && text && <RichText text={text} />}
      </div>
    </div>
  );
}

/* ---------- 8. Decyzja ---------- */

const ELEMENT_ICON: Record<string, typeof Megaphone> = { reklama: Megaphone, strona: Globe, VSL: Video, checkout: ShoppingCart, oferta: Gift, inne: MoreHorizontal };

/** Formularz decyzji – zapisuje się przy „Dalej” (pola trafiają do szkicu kroku). */
function DecisionForm({ projectId, st, g, edit, onCancel, setForm }: { projectId: string; st: LoopState; g: GoalGap | null; edit?: LoopState["decisions"][number]; onCancel?: () => void; setForm: (v: unknown) => void }) {
  const eng = snapshotOf(st);
  const focus = (st.active?.data.pytania?.focus ?? st.active?.data.kwota?.focus ?? "cr") as MetricKey;
  const L = eng?.ranking.levers.find((l) => l.key === focus);
  const autoWhy = [
    g && g.gap > 0 ? `Brakuje ${zl(g.gap)} do celu.` : "",
    L ? `${LEVER_NAMES[focus].name}: ${L.lowConfidence ? range(L.range) : zlSigned(L.value)} miesięcznie na stole.` : "",
  ].filter(Boolean).join(" ");
  const [kind, setKind] = useState<"zmiana" | typeof NO_CHANGE>(edit?.kind === NO_CHANGE ? NO_CHANGE : "zmiana");
  const [f, setF] = useState(edit
    ? { what: edit.kind === NO_CHANGE ? "" : edit.what, who: edit.who, why: edit.why, element: edit.element || "reklama", metric: (edit.metric ?? focus) as string, check: edit.check_date, ad: edit.ad_test_id ?? "" }
    : { what: "", who: "", why: autoWhy, element: "reklama", metric: focus as string, check: plus(14), ad: "" });
  const [to, setTo] = useState<number | null>(edit?.to_value != null ? Math.round(edit.to_value * (edit.metric === "ctr" || edit.metric === "cr" ? 100 : 1) * 100) / 100 : null);
  const isRate = f.metric === "ctr" || f.metric === "cr";
  const toNum = to == null ? NaN : to / (isRate ? 100 : 1);
  const A = eng?.ranking.base[f.metric as MetricKey] ?? null;
  const expected = eng && Number.isFinite(toNum) ? hypothesisValue(eng.ranking.budget, eng.ranking.base, eng.econ, f.metric as MetricKey, toNum) : null;
  useEffect(() => {
    setForm(kind === NO_CHANGE
      ? { kind, why: f.why, who: f.who, check_date: f.check }
      : { kind, what: f.what, who: f.who, why: f.why, element: f.element, metric: f.metric, to_value: Number.isFinite(toNum) ? toNum : null, check_date: f.check, ad_test_id: f.ad || null });
  }, [kind, f, toNum]); // eslint-disable-line react-hooks/exhaustive-deps
  const n = daysTo(f.check);
  return (
    <div className="ss-stack">
      <div className="seg big">
        <button className={kind === "zmiana" ? "on" : ""} onClick={() => setKind("zmiana")}>Zmieniam jedną rzecz</button>
        <button className={kind === NO_CHANGE ? "on" : ""} onClick={() => setKind(NO_CHANGE)}>Nic nie zmieniam</button>
      </div>
      {kind === "zmiana" && (
        <>
          <div className="card-s df2">
            <label className="df2-l">Co zmieniasz?</label>
            <input className="df2-what" value={f.what} onChange={(e) => setF({ ...f, what: e.target.value })} placeholder="Jedna konkretna zmiana" />
            <label className="df2-l">Gdzie?</label>
            <div className="df2-el">
              {ELEMENTS.map((x) => {
                const I = ELEMENT_ICON[x];
                return <button key={x} className={`tile sm ${f.element === x ? "on" : ""}`} onClick={() => setF({ ...f, element: x })}><I size={20} /> {x}</button>;
              })}
            </div>
            <label className="df2-l">Kto to zrobi?</label>
            <input value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })} placeholder="Imię albo rola" />
          </div>
          <div className="card-s hyp">
            <h3>Hipoteza</h3>
            <p className="hyp-if">Jeśli <b>{f.what || "…"}</b>, to</p>
            <div className="hyp-metrics">
              {METRICS.map((m) => {
                const I = LEVER_ICON[m.key];
                return <button key={m.key} className={`tile sm ${f.metric === m.key ? "on" : ""}`} onClick={() => { setF({ ...f, metric: m.key }); setTo(null); }}><I size={18} /> {LEVER_NAMES[m.key].short}</button>;
              })}
            </div>
            <div className="hyp-ab">
              <div className="hyp-a"><em>teraz</em><b>{fm(f.metric, A)}</b></div>
              <ArrowRight size={28} />
              <div className="hyp-b"><em>po zmianie</em><MoneyInput big value={to} onChange={setTo} unit={isRate ? "%" : "zł"} ariaLabel="Wartość po zmianie" /></div>
            </div>
            <div className={`hyp-val ${(expected ?? 0) < 0 ? "neg" : ""}`}>
              <em>Wartość oczekiwana</em>
              <b>{expected == null ? "—" : zlSigned(expected)}</b>
              <small>miesięcznie</small>
            </div>
          </div>
        </>
      )}
      <div className="card-s why">
        <h3><Target size={20} /> Dlaczego?</h3>
        <textarea rows={2} value={f.why} onChange={(e) => setF({ ...f, why: e.target.value })} />
      </div>
      <div className="card-s when">
        <h3><CalendarClock size={20} /> Kiedy sprawdzamy wynik?</h3>
        <div className="when-big">
          <b>{new Date(`${f.check}T12:00:00`).toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" })}</b>
          <span>{n > 1 ? `za ${n} dni` : n === 1 ? "jutro" : "dziś"}</span>
        </div>
        <div className="df2-dates">
          {[7, 14, 30].map((d) => <button key={d} className={`tile sm ${f.check === plus(d) ? "on" : ""}`} onClick={() => setF({ ...f, check: plus(d) })}><CalendarDays size={18} /> za {d} dni</button>)}
          <input type="date" value={f.check} min={plus(1)} onChange={(e) => setF({ ...f, check: e.target.value })} aria-label="Data sprawdzenia" />
        </div>
      </div>
      {kind === "zmiana" && (
        <div className="df2-test">
          <Link href={`/projects/${projectId}/testy`} target="_blank" className="tile sm"><FlaskConical size={18} /> Utwórz test reklam</Link>
          {st.adTests.length > 0 && (
            <select value={f.ad} onChange={(e) => setF({ ...f, ad: e.target.value })} aria-label="Podepnij test reklam">
              <option value="">Podepnij istniejący test…</option>
              {st.adTests.map((a) => <option key={a.id} value={a.id}>{a.angle}</option>)}
            </select>
          )}
        </div>
      )}
      {onCancel && <div className="row"><button className="btn" onClick={() => { setForm(undefined); onCancel(); }}>Anuluj edycję</button></div>}
    </div>
  );
}

function StepDecision({ projectId, loopId, st, g, set }: StepProps) {
  const mine = st.decisions.find((d) => d.loop_id === loopId);
  const [editing, setEditing] = useState(false);
  if (!mine || editing) return <DecisionForm projectId={projectId} st={st} g={g} edit={mine} setForm={(v) => set("form", v)} onCancel={mine ? () => setEditing(false) : undefined} />;
  return (
    <DecisionCard d={mine}>
      <div className="row"><button className="btn" onClick={() => setEditing(true)}><Pencil size={15} /> Edytuj</button><CopyBrief d={mine} /></div>
    </DecisionCard>
  );
}

/* ---------- 9. Plan działań ---------- */

function StepCalendar({ loopId, st, reload }: StepProps) {
  const mine = st.decisions.find((d) => d.loop_id === loopId);
  if (!mine) return <p>Brak decyzji – wróć krok wstecz.</p>;
  return (
    <DecisionCard d={mine}>
      {mine.kind === NO_CHANGE ? null : <DecisionTasks d={mine} reload={reload} />}
      <div className="row"><CopyBrief d={mine} /></div>
    </DecisionCard>
  );
}

/* ---------- 10. Sprawdzenie decyzji ---------- */

function StepVerdict({ loopId, st, reload }: StepProps) {
  const t = new Date().toISOString().slice(0, 10);
  const waiting = st.decisions.filter((d) => !d.verdict && d.check_date > t).sort((a, b) => a.check_date.localeCompare(b.check_date));
  const doneHere = st.decisions.filter((d) => d.verdict_loop_id === loopId);
  return (
    <div className="ss-stack">
      {st.due.map((d) => <Verdict key={d.id} d={d} onDone={reload} />)}
      {doneHere.map((d) => (
        <div key={d.id} className="card-s vd-done"><CircleCheck size={18} /> <b>{d.what}</b> <span className={`chip ${d.verdict === "tak" ? "on" : ""}`}>{d.verdict}</span>{d.impact_month != null && <span className={d.impact_month < 0 ? "neg" : "pos"}>{zlSigned(d.impact_month)}/mies.</span>}</div>
      ))}
      {waiting.length > 0 && (
        <div className="card-s">
          <h3 className="ss-h3">Czekają na swój termin</h3>
          <ul className="wt">{waiting.map((d) => <li key={d.id}><Square size={20} className="wt-box" /><b>{d.what}</b>{d.expected_month != null && <span className="pos">{zlSigned(d.expected_month)}/mies.</span>}<Deadline date={d.check_date} /></li>)}</ul>
        </div>
      )}
      {!st.due.length && !doneHere.length && !waiting.length && <div className="card-s"><CircleCheck size={18} /> Nic do sprawdzenia.</div>}
    </div>
  );
}

/* ---------- 11. Raport ---------- */

function StepReport({ loopId, val, set }: StepProps) {
  const [r, setR] = useState<ReportData | null>(null);
  useEffect(() => {
    api<ReportData>(`/api/loops/${loopId}/report`).then(setR).catch(() => {});
  }, [loopId]);
  return (
    <div className="ss-stack">
      <div className="card-s">
        <h3 className="ss-ask">Czego się nauczyłeś w tej sesji?</h3>
        <textarea className="big-ta" rows={2} value={val("summary", "")} onChange={(e) => set("summary", e.target.value)} placeholder="Jedno zdanie" />
      </div>
      {!r ? <p className="ss-load"><Loader2 className="spin" size={18} /> Składam raport…</p> : <ReportView r={{ ...r, summary: val("summary", "") }} />}
    </div>
  );
}

