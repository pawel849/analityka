import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ReportActions, ReportTitle } from "@/components/loop/ReportActions";
import { ReportView } from "@/components/loop/ReportView";
import { getReport, projectMaps } from "@/lib/loop";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string; lid: string }> }) {
  const { id, lid } = await params;
  const r = await getReport(lid);
  if (!r || r.projectId !== id) notFound();
  const maps = await projectMaps(id);
  return (
    <>
      <header className="tool-head no-print">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div className="tool-title">
            <Link href={`/projects/${id}/raporty`} className="back-btn" aria-label="Wróć do raportów"><ArrowLeft size={20} /></Link>
            <h1>Raport</h1>
          </div>
          <ReportActions lid={lid} />
        </div>
      </header>
      <ReportView r={r.report} maps={maps} title={<ReportTitle lid={lid} initial={r.report.title || `Raport – ${r.report.client} – ${new Date(r.report.createdAt).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" })}`} />} />
    </>
  );
}
