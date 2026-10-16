import { notFound } from "next/navigation";
import { SetupChoice, SetupWizard } from "@/components/setup/SetupWizard";
import { ToolHeader } from "@/components/shell/ToolHeader";
import { loadProject, requestOrigin } from "@/lib/project-context";

export default async function GuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) notFound();
  const origin = await requestOrigin();
  if (project.setup.mode !== "guided" || project.setup.hidden) {
    return (
      <>
        <ToolHeader tool="przewodnik" projectId={id} />
        <SetupChoice projectId={id} />
      </>
    );
  }
  return (
    <>
      <ToolHeader tool="przewodnik" projectId={id} />
      <SetupWizard projectId={id} origin={origin} trackingKey={project.tracking_key} initial={project.setup} />
    </>
  );
}
