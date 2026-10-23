"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CalendarClock, Check, CircleAlert, Copy, CopyCheck, Trash2, Trophy, User, X } from "lucide-react";
import { api } from "../forms";
import { catByKey, isCat, LEVER_NAMES, NO_CHANGE, VERDICTS } from "@/lib/loop-def";
import type { Decision } from "@/lib/loop";
import { daysTo, fm, plus, range, zl, zlSigned } from "./ui";

export { fm, plus, range, zl, zlSigned };

export function briefOf(d: Decision): string {
  const lines = d.kind === NO_CHANGE
    ? ["Decyzja: nic nie zmieniam", `Dlaczego: ${d.why}`, `Sprawdzenie: ${d.check_date}`]
    : [`Co: ${d.what}`, `Kto: ${d.who}`, `Dlaczego: ${d.why}`, `Hipoteza: ${d.hypothesis}`, `Wartość oczekiwana: ${d.expected_month == null ? "brak danych" : `${zlSigned(d.expected_month)}/mies.`}`, `Data sprawdzenia: ${d.check_date}`];
  if (d.checklist.length) lines.push("", "Do zrobienia:", ...d.checklist.map((c) => `- ${c.title} – ${c.due}${c.who ? ` (${c.who})` : ""}`));
  return lines.join("\n");
}

export function CopyBrief({ d }: { d: Decision }) {
  const [ok, setOk] = useState(false);
  return (
    <button className="btn" onClick={async () => { await navigator.clipboard.writeText(briefOf(d)).catch(() => {}); setOk(true); setTimeout(() => setOk(false), 1600); }}>
      {ok ? <><CopyCheck size={15} /> Skopiowano</> : <><Copy size={15} /> Kopiuj brief</>}
    </button>
  );
}

/** Termin jako plakietka: „za 14 dni · 2 lis”. */
export function Deadline({ date, done }: { date: string; done?: boolean }) {
  const n = daysTo(date);
  const txt = done ? "rozstrzygnięta" : n > 1 ? `za ${n} dni` : n === 1 ? "jutro" : n === 0 ? "dziś" : `${-n} dni po terminie`;
  return (
    <span className={`dl ${done ? "done" : n <= 0 ? "due" : ""}`}>
      <CalendarClock size={14} /> {txt} · {new Date(`${date}T12:00:00`).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}
    </span>
  );
}

/** Termin sprawdzenia jako wyraźny baner. */
export function BigDeadline({ date, done }: { date: string; done?: boolean }) {
  const n = daysTo(date);
  const when = done ? "rozstrzygnięta" : n > 1 ? `za ${n} dni` : n === 1 ? "jutro" : n === 0 ? "dziś" : `${-n} dni po terminie`;
  return (
    <div className={`bdl ${done ? "done" : n <= 0 ? "due" : ""}`}>
      <CalendarClock size={26} />
      <div><em>Sprawdzamy wynik</em><b>{new Date(`${date}T12:00:00`).toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</b></div>
      <span>{when}</span>
    </div>
  );
}

/** Hipoteza jako centrum: A → B. */
export function HypothesisLine({ d }: { d: Decision }) {
  if (!d.metric) return null;
  if (isCat(d.metric)) return <div className="hl"><span className="hl-m">{catByKey(d.metric)!.name} <small>cała kategoria → najlepszy okres</small></span></div>;
  const L = LEVER_NAMES[d.metric];
  return (
    <div className="hl">
      <span className="hl-m">{L.name} <small>{L.short}</small></span>
      <span className="hl-a">{fm(d.metric, d.from_value)}</span>
      <ArrowRight size={20} />
      <span className="hl-b">{fm(d.metric, d.to_value)}</span>
    </div>
  );
}

/** Karta decyzji: termin na górze, wartość w zł jako „dlaczego”, hipoteza w środku. */
export function DecisionCard({ d, onDelete, children }: { d: Decision; onDelete?: () => void; children?: React.ReactNode }) {
  return (
    <div className="dc">
      <div className="dc-top">
        <h3 className="dc-what">{d.kind === NO_CHANGE ? "Nic nie zmieniam" : d.what}</h3>
        {onDelete && <button className="icon-btn danger" title="Usuń decyzję" aria-label="Usuń decyzję" onClick={onDelete}><Trash2 size={15} /></button>}
      </div>
      <BigDeadline date={d.check_date} done={!!d.verdict} />
      {d.kind !== NO_CHANGE && (
        <div className="dc-hero">
          <div className="dc-val"><em>Stawka</em><b>{zlSigned(d.expected_month)}</b><small>miesięcznie</small></div>
          <HypothesisLine d={d} />
        </div>
      )}
      <div className="dc-meta">
        {d.who && <span><User size={14} /> {d.who}</span>}
        {d.element && <span>{d.element}</span>}
      </div>
      <div className="dc-why"><em>Dlaczego taka decyzja</em><p>{d.why}</p></div>
      {children}
    </div>
  );
}

/** Lista zadań decyzji – Enter dodaje. */
export function DecisionTasks({ d, reload }: { d: Decision; reload: () => Promise<void> | void }) {
  const [f, setF] = useState({ title: "", who: d.who, due: plus(1) });
  const add = async () => {
    if (!f.title.trim()) return;
    await api(`/api/decisions/${d.id}/tasks`, "POST", f);
    setF({ ...f, title: "" });
    await reload();
  };
  return (
    <div className="tk">
      <h4>Co zrobić</h4>
      <ul className="tk-list">
        {d.checklist.map((c) => (
          <li key={c.id} className={`${c.done ? "done" : ""} ${c.required ? "req" : ""}`}>
            <button className="tk-box" aria-label={c.done ? "Odznacz" : "Zrobione"} onClick={async () => { await api(`/api/tasks/${c.id}`, "PATCH", { done: !c.done }); await reload(); }}>{c.done && <Check size={14} />}</button>
            <span>{c.title}</span>
            <em>{c.who ? `${c.who} · ` : ""}{new Date(`${c.due}T12:00:00`).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}</em>
          </li>
        ))}
      </ul>
      <div className="tk-add">
        <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} placeholder="Wpisz zadanie i naciśnij Enter" aria-label="Zadanie" />
        <input value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") add(); }} placeholder="Kto" aria-label="Kto" />
        <input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} aria-label="Termin" />
      </div>
    </div>
  );
}

