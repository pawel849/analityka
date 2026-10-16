"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CircleCheck, Play } from "lucide-react";
import { api } from "../forms";
import { GoalBar } from "./LoopRunner";
import { STEPS } from "@/lib/loop-def";
import type { LoopState } from "@/lib/loop";

/** Pulpit: jedna droga – analiza SOP od kroku 1 do 9. Bez wchodzenia w środek. */
export function LoopStart({ projectId, finished }: { projectId: string; finished: boolean }) {
  const [st, setSt] = useState<LoopState | null>(null);
  const [g, setG] = useState<Parameters<typeof GoalBar>[0]["g"]>(null);
  useEffect(() => {
    api<LoopState>(`/api/projects/${projectId}/loop`).then(setSt).catch(() => {});
    api<Parameters<typeof GoalBar>[0]["g"]>(`/api/projects/${projectId}/loop/gap`).then(setG).catch(() => {});
  }, [projectId]);
  const a = st?.active;
  const due = st?.due.length ?? 0;
  return (
    <section className="ls">
      <GoalBar g={g} />
      <div className="ls-main">
        <div>
          <h2>Analiza i poprawa reklam pod cel zysku</h2>
          {finished && <span className="chip on"><CircleCheck size={13} /> Pętla zakończona – wnioski na osi czasu, działania w kalendarzu</span>}
          {st?.prev && !finished && <span className="ls-last">ostatnia pętla: {st.prev.finished_at}{st.prevActions.length ? ` · ${st.prevActions.filter((x) => x.done).length}/${st.prevActions.length} działań zrobionych` : ""}{due ? ` · ${due} test(y) do rozstrzygnięcia` : ""}</span>}
        </div>
        <Link href={`/projects/${projectId}/analiza`} className="btn primary big"><Play size={16} /> {a ? `Kontynuuj: krok ${Math.min(a.step, STEPS.length - 1) + 1} – ${STEPS[Math.min(a.step, STEPS.length - 1)].title}` : "Rozpocznij analizę"}</Link>
      </div>
      <ol className="ls-steps">
        {STEPS.map((s, i) => (
          <li key={s.key} className={a ? (i < a.step ? "done" : i === a.step ? "on" : "") : ""}><span>{i + 1}</span>{s.title}</li>
        ))}
      </ol>
    </section>
  );
}
