"use client";

import { useCallback, useEffect, useState } from "react";
import { Target } from "lucide-react";
import { api } from "../forms";
import { Tip } from "../Tip";
import { GoalForm } from "../loop/LoopRunner";
import type { GoalRow } from "@/lib/loop-data";

/** Cel profitu w Ustawieniach – ten sam, który sesja analityczna pokazuje (i pozwala zmienić) w kroku 1. */
export function GoalSettings({ projectId }: { projectId: string }) {
  const [d, setD] = useState<{ goal: GoalRow | null; last: GoalRow | null } | null>(null);
  const [edit, setEdit] = useState(false);
  const load = useCallback(() => api<{ goal: GoalRow | null; last: GoalRow | null }>(`/api/projects/${projectId}/goals`).then(setD), [projectId]);
  useEffect(() => {
    load().catch(() => {});
  }, [load]);
  if (!d) return null;
  return (
    <div className="card section">
      <h3><Target size={16} /> Cel profitu <Tip text="Profit po wszystkich kosztach. Sesja analityczna uzupełnia go w kroku 1; zmiana tam zapisuje się też tutaj." /></h3>
      {d.goal && !edit ? (
        <div className="row">
          <b>{Math.round(d.goal.profit_target).toLocaleString("pl-PL")} zł</b>
          <span>{d.goal.period}: {d.goal.date_from} – {d.goal.date_to}</span>
          <button className="btn small" onClick={() => setEdit(true)}>Zmień</button>
        </div>
      ) : (
        <GoalForm projectId={projectId} last={d.goal ?? d.last} onSaved={() => { setEdit(false); load(); }} onCancel={d.goal ? () => setEdit(false) : undefined} />
      )}
    </div>
  );
}
