"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CircleCheck, Play } from "lucide-react";
import { api } from "../forms";
import { Counter, GoalBar } from "./LoopRunner";
import { Verdict } from "./Decisions";
import { STEPS } from "@/lib/loop-def";
import type { LoopState } from "@/lib/loop";

/** Pulpit: jedna droga – sesja od kroku 1 do 10. W dniu sprawdzenia decyzja wraca tu do rozstrzygnięcia. */
export function LoopStart({ projectId, finished }: { projectId: string; finished: boolean }) {
  const [st, setSt] = useState<LoopState | null>(null);
  const [g, setG] = useState<Parameters<typeof GoalBar>[0]["g"]>(null);
  const load = useCallback(async () => {
    const [s, gg] = await Promise.all([
      api<LoopState>(`/api/projects/${projectId}/loop`),
      api<Parameters<typeof GoalBar>[0]["g"]>(`/api/projects/${projectId}/loop/gap`),
    ]);
    setSt(s);
    setG(gg);
  }, [projectId]);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);
  const a = st?.active;
  const at = a ? Math.min(a.step, STEPS.length - 1) : 0;
  return (
    <section className="ls">
      <GoalBar g={g} />
      {st && (st.counter.verifiedCount > 0 || st.counter.predictions > 0) && <Counter c={st.counter} />}
      {st?.due.map((d) => <Verdict key={d.id} d={d} onDone={load} />)}
      <div className="ls-main">
        <div>
          <h2>Sesja analityczna → decyzja w złotówkach</h2>
          {finished && <span className="chip on"><CircleCheck size={13} /> Sesja zakończona – decyzja w kalendarzu i na osi czasu</span>}
          {st?.prev && !finished && <span className="ls-last">ostatnia sesja: {st.prev.finished_at}</span>}
        </div>
        <Link href={`/projects/${projectId}/analiza`} className="btn primary big"><Play size={16} /> {a && a.step > 0 ? `Kontynuuj: krok ${at + 1} – ${STEPS[at].title}` : "Rozpocznij sesję"}</Link>
      </div>
      <ol className="ls-steps">
        {STEPS.map((s, i) => (
          <li key={s.key} className={a ? (i < a.step ? "done" : i === a.step ? "on" : "") : ""}><span>{i + 1}</span>{s.title}</li>
        ))}
      </ol>
    </section>
  );
}
