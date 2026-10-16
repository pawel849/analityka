"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, CircleCheck, Lock, Play, Route } from "lucide-react";
import { api } from "../forms";
import { Tip } from "../Tip";
import { TOOL_ICONS } from "../shell/tool-icons";
import { SOP, sopHref } from "@/lib/sop";
import type { ReviewState } from "@/lib/review";

/** Pulpit: poziomy od makro do mikro w stałej kolejności + start/kontynuacja przeglądu. */
export function ReviewPath({ projectId, justFinished }: { projectId: string; justFinished: boolean }) {
  const router = useRouter();
  const [st, setSt] = useState<ReviewState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<ReviewState>(`/api/projects/${projectId}/review`).then(setSt).catch(() => {});
  }, [projectId]);
  const r = st?.active ?? null;
  const start = async () => {
    setBusy(true);
    await api(`/api/projects/${projectId}/review`, "POST");
    router.push(sopHref(projectId, SOP[r ? Math.min(r.step, SOP.length - 1) : 0].key));
  };
  const lastDone = st?.lastActions.filter((a) => a.done).length ?? 0;
  return (
    <section className="rp">
      <div className="rp-head">
        <span className="rp-title"><Route size={18} /> Przegląd od makro do mikro <Tip text="Idziesz poziom po poziomie: Ekonomia → Kalendarz → Lejek → Reklamy → Wnioski. Na każdym zapisujesz, co zauważyłeś, i dodajesz działania do kalendarza. Po zakończeniu wnioski trafiają na oś czasu, a działania wracają w następnym przeglądzie – widać, czy poprawiły wynik." /></span>
        {justFinished && <span className="chip on"><CircleCheck size={13} /> Przegląd zapisany na osi czasu</span>}
        {st?.last && !justFinished && (
          <span className="rp-last">ostatni: {st.last.finished_at}{st.lastActions.length ? ` · działania ${lastDone}/${st.lastActions.length}` : ""}</span>
        )}
        <button className="btn primary" disabled={busy || !st} onClick={start}>
          <Play size={15} /> {r ? `Kontynuuj: ${SOP[Math.min(r.step, SOP.length - 1)].label}` : "Rozpocznij przegląd"}
        </button>
      </div>
      <div className="rp-path">
        {SOP.map((s, i) => {
          const Icon = TOOL_ICONS[s.key];
          const locked = !!r && i > r.step;
          const done = !!r && i < r.step;
          const body = (
            <>
              <span className="rp-n">{done ? <CircleCheck size={16} /> : locked ? <Lock size={14} /> : i + 1}</span>
              <span className="rp-ic"><Icon size={24} /></span>
              <span className="rp-lvl">{s.level}</span>
              <b>{s.label}</b>
            </>
          );
          return (
            <div key={s.key} className="rp-cell">
              {locked ? (
                <span className={`rp-tile locked`} title="Najpierw zamknij wcześniejsze poziomy">{body}</span>
              ) : (
                <Link href={sopHref(projectId, s.key)} className={`rp-tile ${done ? "done" : ""} ${r && i === r.step ? "cur" : ""}`} data-tour={`nav-${s.key}`}>{body}</Link>
              )}
              {i < SOP.length - 1 && <ArrowRight size={18} className="rp-arrow" />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
