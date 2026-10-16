import { notFound } from "next/navigation";
import { AdTestsHome } from "@/components/adtests/AdTestsHome";
import { ToolHeader } from "@/components/shell/ToolHeader";
import { loadProject } from "@/lib/project-context";

export default async function AdTestsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) notFound();
  return (
    <>
      <ToolHeader tool="testy" context={`${project.client_name} · ${project.name}`} />
      <AdTestsHome projectId={id} />
    </>
  );
}
