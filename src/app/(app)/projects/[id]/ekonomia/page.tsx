import { notFound } from "next/navigation";
import { EconomicsPanel } from "@/components/data/EconomicsPanel";
import { ToolHeader } from "@/components/shell/ToolHeader";
import { loadProject } from "@/lib/project-context";

export default async function EconomicsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) notFound();
  return (
    <>
      <ToolHeader tool="ekonomia" context={`${project.client_name} · ${project.name}`} />
      <EconomicsPanel projectId={id} />
    </>
  );
}
