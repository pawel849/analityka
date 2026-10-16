import { notFound } from "next/navigation";
import { SettingsPanel } from "@/components/data/SettingsPanel";
import { DeleteButton } from "@/components/forms";
import { ToolHeader } from "@/components/shell/ToolHeader";
import { loadProject } from "@/lib/project-context";

export default async function SettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) notFound();
  return (
    <>
      <ToolHeader tool="ustawienia" context={`${project.client_name} · ${project.name}`} />
      <SettingsPanel projectId={id} />
      <div className="card section danger-zone">
        <h3>Usuń projekt</h3>
        <p className="hint">Usuwa projekt razem z lejkami, testami i zebranymi danymi. Nie da się tego cofnąć.</p>
        <DeleteButton url={`/api/projects/${id}`} confirmText={`Usunąć projekt „${project.name}” razem z lejkami i danymi?`} goTo={`/clients/${project.client_id}`} />
      </div>
    </>
  );
}
