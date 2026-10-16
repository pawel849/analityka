import { notFound } from "next/navigation";
import { LoopRunner } from "@/components/loop/LoopRunner";
import { loadProject } from "@/lib/project-context";

/** Analiza SOP – zawsze od kroku, na którym stanęła bieżąca pętla; nowa pętla zawsze od kroku 1. */
export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) notFound();
  return <LoopRunner projectId={id} />;
}
