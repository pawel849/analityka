"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, Check, CircleAlert, CircleCheck, Flag, Lock, Minus, Pause, Plus, Target, Trash2, Trophy, X,
} from "lucide-react";
import { api } from "../forms";
import { Tip } from "../Tip";
import { DECISIONS, ELEMENTS, LEVERS, STEPS } from "@/lib/loop-def";
import type { LoopState, SopTest } from "@/lib/loop";

/* ---------- formatowanie ---------- */
const zl = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${Math.round(v).toLocaleString("pl-PL")} zł`);
const pct = (v: number | null | undefined, dd = 1) => (v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toLocaleString("pl-PL", { maximumFractionDigits: dd })}%`);
const num = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : Math.round(v).toLocaleString("pl-PL"));
const isoToday = () => new Date().toISOString().slice(0, 10);
const plus = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

function Arrow({ now, prev, invert }: { now: number | null | undefined; prev: number | null | undefined; invert?: boolean }) {
  if (now == null || prev == null || !prev) return <span className="lp-arrow"><Minus size={14} /></span>;
  const d = now / Math.abs(prev) - Math.sign(prev);
  const flat = Math.abs(now - prev) / Math.abs(prev) < 0.01;
  const up = now > prev;
  const good = invert ? !up : up;
  const I = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
  return <span className={`lp-arrow ${flat ? "" : good ? "up" : "down"}`} title="vs poprzedni okres"><I size={14} />{flat ? "" : pct(Math.abs((now - prev) / Math.abs(prev)), 0)}</span>;
  void d;
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
  levers: { traffic: number | null; conversion: number | null; aov: number | null; spend: number; otherCosts: number; orders: number } | null;
  gaps: string[];
}

/** Stały pasek celu: profit vs cel, tempo, luka, prognoza „duch”. */
export function GoalBar({ g }: { g: Gap | null }) {
  if (!g) return <div className="gb gb-empty"><Target size={16} /> Brak celu profitu – ustawisz go w kroku 1.</div>;
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

  if (err) return <p className="error">{err}</p>;
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
  const props: StepProps = { projectId, st, g, val, set, reload: load, loopId: loop.id };

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
                <button disabled={!open} onClick={() => open && go(i)} title={open ? s.title : "Najpierw zakończ wcześniejsze kroki"}>
                  <span>{done ? <Check size={11} /> : open ? i + 1 : <Lock size={10} />}</span>
                  {s.title}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
      <GoalBar g={g} />
      <section className="lp-step">
        <div className="lp-step-head">
          <span className="lp-n">Krok {step + 1}</span>
          <h1>{S.question}</h1>
        </div>
        {S.key === "cel" && <StepGoal {...props} />}
        {S.key === "rzeczywistosc" && <StepReality {...props} />}
        {S.key === "luka" && <StepGap {...props} />}
        {S.key === "lejek" && <StepFunnel {...props} />}
        {S.key === "test" && <StepTest {...props} />}
        {S.key === "kalendarz" && <StepSchedule {...props} />}
        {S.key === "checklista" && <StepChecklist {...props} />}
        {S.key === "rozstrzygniecie" && <StepDecide {...props} />}
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
          {step === STEPS.length - 1 ? <><CircleCheck size={16} /> Zakończ pętlę i wróć do celu</> : <>Zapisz i dalej: {STEPS[step + 1].title} <ArrowRight size={16} /></>}
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
}

/* ---------- Krok 1: Cel (+ rozliczenie poprzedniej pętli) ---------- */

function periodRange(p: string): [string, string] {
  const n = new Date();
  const y = n.getFullYear(), m = n.getMonth();
  const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (p === "kwartał") { const q0 = Math.floor(m / 3) * 3; return [f(new Date(y, q0, 1)), f(new Date(y, q0 + 3, 0))]; }
  if (p === "rok") return [`${y}-01-01`, `${y}-12-31`];
  return [f(new Date(y, m, 1)), f(new Date(y, m + 1, 0))];
}

