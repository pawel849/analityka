import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ReportActions } from "@/components/loop/ReportActions";
import { ReportView } from "@/components/loop/ReportView";
import { getReport } from "@/lib/loop";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ id: string; lid: string }> }) {
  const { id, lid } = await params;
  const r = await getReport(lid);
  if (!r || r.projectId !== id) notFound();
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
      <ReportView r={r.report} />
    </>
  );
}
