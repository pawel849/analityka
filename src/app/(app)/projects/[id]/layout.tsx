import { notFound } from "next/navigation";
import { ProjectNav } from "@/components/shell/ProjectNav";
import { loadProject, loadSwitcher } from "@/lib/project-context";

export const dynamic = "force-dynamic";

/** Układ projektu: po lewej te same narzędzia dla każdego klienta, po prawej dane wybranego projektu. */
export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project, list] = await Promise.all([loadProject(id), loadSwitcher()]);
  if (!project) notFound();
  const guideActive = project.setup.mode === "guided" && !project.setup.done && !project.setup.hidden;
  return (
    <div className="proj-shell">
      <ProjectNav projectId={id} clientName={project.client_name} projectName={project.name} list={list} guideActive={guideActive} />
      <main className="proj-main">{children}</main>
    </div>
  );
}