function StepGoal({ projectId, loopId, st, g, val, reload }: StepProps) {
  const [edit, setEdit] = useState(!st.goal);
  const [period, setPeriod] = useState("miesiąc");
  const [[from, to], setRange] = useState(periodRange("miesiąc"));
  const [target, setTarget] = useState("");
  const [who, setWho] = useState("");
  const [diag, setDiag] = useState({ sales: "", cpa: "", roas: "" });
  const [err, setErr] = useState("");
  const ratings = val<Record<string, { effect?: string; carry?: boolean }>>("ratings", {});
  const saveGoal = async () => {
    setErr("");
    try {
      const d: Record<string, number> = {};
      for (const [k, v] of Object.entries(diag)) if (v.trim()) d[k] = Number(v.replace(",", "."));
      await api(`/api/projects/${projectId}/goals`, "POST", { period, date_from: from, date_to: to, profit_target: Number(target.replace(/\s/g, "").replace(",", ".")), diag: d, approved_by: who });
      setEdit(false);
      await reload();
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  const rate = async (taskId: string, effect: string, carry = false) => {
    await api(`/api/loops/${loopId}/rate`, "POST", { taskId, effect, carry, due: plus(3) });
    await reload();
  };
  return (
    <div className="lp-body">
      {st.prev && st.prevActions.length > 0 && (
        <div className="lp-card copper">
          <h3><Flag size={16} /> Rozliczenie poprzedniej pętli ({st.prev.finished_at}) <Tip text="Każda decyzja z poprzedniej analizy musi zostać rozliczona: czy ją wykonałeś i czy przyniosła efekt. Bez tego nie przejdziesz dalej." /></h3>
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
            {st.goal.approved_by && <span><em>Zatwierdził</em><b>{st.goal.approved_by}</b></span>}
          </div>
          <div className="lp-gapnote"><CircleAlert size={14} /> Maks. CPA: brak marży produktu w ustawieniach – luka.</div>
          <button className="btn small" onClick={() => setEdit(true)}>Zmień cel</button>
        </div>
      ) : (
        <div className="lp-card">
          <label className="lp-l">Okres celu</label>
          <div className="seg">
            {["miesiąc", "kwartał", "rok"].map((p) => (
              <button key={p} className={period === p ? "on" : ""} onClick={() => { setPeriod(p); setRange(periodRange(p)); }}>{p}</button>
            ))}
          </div>
          <div className="row"><input type="date" value={from} onChange={(e) => setRange([e.target.value, to])} /> – <input type="date" value={to} onChange={(e) => setRange([from, e.target.value])} /></div>
          <label className="lp-l">Cel profitu (zł) <Tip text="Profit = przychód netto − reklamy − koszty zmienne i stałe − podatek (z Ustawień klienta)." /></label>
          <div className="money-input"><input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} /><span>zł</span></div>
          <label className="lp-l">Kto zatwierdził po stronie klienta</label>
          <input value={who} onChange={(e) => setWho(e.target.value)} />
          <details>
            <summary>Cele diagnostyczne (opcjonalnie)</summary>
            <div className="row">
              <label className="lp-mini">Sprzedaż (szt.)<input inputMode="decimal" value={diag.sales} onChange={(e) => setDiag({ ...diag, sales: e.target.value })} /></label>
              <label className="lp-mini">CPA (zł)<input inputMode="decimal" value={diag.cpa} onChange={(e) => setDiag({ ...diag, cpa: e.target.value })} /></label>
              <label className="lp-mini">ROAS<input inputMode="decimal" value={diag.roas} onChange={(e) => setDiag({ ...diag, roas: e.target.value })} /></label>
            </div>
          </details>
          {err && <p className="error">{err}</p>}
          <div className="row"><button className="btn primary" disabled={!target.trim()} onClick={saveGoal}><Check size={15} /> Zapisz cel</button>{st.goal && <button className="btn" onClick={() => setEdit(false)}>Anuluj</button>}</div>
        </div>
      )}
    </div>
  );
}

/* ---------- Krok 2: Rzeczywistość ---------- */

interface Money { from: string; to: string; revenue: number; spend: number; profit: number; orders: number; visitors: number | null; variableCosts: number; fixedCosts: number; tax: number }
interface Reality {
  wide: Money; widePrev: Money; weeks: Money[]; days: Money[]; daily60: Money[];
  events: { day: string; title: string }[];
  sources: { key: string; label: string; state: string; detail: string }[];
  gaps: string[];
  sourceOf: { revenue: string | null; spend: string | null; visitors: string | null };
}

function ProfitLine({ rows, events }: { rows: Money[]; events: { day: string; title: string }[] }) {
  const w = 900, h = 180;
  const vals = rows.map((r) => r.profit);
  const max = Math.max(1, ...vals.map(Math.abs));
  const min = Math.min(0, ...vals);
  const top = Math.max(0, ...vals);
  const span = top - min || 1;
  const x = (i: number) => (i / Math.max(1, rows.length - 1)) * w;
  const y = (v: number) => h - ((v - min) / span) * (h - 10) - 5;
  void max;
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
        <thead><tr><th /><th className="num">Profit</th><th className="num">Przychód</th><th className="num">Reklamy</th><th className="num">Zamówienia</th><th className="num">Ruch</th><th /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.from}>
              <td>{label(r)}</td>
              <td className={`num b ${r.profit < 0 ? "neg" : ""}`}>{zl(r.profit)}</td>
              <td className="num">{zl(r.revenue)}</td>
              <td className="num">{zl(r.spend)}</td>
              <td className="num">{num(r.orders)}</td>
              <td className="num">{r.visitors == null ? <span className="gap-tag">luka</span> : num(r.visitors)}</td>
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
  const prevSnap = (st.prev?.data.rzeczywistosc?.snapshot ?? null) as { date: string; wide: Money } | null;
  if (!r) return <p>Liczę profit z danych…</p>;
  const W = r.wide, P = r.widePrev;
  return (
    <div className="lp-body">
      {r.gaps.length > 0 && (
        <div className="lp-card copper">
          <h3><CircleAlert size={16} /> Luki w danych</h3>
          <ul className="lp-gaps">{r.gaps.map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      )}
      {prevSnap && (
        <div className="lp-card lp-then">
          <span>Poprzednia analiza ({prevSnap.date}): profit 60 dni <b>{zl(prevSnap.wide.profit)}</b></span>
          <ArrowRight size={16} />
          <span>Teraz: <b>{zl(W.profit)}</b> <Arrow now={W.profit} prev={prevSnap.wide.profit} /></span>
        </div>
      )}
      <div className="seg big">
        {([["szeroka", "Szeroka · 60 dni"], ["srednia", "Średnia · tygodnie"], ["waska", "Wąska · dni"]] as const).map(([k, l]) => (
          <button key={k} className={scale === k ? "on" : ""} onClick={() => setScale(k)}>{l}</button>
        ))}
      </div>
      {scale === "szeroka" && (
        <div className="lp-card">
          <div className="lp-kpis">
            <div><em>Profit</em><b className={W.profit < 0 ? "neg" : ""}>{zl(W.profit)}</b><Arrow now={W.profit} prev={P.profit} /></div>
            <div><em>Przychód</em><b>{zl(W.revenue)}</b><Arrow now={W.revenue} prev={P.revenue} /><small>{r.sourceOf.revenue ?? <span className="gap-tag">luka</span>}</small></div>
            <div><em>Koszt reklam</em><b>{zl(W.spend)}</b><Arrow now={W.spend} prev={P.spend} invert /><small>{r.sourceOf.spend ?? <span className="gap-tag">luka</span>}</small></div>
            <div><em>Pozostałe koszty</em><b>{zl(W.variableCosts + W.fixedCosts + W.tax)}</b><small>ustawienia klienta</small></div>
            <div><em>Ruch</em><b>{W.visitors == null ? "—" : num(W.visitors)}</b><Arrow now={W.visitors} prev={P.visitors} /><small>{r.sourceOf.visitors ?? <span className="gap-tag">luka</span>}</small></div>
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
          <p className="lp-stop"><CircleAlert size={16} /> SOP stoi. Najpierw napraw pomiar w <Link href={`/projects/${projectId}/dane`}>Źródłach danych</Link>, potem wróć do tego kroku.</p>
        )}
      </div>
    </div>
  );
}

/* ---------- Krok 3: Luka ---------- */

function StepGap({ g, val, set }: StepProps) {
  const levers = val<string[]>("levers", []);
  if (!g) return <p>Brak celu – wróć do kroku 1.</p>;
  const L = g.levers;
  const values: Record<string, string> = {
    traffic: L?.traffic == null ? "luka" : num(L.traffic),
    conversion: L?.conversion == null ? "luka" : pct(L.conversion, 2),
    aov: zl(L?.aov),
    spend: zl(L?.spend),
    costs: zl(L?.otherCosts),
  };
  return (
    <div className="lp-body">
      <div className="lp-card">
        <div className="lp-kpis">
          <div><em>Tempo potrzebne</em><b>{zl(g.needPerDay)}/dz.</b><small>{zl(g.needPerWeek)}/tydz.</small></div>
          <div><em>Tempo obecne</em><b>{zl(g.pacePerDay)}/dz.</b><small>{g.pacePerDay != null && g.needPerDay ? pct(g.pacePerDay / g.needPerDay - 1, 0) + " vs potrzebne" : ""}</small></div>
          <div><em>Brakuje do celu</em><b className={g.gap > 0 ? "neg" : ""}>{zl(g.gap)}</b><small>{g.target ? pct(g.gap / g.target, 0) + " celu" : ""}</small></div>
          <div><em>Od dziś trzeba</em><b>{zl(g.needFromNow)}/dz.</b><small>{g.left} dni do końca</small></div>
          <div className="gb-ghost"><em>Prognoza (duch)</em><b>{zl(g.forecast)}</b><small>jeśli tempo się utrzyma</small></div>
        </div>
      </div>
      <div className="lp-card">
        <h3>Profit = Ruch × Konwersja × Wartość zamówienia − Koszty <Tip text="Wartości z okresu celu do dziś, z prawdziwych danych. Ruch = wejścia na stronę (skrypt). Zaznacz dźwignie, które realnie ruszysz." /></h3>
        <div className="lever-grid">
          {LEVERS.map((l) => {
            const on = levers.includes(l.key);
            return (
              <button key={l.key} className={`lever ${on ? "on" : ""}`} onClick={() => set("levers", on ? levers.filter((x) => x !== l.key) : [...levers, l.key])}>
                <span className="lever-dir">{l.dir === "w górę" ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />} {l.dir}</span>
                <b>{l.label}</b>
                <span className={values[l.key] === "luka" ? "gap-tag" : "lever-v"}>{values[l.key]}</span>
                {on && <CircleCheck size={18} className="lever-ok" />}
              </button>
            );
          })}
        </div>
        <label className="lp-l">Gdzie idziemy w górę, gdzie w dół – i dlaczego?</label>
        <textarea rows={3} value={val("why", "")} onChange={(e) => set("why", e.target.value)} />
      </div>
    </div>
  );
}

/* ---------- Krok 4: Lejek ---------- */

interface Stages { from: string; to: string; spend: number; stages: { id: string; label: string; people: number | null; toNext: number | null; nextLabel: string | null; costPerPerson: number | null; change: number | null; gap: boolean }[] }

function StepFunnel({ projectId, st, val, set }: StepProps) {
  const funnelId = val<string>("funnelId", st.funnels[0]?.id ?? "");
  const stage = val<string>("stage", "");
  const [d, setD] = useState<Stages | null>(null);
  useEffect(() => {
    if (!funnelId) return;
    setD(null);
    api<Stages>(`/api/funnels/${funnelId}/stages`).then(setD).catch(() => {});
    if (!val("funnelId", "")) set("funnelId", funnelId);
  }, [funnelId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!st.funnels.length) return <p className="lp-stop"><CircleAlert size={16} /> Brak mapy lejka. Etapy lejka ustawiasz w <Link href={`/projects/${projectId}/lejki`}>Mapach lejków</Link> (konfiguracja).</p>;
  return (
    <div className="lp-body">
      {st.funnels.length > 1 && (
        <div className="seg">{st.funnels.map((f) => <button key={f.id} className={f.id === funnelId ? "on" : ""} onClick={() => { set("funnelId", f.id); set("stage", ""); }}>{f.name}</button>)}</div>
      )}
      <div className="lp-card">
        {!d ? <p>Liczę etapy…</p> : (
          <>
            <p className="lp-sub">Ostatnie 30 dni ({d.from} – {d.to}) vs poprzednie 30 · koszt reklam w lejku {zl(d.spend)}</p>
            {!d.stages.length && <p className="lp-stop"><CircleAlert size={16} /> Ta mapa nie ma etapów. Ułóż etapy w <Link href={`/funnels/${funnelId}`}>edytorze mapy</Link> albo wybierz inną mapę.</p>}
            <div className="stage-list">
              {d.stages.map((s, i) => (
                <button key={s.id} className={`stage ${stage === s.label ? "on" : ""} ${s.gap ? "gap" : ""}`} onClick={() => set("stage", s.label)}>
                  <span className="stage-n">{i + 1}</span>
                  <b>{s.label}</b>
                  <span className="stage-v">{s.gap ? <span className="gap-tag">luka pomiarowa</span> : <>{num(s.people)} os.</>}</span>
                  <span className="stage-c" title={s.nextLabel ? `przejście do: ${s.nextLabel}` : ""}>{s.toNext == null ? "" : <>→ {pct(s.toNext, 1)}</>}</span>
                  <span className="stage-k">{s.costPerPerson == null ? "" : `${zl(s.costPerPerson)}/os.`}</span>
                  <span>{s.change == null ? "" : <Arrow now={1 + s.change} prev={1} />}</span>
                  {stage === s.label && <span className="stage-flag"><Flag size={14} /> wąskie gardło</span>}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div className="lp-card">
        <label className="lp-l">Dlaczego ten etap?</label>
        <textarea rows={2} value={val("note", "")} onChange={(e) => set("note", e.target.value)} />
      </div>
    </div>
  );
}

/* ---------- Krok 5: Test ---------- */

function TestCardForm({ projectId, loopId, stage, adTests, onDone }: { projectId: string; loopId: string; stage: string; adTests: { id: string; angle: string }[]; onDone: () => void }) {
  const [f, setF] = useState({ hypothesis: "", element: "reklama", stage, metric: "", gain: "", budget: "", hours: "", ad: "" });
  const [vars, setVars] = useState(["", ""]);
  const [err, setErr] = useState("");
  const save = async () => {
    setErr("");
    try {
      const n = (x: string) => (x.trim() ? Number(x.replace(",", ".")) : null);
      await api(`/api/projects/${projectId}/sop-tests`, "POST", {
        loopId, hypothesis: f.hypothesis, element: f.element, stage: f.stage, metric: f.metric, gain_estimate: n(f.gain), cost_budget: n(f.budget), cost_hours: n(f.hours),
        ad_test_id: f.element === "reklama" ? f.ad || null : null,
        variants: vars.map((desc, i) => ({ letter: String.fromCharCode(65 + i), desc })),
      });
      onDone();
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  return (
    <div className="lp-card tc-form">
      <label className="lp-l">Hipoteza</label>
      <textarea rows={2} value={f.hypothesis} onChange={(e) => setF({ ...f, hypothesis: e.target.value })} />
      <label className="lp-l">Element testowany</label>
      <div className="seg">{ELEMENTS.map((x) => <button key={x} className={f.element === x ? "on" : ""} onClick={() => setF({ ...f, element: x })}>{x}</button>)}</div>
      {f.element === "reklama" && adTests.length > 0 && (
        <label className="lp-mini">Wyniki z testu reklam <Tip text="Podpięty test z modułu Testy reklam dostarczy koszt i przychód wariantów (po utm_content)." />
          <select value={f.ad} onChange={(e) => setF({ ...f, ad: e.target.value })}><option value="">— nie podpinaj —</option>{adTests.map((a) => <option key={a.id} value={a.id}>{a.angle}</option>)}</select>
        </label>
      )}
      <div className="row">
        <label className="lp-mini">Etap lejka<input value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })} /></label>
        <label className="lp-mini">Metryka sukcesu etapu<input value={f.metric} onChange={(e) => setF({ ...f, metric: e.target.value })} /></label>
      </div>
      <div className="row">
        <label className="lp-mini">Spodziewany przyrost profitu (Twoja ocena, zł)<input inputMode="decimal" value={f.gain} onChange={(e) => setF({ ...f, gain: e.target.value })} /></label>
        <label className="lp-mini">Koszt testu: budżet (zł)<input inputMode="decimal" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} /></label>
        <label className="lp-mini">Czas pracy (h)<input inputMode="decimal" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /></label>
      </div>
      <label className="lp-l">Warianty</label>
      {vars.map((v, i) => (
        <div key={i} className="tc-var">
          <span className="v-letter">{String.fromCharCode(65 + i)}</span>
          <input value={v} onChange={(e) => setVars(vars.map((x, k) => (k === i ? e.target.value : x)))} placeholder={i === 0 ? "kontrola (obecna wersja)" : ""} />
          {i > 1 && <button className="icon-btn danger" onClick={() => setVars(vars.filter((_, k) => k !== i))} aria-label="Usuń wariant"><Trash2 size={14} /></button>}
        </div>
      ))}
      <button className="btn small" onClick={() => setVars([...vars, ""])}><Plus size={14} /> wariant</button>
      {err && <p className="error">{err}</p>}
      <div className="row"><button className="btn primary" onClick={save}><Check size={15} /> Zapisz kartę testu</button></div>
    </div>
  );
}

function TestCard({ t, collision, children }: { t: SopTest; collision?: string[]; children?: React.ReactNode }) {
  const prio = t.gain_estimate != null && t.cost_budget ? t.gain_estimate / t.cost_budget : null;
  return (
    <div className="tc">
      <div className="tc-head">
        <span className={`tc-phase ph-${t.phase.replace(/ /g, "-")}`}>{t.phase}</span>
        <b>{t.hypothesis}</b>
        {prio != null && <span className="tc-prio" title="Twoja ocena przyrostu ÷ budżet testu">ROI {prio.toLocaleString("pl-PL", { maximumFractionDigits: 1 })}×</span>}
      </div>
      <div className="tt-chips">
        <span>{t.element}</span>
        {t.stage && <span><Flag size={13} /> {t.stage}</span>}
        {t.metric && <span>{t.metric}</span>}
        {t.start_date && <span>{t.start_date} → {t.end_date}</span>}
        <span>{t.variants.map((v) => v.letter).join(" / ")}</span>
      </div>
      {collision && collision.length > 0 && <div className="lp-warn"><CircleAlert size={14} /> Kolizja: ten sam etap w tym samym czasie co „{collision.join("”, „")}” – wyniki się wymieszają.</div>}
      {children}
    </div>
  );
}

function StepTest({ projectId, loopId, st, val, set, reload }: StepProps) {
  const stage = (st.active?.data.lejek?.stage as string) ?? "";
  const mine = st.tests.filter((t) => t.loop_id === loopId);
  const [form, setForm] = useState(!mine.length);
  const sorted = [...mine].sort((a, b) => (b.gain_estimate ?? 0) / (b.cost_budget || 1) - (a.gain_estimate ?? 0) / (a.cost_budget || 1));
  const past = st.learnings.filter((l) => !stage || l.stage === stage);
  return (
    <div className="lp-body">
      {past.length > 0 && (
        <div className="lp-card copper">
          <h3>Wnioski z poprzednich testów{stage ? ` na etapie „${stage}”` : ""}</h3>
          <ul className="lp-gaps">{past.slice(0, 8).map((l) => <li key={l.id}>{l.text}{l.profit_delta != null && <b> ({zl(l.profit_delta)})</b>}</li>)}</ul>
        </div>
      )}
      {sorted.map((t) => (
        <TestCard key={t.id} t={t}>
          <button className="icon-btn danger" title="Usuń kartę" onClick={async () => { if (confirm("Usunąć kartę testu?")) { await api(`/api/sop-tests/${t.id}`, "DELETE"); reload(); } }}><Trash2 size={14} /></button>
        </TestCard>
      ))}
      {form ? (
        <TestCardForm projectId={projectId} loopId={loopId} stage={stage} adTests={st.adTests} onDone={() => { setForm(false); reload(); }} />
      ) : (
        <button className="btn" onClick={() => setForm(true)}><Plus size={15} /> Kolejny pomysł na test</button>
      )}
      {!mine.length && (
        <div className="lp-card">
          <label className="lp-l">Albo: dlaczego w tej pętli nie planujesz nowego testu?</label>
          <textarea rows={2} value={val("skip", "")} onChange={(e) => set("skip", e.target.value)} />
        </div>
      )}
    </div>
  );
}

/* ---------- Krok 6: Kalendarz testu ---------- */

function StepSchedule({ loopId, st, reload }: StepProps) {
  const mine = st.tests.filter((t) => t.loop_id === loopId);
  if (!mine.length) return <p>W tej pętli nie ma nowego testu – przejdź dalej.</p>;
  return (
    <div className="lp-body">
      {mine.map((t) => <ScheduleForm key={t.id} t={t} collision={st.collisions[t.id]} reload={reload} />)}
    </div>
  );
}

function ScheduleForm({ t, collision, reload }: { t: SopTest; collision?: string[]; reload: () => Promise<void> }) {
  const [f, setF] = useState({ start: t.start_date ?? plus(1), end: t.end_date ?? plus(8), budget: t.budget != null ? String(t.budget) : t.cost_budget != null ? String(t.cost_budget) : "", cond: t.end_condition || "Termin minął + porównanie: ile wydaliśmy, a ile zarobiło (koszt pozyskania)" });
  const [ok, setOk] = useState(false);
  const save = async () => {
    await api(`/api/sop-tests/${t.id}`, "PATCH", { start_date: f.start, end_date: f.end, budget: f.budget ? Number(f.budget.replace(",", ".")) : null, end_condition: f.cond });
    setOk(true);
    await reload();
  };
  return (
    <TestCard t={t} collision={collision}>
      <div className="row">
        <label className="lp-mini">Start<input type="date" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
        <label className="lp-mini">Koniec<input type="date" value={f.end} min={f.start} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
        <label className="lp-mini">Budżet testu (zł)<input inputMode="decimal" value={f.budget} onChange={(e) => setF({ ...f, budget: e.target.value })} /></label>
      </div>
      <label className="lp-mini">Warunek zakończenia<input value={f.cond} onChange={(e) => setF({ ...f, cond: e.target.value })} /></label>
      <div className="row"><button className="btn primary" onClick={save}><Check size={15} /> Zapisz i wstaw do kalendarza</button>{ok && <span className="saved"><CircleCheck size={15} /> w kalendarzu i na osi czasu</span>}</div>
    </TestCard>
  );
}

/* ---------- Krok 7: Checklista ---------- */

function StepChecklist({ loopId, st, reload }: StepProps) {
  const mine = st.tests.filter((t) => t.loop_id === loopId);
  if (!mine.length) return <p>W tej pętli nie ma nowego testu – przejdź dalej.</p>;
  return <div className="lp-body">{mine.map((t) => <Checklist key={t.id} t={t} reload={reload} />)}</div>;
}

function Checklist({ t, reload }: { t: SopTest; reload: () => Promise<void> }) {
  const [f, setF] = useState({ title: "", who: "Paweł", due: t.start_date ?? plus(1) });
  const add = async () => {
    if (!f.title.trim()) return;
    await api(`/api/sop-tests/${t.id}/checklist`, "POST", f);
    setF({ ...f, title: "" });
    await reload();
  };
  const all = t.checklist.length > 0 && t.checklist.every((c) => c.done);
  return (
    <TestCard t={t}>
      <ul className="ck">
        {t.checklist.map((c) => (
          <li key={c.id} className={`${c.done ? "done" : ""} ${c.required ? "req" : ""}`}>
            <input type="checkbox" checked={c.done} onChange={async () => { await api(`/api/tasks/${c.id}`, "PATCH", { done: !c.done }); await reload(); }} />
            <span>{c.title}</span>
            <em>{c.who ?? ""} · {c.due}</em>
          </li>
        ))}
      </ul>
      <div className="ck-add">
        <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Zadanie" aria-label="Zadanie" />
        <select value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })}>{["Paweł", "copywriter", "klient"].map((x) => <option key={x}>{x}</option>)}</select>
        <input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} />
        <button className="btn" onClick={add} disabled={!f.title.trim()} aria-label="Dodaj"><Plus size={15} /></button>
      </div>
      <p className={`ck-state ${all ? "ok" : ""}`}>{all ? <><CircleCheck size={15} /> Wszystko odhaczone – test przejdzie w „W trakcie” w dniu startu.</> : <><Lock size={14} /> Test nie wystartuje, dopóki wszystkie punkty (z pomiarem) nie są odhaczone.</>}</p>
    </TestCard>
  );
}

/* ---------- Krok 8: Rozstrzygnięcie ---------- */

interface VRes { letter: string; desc: string; spend: number | null; revenue: number | null; profit: number | null; source: string | null }

function StepDecide({ loopId, st, reload }: StepProps) {
  const dueIds = new Set(st.due.map((t) => t.id));
  const running = st.tests.filter((t) => t.phase !== "zamknięty" && !dueIds.has(t.id));
  const decidedHere = st.tests.filter((t) => t.result.loop_id === loopId && t.result.decision);
  return (
    <div className="lp-body">
      {decidedHere.map((t) => (
        <div key={t.id} className="lp-card"><span className="saved"><CircleCheck size={15} /> {t.hypothesis} – {t.result.decision}{t.result.winner ? `: wariant ${t.result.winner}` : ""}{t.result.decision === "przedłużyć" ? ` do ${t.end_date}` : ""}</span></div>
      ))}
      {!st.due.length && !decidedHere.length && <div className="lp-card"><CircleCheck size={16} /> Żaden test nie spełnił jeszcze warunku zakończenia – nie ma czego rozstrzygać.</div>}
      {st.due.map((t) => <Decide key={t.id} t={t} loopId={loopId} reload={reload} />)}
      {running.length > 0 && (
        <div className="lp-card">
          <h3>W toku – za mało danych</h3>
          <ul className="lp-gaps">{running.map((t) => <li key={t.id}>{t.hypothesis} – {t.phase}{t.end_date ? `, koniec ${t.end_date}` : ""}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function Decide({ t, loopId, reload }: { t: SopTest; loopId: string; reload: () => Promise<void> }) {
  const [res, setRes] = useState<VRes[] | null>(null);
  const [manual, setManual] = useState<Record<string, { spend: string; revenue: string }>>({});
  const [ext, setExt] = useState(plus(7));
  const [err, setErr] = useState("");
  const load = useCallback(() => api<VRes[]>(`/api/sop-tests/${t.id}/results`).then(setRes), [t.id]);
  useEffect(() => {
    load();
  }, [load]);
  const best = res?.filter((v) => v.profit != null).sort((a, b) => b.profit! - a.profit!)[0];
  const decide = async (decision: string, winner?: string) => {
    setErr("");
    try {
      await api(`/api/sop-tests/${t.id}`, "PATCH", decision === "przedłużyć" ? { decision, end_date: ext, loop_id_decided: loopId } : { decision, winner, loop_id_decided: loopId });
      await reload();
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  const saveManual = async () => {
    const variants = t.variants.map((v) => {
      const m = manual[v.letter];
      return m ? { ...v, spend: m.spend ? Number(m.spend.replace(",", ".")) : null, revenue: m.revenue ? Number(m.revenue.replace(",", ".")) : null, manual: true } : v;
    });
    await api(`/api/sop-tests/${t.id}`, "PATCH", { variants });
    await load();
  };
  return (
    <TestCard t={t}>
      {!res ? <p>Liczę…</p> : (
        <div className="ad-grid">
          {res.map((v) => (
            <div key={v.letter} className={`ad-card ${best && best.letter === v.letter ? "win" : "run"}`}>
              <div className="dec-head"><span className="ad-letter big">{v.letter}</span>{best?.letter === v.letter && <span className="chip on"><Trophy size={13} /> najwyższy profit</span>}</div>
              <p className="dec-desc">{v.desc}</p>
              <div className="ad-stats">
                <div><span>Koszt</span><b>{zl(v.spend)}</b></div>
                <div><span>Przychód</span><b>{zl(v.revenue)}</b></div>
                <div><span>Profit</span><b className={v.profit != null && v.profit < 0 ? "neg" : ""}>{zl(v.profit)}</b></div>
                <div><span>Źródło</span><b className="small">{v.source ?? <span className="gap-tag">luka</span>}</b></div>
              </div>
              {v.source !== "Testy reklam (UTM)" && (
                <div className="row">
                  <input placeholder="koszt" inputMode="decimal" value={manual[v.letter]?.spend ?? ""} onChange={(e) => setManual({ ...manual, [v.letter]: { ...(manual[v.letter] ?? { revenue: "" }), spend: e.target.value } })} />
                  <input placeholder="przychód" inputMode="decimal" value={manual[v.letter]?.revenue ?? ""} onChange={(e) => setManual({ ...manual, [v.letter]: { ...(manual[v.letter] ?? { spend: "" }), revenue: e.target.value } })} />
                </div>
              )}
              <button className="btn small primary" onClick={() => decide("wygrany", v.letter)}><Trophy size={14} /> Wygrany</button>
            </div>
          ))}
        </div>
      )}
      {Object.keys(manual).length > 0 && <button className="btn small" onClick={saveManual}>Zapisz wpisane wyniki</button>}
      <div className="row dec-other">
        <button className="btn" onClick={() => decide(DECISIONS[1])}>Nierozstrzygnięty</button>
        <span className="row">Przedłużyć do <input type="date" value={ext} onChange={(e) => setExt(e.target.value)} /> <button className="btn" onClick={() => decide("przedłużyć")}>Przedłuż</button></span>
      </div>
      {t.result.decision && <p className="saved"><CircleCheck size={15} /> Decyzja: {t.result.decision}{t.result.winner ? ` (${t.result.winner})` : ""}</p>}
      {err && <p className="error">{err}</p>}
    </TestCard>
  );
}

/* ---------- Krok 9: Wnioski ---------- */

function StepLearn({ loopId, st, g, val, set, reload }: StepProps) {
  const decided = st.tests.filter((t) => t.result.loop_id === loopId && t.result.decision && t.result.decision !== "przedłużyć");
  const [act, setAct] = useState({ title: "", due: plus(3) });
  const [filter, setFilter] = useState("");
  const addAct = async () => {
    if (!act.title.trim()) return;
    await api(`/api/loops/${loopId}/actions`, "POST", { title: act.title, due: act.due, level: "wnioski" });
    setAct({ ...act, title: "" });
    await reload();
  };
  const snap = (st.active?.data.rzeczywistosc?.snapshot ?? null) as { wide: { profit: number } } | null;
  const reg = st.learnings.filter((l) => !filter || `${l.stage} ${l.element} ${l.text}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <div className="lp-body">
      {decided.map((t) => <LearningForm key={t.id} t={t} loopId={loopId} done={st.learnings.some((l) => l.test_id === t.id)} reload={reload} />)}
      <div className="lp-card">
        <h3><Target size={16} /> Cel przed i po</h3>
        <div className="lp-kpis">
          <div><em>Profit 60 dni w dniu analizy</em><b>{zl(snap?.wide.profit)}</b></div>
          <div><em>Profit w okresie celu</em><b>{zl(g?.achieved)}</b><small>z {zl(g?.target)}</small></div>
          <div><em>Luka</em><b className={(g?.gap ?? 0) > 0 ? "neg" : ""}>{zl(g?.gap)}</b></div>
        </div>
        <label className="lp-l">Czy cel się ruszył i co robisz do następnej analizy?</label>
        <textarea rows={3} value={val("summary", "")} onChange={(e) => set("summary", e.target.value)} />
      </div>
      <div className="lp-card">
        <h3><Flag size={16} /> Działania (trafią do kalendarza i do rozliczenia w następnej pętli)</h3>
        <ul className="ck">{st.actions.map((a) => <li key={a.id} className={a.done ? "done" : ""}><CircleCheck size={15} /><span>{a.title}</span><em>do {a.due}</em></li>)}</ul>
        <div className="ck-add">
          <input value={act.title} onChange={(e) => setAct({ ...act, title: e.target.value })} aria-label="Działanie" />
          <input type="date" value={act.due} onChange={(e) => setAct({ ...act, due: e.target.value })} />
          <button className="btn" onClick={addAct} disabled={!act.title.trim()} aria-label="Dodaj"><Plus size={15} /></button>
        </div>
      </div>
      <div className="lp-card">
        <h3>Rejestr wniosków</h3>
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Szukaj po etapie, elemencie…" aria-label="Szukaj" />
        <ul className="lp-gaps">{reg.slice(0, 30).map((l) => <li key={l.id}><span className="tt-chips"><span>{l.stage || "—"}</span><span>{l.element || "—"}</span></span> {l.text} <small>{l.created_at}</small></li>)}</ul>
        {!reg.length && <p>Brak wniosków.</p>}
      </div>
    </div>
  );
}

function LearningForm({ t, loopId, done, reload }: { t: SopTest; loopId: string; done: boolean; reload: () => Promise<void> }) {
  const [res, setRes] = useState<VRes[] | null>(null);
  const [text, setText] = useState("");
  useEffect(() => {
    api<VRes[]>(`/api/sop-tests/${t.id}/results`).then((r) => {
      setRes(r);
      const w = r.find((v) => v.letter === t.result.winner);
      const a = r.find((v) => v.letter === "A");
      const delta = w && a && w.profit != null && a.profit != null ? w.profit - a.profit : null;
      setText(`Na etapie ${t.stage || "?"}, zmiana „${w?.desc ?? "?"}” dała ${delta == null ? "? zł (brak danych)" : `${delta >= 0 ? "+" : "−"}${Math.abs(Math.round(delta))} zł`} profitu.`);
    });
  }, [t]);
  const w = res?.find((v) => v.letter === t.result.winner);
  const a = res?.find((v) => v.letter === "A");
  const delta = w && a && w.profit != null && a.profit != null ? w.profit - a.profit : null;
  return (
    <TestCard t={t}>
      {done ? <p className="saved"><CircleCheck size={15} /> Wniosek zapisany w rejestrze.</p> : (
        <>
          <label className="lp-l">Wniosek: „Na etapie X, zmiana Y dała Z zł profitu”</label>
          <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} />
          <button className="btn primary" onClick={async () => { await api(`/api/loops/${loopId}/learnings`, "POST", { test_id: t.id, stage: t.stage, element: t.element, text, profit_delta: delta }); await reload(); }}><Check size={15} /> Zapisz wniosek</button>
        </>
      )}
    </TestCard>
  );
}
