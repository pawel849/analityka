"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FileText, Loader2, Lock, MoreHorizontal, Play, X } from "lucide-react";
import { api } from "../forms";
import { TOOL_ICONS } from "../shell/tool-icons";
import { phraseOk, REVIEW_PHRASE, STEPS } from "@/lib/loop-def";
import { TOOLS, projectHref } from "@/lib/nav";

interface Home { active: { step: number } | null; reports: { id: string; date: string }[] }

/** Pulpit klienta: nowa sesja + raporty. Reszta narzędzi pod „⋯”. */
export function SessionHome({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [h, setH] = useState<Home | null>(null);
  const [gate, setGate] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    Promise.all([
      api<{ active: { step: number } | null }>(`/api/projects/${projectId}/loop`),
      api<{ id: string; date: string }[]>(`/api/projects/${projectId}/reports`),
    ]).then(([s, reports]) => setH({ active: s.active, reports })).catch((e) => setErr(e.message));
  }, [projectId]);
  const start = async () => {
    setBusy(true);
    setErr("");
    try {
      await api(`/api/projects/${projectId}/loop`, "POST", { phrase });
      router.push(`/projects/${projectId}/analiza`);
    } catch (x) {
      setErr((x as Error).message);
      setBusy(false);
    }
  };
  const onStart = () => (h?.active || !h?.reports.length ? start() : setGate(true));
  const last = h?.reports[0];
  return (
    <>
      <div className="sh-menu">
        <button className="icon-btn" onClick={() => setMenu(!menu)} aria-label="Więcej" title="Narzędzia i ustawienia"><MoreHorizontal size={20} /></button>
        {menu && (
          <div className="sh-pop" onMouseLeave={() => setMenu(false)}>
            {TOOLS.filter((t) => t.key !== "pulpit").map((t) => {
              const I = TOOL_ICONS[t.key];
              return <Link key={t.key} href={projectHref(projectId, t.key)}><I size={16} /> {t.label}</Link>;
            })}
          </div>
        )}
      </div>
      <div className="sh">
        <button className="sh-tile main" onClick={onStart} disabled={!h || busy}>
          {busy ? <Loader2 className="spin" size={40} /> : <Play size={40} />}
          <b>{h?.active ? "Kontynuuj sesję" : "Rozpocznij nową sesję"}</b>
          {h?.active && <small>{STEPS[Math.min(h.active.step, STEPS.length - 1)].title}</small>}
        </button>
        <Link href={`/projects/${projectId}/raporty`} className="sh-tile">
          <FileText size={40} />
          <b>Raporty</b>
          <small>{h ? (h.reports.length ? `${h.reports.length} · ostatni ${new Date(`${last!.date}T12:00:00`).toLocaleDateString("pl-PL", { day: "numeric", month: "short" })}` : "jeszcze brak") : ""}</small>
        </Link>
      </div>
      {err && !gate && <p className="error">{err}</p>}
      {gate && last && (
        <div className="modal-back" onClick={() => setGate(false)}>
          <div className="modal gate" onClick={(e) => e.stopPropagation()}>
            <button className="icon-btn modal-x" onClick={() => setGate(false)} aria-label="Zamknij"><X size={18} /></button>
            <Lock size={30} />
            <h2>Najpierw poprzedni raport</h2>
            <Link href={`/projects/${projectId}/raporty/${last.id}`} target="_blank" className="btn"><FileText size={15} /> Otwórz raport z {new Date(`${last.date}T12:00:00`).toLocaleDateString("pl-PL", { day: "numeric", month: "long" })}</Link>
            <label>Wpisz: <b>{REVIEW_PHRASE}</b></label>
            <input value={phrase} onChange={(e) => setPhrase(e.target.value)} onPaste={(e) => e.preventDefault()} autoComplete="off" aria-label="Potwierdzenie" />
            {err && <p className="error">{err}</p>}
            <button className="btn primary big" disabled={!phraseOk(phrase) || busy} onClick={start}><Play size={16} /> Rozpocznij sesję</button>
          </div>
        </div>
      )}
    </>
  );
}
