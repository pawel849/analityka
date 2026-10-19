import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, FileText, Flag } from "lucide-react";
import { counter, listReports } from "@/lib/loop";
import { LEVER_NAMES } from "@/lib/loop-def";
import { loadProject } from "@/lib/project-context";

export const dynamic = "force-dynamic";

const int = (n: number) => String(Math.abs(Math.round(n))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const zl = (v: number | null) => (v == null ? "—" : `${v < 0 && Math.round(v) !== 0 ? "−" : ""}${int(v)} zł`);
const signed = (v: number) => (Math.round(v) === 0 ? "0 zł" : `${v > 0 ? "+" : "−"}${int(v)} zł`);

/** Raporty z zakończonych sesji – od najnowszego. */
export default async function ReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) notFound();
  const [reports, c] = await Promise.all([listReports(id), counter(id)]);
  return (
    <>
      <header className="tool-head">
        <div className="tool-title">
          <Link href={`/projects/${id}`} className="back-btn" aria-label="Wróć"><ArrowLeft size={20} /></Link>
          <span className="tool-title-ic"><FileText size={20} /></span>
          <h1>Raporty</h1>
        </div>
      </header>
      {(c.verifiedCount > 0 || c.predictions > 0) && (
        <div className="rl-counter">
          <div><em>Decyzje z analityki</em><b><span className="pos">{signed(c.plus)}</span> / <span className="neg">{signed(c.minus)}</span></b></div>
          <div><em>Trafność hipotez</em><b>{c.hitRate == null ? "—" : `${Math.round(c.hitRate * 100)}%`}</b></div>
          <div><em>Średni błąd predykcji</em><b>{zl(c.meanError)}</b></div>
        </div>
      )}
      {!reports.length && <div className="empty-box"><FileText size={28} /> Raport powstaje na końcu każdej sesji.</div>}
      <div className="rl">
        {reports.map((r) => (
          <Link key={r.id} href={`/projects/${id}/raporty/${r.id}`} className="rl-item">
            <span className="rl-date"><b>{new Date(`${r.date}T12:00:00`).getDate()}</b>{new Date(`${r.date}T12:00:00`).toLocaleDateString("pl-PL", { month: "short", year: "numeric" })}</span>
            <span className="rl-main">
              <b>{r.title ?? r.decision ?? "Raport"}</b>
              <span>
                {r.decision && <>{r.decision} · </>}
                {r.target != null && <>profit {zl(r.profit)} z {zl(r.target)}</>}
                {r.lever && <> · <Flag size={12} /> {LEVER_NAMES[r.lever.key].name}</>}
              </span>
            </span>
            {r.expected != null && <span className="rl-val">{signed(r.expected)}<small>/mies.</small></span>}
            <ChevronRight size={18} />
          </Link>
        ))}
      </div>
    </>
  );
}
