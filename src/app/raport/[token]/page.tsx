import { notFound } from "next/navigation";
import { ReportView } from "@/components/loop/ReportView";
import { reportByToken } from "@/lib/loop";

export const dynamic = "force-dynamic";

/** Publiczny raport (tylko do odczytu) – link wysyłany klientowi. */
export default async function PublicReport({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = await reportByToken(token);
  if (!r) notFound();
  return <main className="rp-public"><ReportView r={r.report} maps={r.maps} /></main>;
}
