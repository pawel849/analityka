"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Check, ChevronDown, ChevronUp, CircleCheck, Flag, Lock, Plus, Route } from "lucide-react";
import { api } from "../forms";
import { SOP, sopHref } from "@/lib/sop";
import type { ReviewState } from "@/lib/review";

const tomorrow = () => new Date(Date.now() + 86400_000).toISOString().slice(0, 10);

/** Pasek przeglądu (SOP) na dole każdego poziomu: pytanie, notatka, działania → kalendarz, „Dalej”. */
export function ReviewBar({ projectId }: { projectId: string }) {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const seg = pathname.split("/")[3] ?? "";
  const idx = SOP.findIndex((s) => s.key === seg);
  const [st, setSt] = useState<ReviewState | null>(null);
  const [note, setNote] = useState("");
  const [ok, setOk] = useState(false);
  const [act, setAct] = useState("");
  const [due, setDue] = useState(tomorrow());
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const load = useCallback(() => api<ReviewState>(`/api/projects/${projectId}/review`).then(setSt).catch(() => {}), [projectId]);
  useEffect(() => {
    load();
  }, [load, pathname]);
  const r = st?.active;
  const step = idx >= 0 ? SOP[idx] : null;
  useEffect(() => {
    if (r && step) {
      setNote(r.notes[step.key]?.note ?? "");
      setOk(!!r.notes[step.key]?.ok);
      setErr("");
    }
  }, [r?.id, step?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!r || !step) return null;
  const locked = idx > r.step;
  const last = idx === SOP.length - 1;
  const levelActions = st!.actions.filter((a) => a.level === step.label);

  const save = async (advance: boolean) => {
    setBusy(true);
    setErr("");
    try {
      await api(`/api/reviews/${r.id}`, "PATCH", { step: idx, note, ok, advance });
      if (advance && last) {
        await api(`/api/reviews/${r.id}/finish`, "POST");
        router.push(`/projects/${projectId}?przeglad=zakonczony`);
      } else if (advance) {
        router.push(sopHref(projectId, SOP[idx + 1].key));
      } else await load();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  /** Cichy zapis notatki (bez blokowania przycisków). */
  const autosave = () => api(`/api/reviews/${r.id}`, "PATCH", { step: idx, note, ok, advance: false }).catch(() => {});
  const addAct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!act.trim()) return;
    try {
      await api(`/api/reviews/${r.id}/actions`, "POST", { title: act, due, level: step.label });
      setAct("");
      load();
    } catch (x) {
      setErr((x as Error).message);
    }
  };

  return (
    <div className={`rv-bar ${open ? "open" : ""}`}>
      <div className="rv-head">
        <span className="rv-badge"><Route size={15} /> Przegląd</span>
        <ol className="rv-steps">
          {SOP.map((s, i) => {
            const done = i < r.step;
            const cls = `${i === idx ? "on" : ""} ${done ? "done" : ""} ${i > r.step ? "lock" : ""}`;
            const inner = (
              <>
                <span>{done ? <Check size={11} /> : i > r.step ? <Lock size={10} /> : i + 1}</span>
                {s.level}
              </>
            );
            return <li key={s.key} className={cls}>{i <= r.step ? <Link href={sopHref(projectId, s.key)}>{inner}</Link> : <span className="rv-step-l">{inner}</span>}</li>;
          })}
        </ol>
        <button className="icon-btn" onClick={() => setOpen((v) => !v)} aria-label={open ? "Zwiń" : "Rozwiń"}>{open ? <ChevronDown size={18} /> : <ChevronUp size={18} />}</button>
      </div>
      {open && (
        <div className="rv-body">
          {locked ? (
            <div className="rv-locked">
              <Lock size={18} /> Najpierw zamknij poziom „{SOP[r.step].label}”.
              <Link className="btn primary" href={sopHref(projectId, SOP[r.step].key)}>Przejdź <ArrowRight size={15} /></Link>
            </div>
          ) : (
            <>
              {idx === 0 && st!.last && (
                <div className="rv-prev">
                  <b>Ostatni przegląd ({st!.last.finished_at})</b>
                  <ul>
                    {SOP.filter((s) => st!.last!.notes[s.key]?.note?.trim()).map((s) => (
                      <li key={s.key}><span className="rv-lvl">{s.level}</span> {st!.last!.notes[s.key].note}</li>
                    ))}
                  </ul>
                  {st!.lastActions.length > 0 && (
                    <div className="rv-prev-acts">
                      <span>Działania: {st!.lastActions.filter((a) => a.done).length}/{st!.lastActions.length} zrobione</span>
                      {st!.lastActions.map((a) => (
                        <span key={a.id} className={`chip ${a.done ? "on" : "warn"}`}>{a.done ? <CircleCheck size={13} /> : null} {a.title}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <div className="rv-grid">
                <div className="rv-note">
                  <label className="rv-q">{step.question}</label>
                  <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (r.notes[step.key]?.note ?? "") && autosave()} />
                  <label className="rv-ok"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} /> bez uwag na tym poziomie</label>
                </div>
                <div className="rv-acts">
                  <span className="rv-q small"><Flag size={14} /> Działanie do kalendarza</span>
                  <ul>
                    {levelActions.map((a) => <li key={a.id}><Check size={13} /> {a.title} <em>do {a.due}</em></li>)}
                  </ul>
                  <form onSubmit={addAct} className="rv-act-form">
                    <input value={act} onChange={(e) => setAct(e.target.value)} placeholder="Co zrobić?" aria-label="Działanie" />
                    <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Termin" />
                    <button className="btn" disabled={!act.trim()} aria-label="Dodaj działanie"><Plus size={15} /></button>
                  </form>
                </div>
              </div>
              {err && <p className="error">{err}</p>}
              <div className="rv-nav">
                {idx > 0 ? <Link className="btn" href={sopHref(projectId, SOP[idx - 1].key)}><ArrowLeft size={15} /> {SOP[idx - 1].label}</Link> : <span />}
                <button className="btn primary" disabled={busy || (!note.trim() && !ok)} onClick={() => save(true)}>
                  {last ? <><CircleCheck size={15} /> Zakończ przegląd</> : <>Dalej: {SOP[idx + 1].label} <ArrowRight size={15} /></>}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