interface Result {
  decision: Decision;
  from: string;
  to: string;
  actual: number | null;
  impact: number | null;
  range: [number, number] | null;
  lowConfidence: boolean;
  profit: number | null;
  profitBefore: number | null;
  suggestion: string | null;
}

/** Sprawdzenie decyzji: hipoteza vs wynik, wpływ w zł, wniosek jednym zdaniem. */
export function Verdict({ d, onDone }: { d: Decision; onDone: () => Promise<void> | void }) {
  const [r, setR] = useState<Result | null>(null);
  const [v, setV] = useState<string>("");
  const [learning, setLearning] = useState("");
  const [err, setErr] = useState("");
  const load = useCallback(() => api<Result>(`/api/decisions/${d.id}`).then((x) => { setR(x); setV((cur) => cur || x.suggestion || ""); }), [d.id]);
  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [load]);
  const save = async () => {
    setErr("");
    try {
      await api(`/api/decisions/${d.id}/verdict`, "POST", { verdict: v, learning });
      await onDone();
    } catch (x) {
      setErr((x as Error).message);
    }
  };
  const L = d.metric && !isCat(d.metric) ? LEVER_NAMES[d.metric] : null;
  const C = isCat(d.metric) ? catByKey(d.metric!)! : null;
  const span = r && d.from_value != null && d.to_value != null && r.actual != null ? [d.from_value, d.to_value, r.actual] : null;
  const lo = span ? Math.min(...span) : 0;
  const hi = span ? Math.max(...span) : 1;
  const pos = (val: number) => `${((val - lo) / (hi - lo || 1)) * 100}%`;
  return (
    <div className="dc">
      <div className="dc-top"><Deadline date={d.check_date} /></div>
      <h3 className="dc-what">{d.kind === NO_CHANGE ? "Nic nie zmieniam" : d.what}</h3>
      {!r ? <p>Liczę wynik…</p> : (
        <div className="vr">
          {L && span ? (
            <div className="vr-scale">
              <div className="vr-track">
                <i className="vr-mark a" style={{ left: pos(d.from_value!) }}><span>było<b>{fm(d.metric, d.from_value)}</b></span></i>
                <i className="vr-mark b" style={{ left: pos(d.to_value!) }}><span>cel<b>{fm(d.metric, d.to_value)}</b></span></i>
                <i className="vr-mark r" style={{ left: pos(r.actual!) }}><span>jest<b>{fm(d.metric, r.actual)}</b></span></i>
              </div>
              <div className="vr-impact">
                <em>Realny wpływ ({L.short})</em>
                <b className={(r.impact ?? 0) < 0 ? "neg" : "pos"}>{r.lowConfidence ? range(r.range) : zlSigned(r.impact)}</b>
                <small>miesięcznie{r.lowConfidence ? " · mało danych, dlatego zakres" : ""}</small>
              </div>
            </div>
          ) : C ? (
            <div className="vr-impact">
              <em>Realny wpływ: {C.name}</em>
              <b className={(r.impact ?? 0) < 0 ? "neg" : "pos"}>{r.impact == null ? "brak danych" : zlSigned(r.impact)}</b>
              <small>miesięcznie{r.lowConfidence ? " · mało danych" : ""}</small>
            </div>
          ) : L ? (
            <p className="lp-stop"><CircleAlert size={16} /> Brak danych z okresu sprawdzenia.</p>
          ) : (
            <div className="vr-impact"><em>Profit w okresie sprawdzenia</em><b>{zl(r.profit)}</b><small>wcześniej {zl(r.profitBefore)}</small></div>
          )}
          <div className="vr-q">
            <span>Miałeś rację?</span>
            {VERDICTS.map((x) => (
              <button key={x} className={`vr-btn ${v === x ? "on" : ""} ${x === "tak" ? "yes" : x === "nie" ? "no" : ""}`} onClick={() => setV(x)}>
                {x === "tak" ? <Trophy size={16} /> : x === "nie" ? <X size={16} /> : <CircleAlert size={16} />} {x}
                {r.suggestion === x && <small>wg danych</small>}
              </button>
            ))}
          </div>
          <textarea rows={2} value={learning} onChange={(e) => setLearning(e.target.value)} placeholder="Czego się nauczyłeś? (1 zdanie)" aria-label="Czego się nauczyłeś" />
          {err && <p className="error">{err}</p>}
          <button className={`btn primary ${v && learning.trim() ? "pulse" : ""}`} disabled={!v || !learning.trim()} onClick={save}><Check size={15} /> Zapisz</button>
        </div>
      )}
    </div>
  );
}
