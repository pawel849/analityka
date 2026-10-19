"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, CircleAlert, CircleCheck, Copy, Lock, Plus, Trash2, Trophy } from "lucide-react";
import { api } from "../forms";
import { Tip } from "../Tip";
import { METRICS } from "@/lib/levers";
import { NO_CHANGE, VERDICTS } from "@/lib/loop-def";
import type { Decision } from "@/lib/loop";

export const zl = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? "—" : `${Math.round(v).toLocaleString("pl-PL")} zł`);
export const zlSigned = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : Math.round(v) === 0 ? "0 zł" : `${v > 0 ? "+" : "−"}${Math.abs(Math.round(v)).toLocaleString("pl-PL")} zł`;
export const fm = (key: string | null | undefined, v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : key === "ctr" || key === "cr" ? `${(v * 100).toLocaleString("pl-PL", { maximumFractionDigits: 2 })}%` : `${v.toLocaleString("pl-PL", { maximumFractionDigits: 2 })} zł`;
export const range = (r: [number, number] | null | undefined) => (r ? `${zlSigned(r[0])} … ${zlSigned(r[1])}` : "—");
export const plus = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);

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
    <button className="btn small" onClick={async () => { await navigator.clipboard.writeText(briefOf(d)).catch(() => {}); setOk(true); setTimeout(() => setOk(false), 1600); }}>
      {ok ? <><CircleCheck size={14} /> skopiowano</> : <><Copy size={14} /> Generuj brief</>}
    </button>
  );
}

/** Karta decyzji (zlecenie): co, kto, dlaczego, hipoteza, wartość, data. */
export function DecisionCard({ d, onDelete, children }: { d: Decision; onDelete?: () => void; children?: React.ReactNode }) {
  const metric = METRICS.find((m) => m.key === d.metric);
  return (
    <div className="dc">
      <div className="dc-head">
        <span className={`tc-phase ${d.verdict ? "ph-zamknięty" : "ph-w-trakcie"}`}>{d.verdict ? `rozstrzygnięta: ${d.verdict}` : `sprawdzenie ${d.check_date}`}</span>
        <b>{d.what}</b>
        {d.expected_month != null && <span className="dc-val">{zlSigned(d.expected_month)}/mies.</span>}
        {onDelete && <button className="icon-btn danger" title="Usuń decyzję" aria-label="Usuń decyzję" onClick={onDelete}><Trash2 size={14} /></button>}
      </div>
      <dl className="dc-grid">
        {d.kind !== NO_CHANGE && <><dt>Kto</dt><dd>{d.who || "—"}</dd></>}
        <dt>Dlaczego</dt><dd>{d.why}</dd>
        {d.kind !== NO_CHANGE && <><dt>Hipoteza</dt><dd>{d.hypothesis}</dd></>}
        {metric && <><dt>Etap</dt><dd>{d.element || "—"} · {metric.stage}</dd></>}
        <dt>Sprawdzenie</dt><dd>{d.check_date}</dd>
      </dl>
      {children}
    </div>
  );
}

/** Lista zadań decyzji (checklista) z obowiązkowym punktem „pomiar działa”. */
export function DecisionTasks({ d, reload }: { d: Decision; reload: () => Promise<void> | void }) {
  const [f, setF] = useState({ title: "", who: d.who, due: plus(1) });
  const add = async () => {
    if (!f.title.trim()) return;
    await api(`/api/decisions/${d.id}/tasks`, "POST", f);
    setF({ ...f, title: "" });
    await reload();
  };
  return (
    <>
      <ul className="ck">
        {d.checklist.map((c) => (
          <li key={c.id} className={`${c.done ? "done" : ""} ${c.required ? "req" : ""}`}>
            <input type="checkbox" checked={c.done} onChange={async () => { await api(`/api/tasks/${c.id}`, "PATCH", { done: !c.done }); await reload(); }} />
            <span>{c.title}</span>
            <em>{c.who ? `${c.who} · ` : ""}{c.due}</em>
          </li>
        ))}
      </ul>
      <div className="ck-add">
        <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Zadanie" aria-label="Zadanie" />
        <input value={f.who} onChange={(e) => setF({ ...f, who: e.target.value })} placeholder="Kto" aria-label="Kto" />
        <input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} aria-label="Termin" />
        <button className="btn" onClick={add} disabled={!f.title.trim()} aria-label="Dodaj"><Plus size={15} /></button>
      </div>
    </>
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

/** „Miałeś rację?” – hipoteza vs wynik, wpływ w zł (z pewnością), wniosek jednym zdaniem. */
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
  const metric = METRICS.find((m) => m.key === d.metric);
  return (
    <DecisionCard d={d}>
      {!r ? <p>Liczę wynik…</p> : (
        <div className="vr">
          {metric ? (
            <div className="lp-kpis">
              <div><em>{metric.label} – było (A)</em><b>{fm(d.metric, d.from_value)}</b></div>
              <div><em>Hipoteza (B)</em><b>{fm(d.metric, d.to_value)}</b><small>oczekiwane {zlSigned(d.expected_month)}/mies.</small></div>
              <div><em>Wynik {r.from} – {r.to}</em><b>{fm(d.metric, r.actual)}</b></div>
              <div>
                <em>Realny wpływ <Tip text="Model lejka: zmiana tylko tej metryki, budżet i reszta lejka jak w dniu decyzji." /></em>
                <b className={(r.impact ?? 0) < 0 ? "neg" : "pos"}>{r.lowConfidence ? range(r.range) : `${zlSigned(r.impact)}/mies.`}</b>
                {r.lowConfidence && <span className="conf-low"><CircleAlert size={12} /> niska pewność</span>}
              </div>
            </div>
          ) : (
            <div className="lp-kpis">
              <div><em>Profit {r.from} – {r.to}</em><b>{zl(r.profit)}</b></div>
              <div><em>Tyle samo dni wcześniej</em><b>{zl(r.profitBefore)}</b></div>
            </div>
          )}
          <label className="lp-l">Miałeś rację?</label>
          <div className="seg big">
            {VERDICTS.map((x) => (
              <button key={x} className={v === x ? "on" : ""} onClick={() => setV(x)}>
                {x === "tak" && <Trophy size={14} />} {x}{r.suggestion === x ? " · wg danych" : ""}
              </button>
            ))}
          </div>
          <label className="lp-l">Czego się nauczyłeś? (1 zdanie)</label>
          <textarea rows={2} value={learning} onChange={(e) => setLearning(e.target.value)} />
          {err && <p className="error">{err}</p>}
          <div className="row"><button className="btn primary" disabled={!v || !learning.trim()} onClick={save}><Check size={15} /> Zapisz rozstrzygnięcie</button></div>
        </div>
      )}
    </DecisionCard>
  );
}

/** Decyzja czekająca na dzień sprawdzenia. */
export function Waiting({ d }: { d: Decision }) {
  return <li className="dc-wait"><Lock size={13} /> {d.what} <small>sprawdzenie {d.check_date}</small></li>;
}
