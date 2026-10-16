import { notFound } from "next/navigation";
import { SetupChoice, SetupWizard } from "@/components/setup/SetupWizard";
import { loadProject, requestOrigin } from "@/lib/project-context";

export default async function GuidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) notFound();
  const origin = await requestOrigin();
  if (project.setup.mode !== "guided" || project.setup.hidden) {
    return (
      <>
        <h1>Przewodnik konfiguracji</h1>
        <p className="tool-what">Krok po kroku od zera do działającej analityki – z pytaniami i sprawdzaniem na żywo.</p>
        <SetupChoice projectId={id} />
      </>
    );
  }
  return <SetupWizard projectId={id} origin={origin} trackingKey={project.tracking_key} initial={project.setup} />;
}
