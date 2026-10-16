import { notFound } from "next/navigation";
import { Planner } from "@/components/dashboard/Planner";
import { ToolHeader } from "@/components/shell/ToolHeader";
import { loadProject } from "@/lib/project-context";

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) notFound();
  return (
    <>
      <ToolHeader tool="plan" projectId={id} />
      <Planner projectId={id} />
    </>
  );
}
