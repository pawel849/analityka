import Link from "next/link";
import { Workflow } from "lucide-react";
import { notFound } from "next/navigation";
import { q } from "@/lib/db";
import { CreateForm } from "@/components/forms";
import { MonitorPanel } from "@/components/MonitorPanel";
import { ToolHeader } from "@/components/shell/ToolHeader";
import { loadProject } from "@/lib/project-context";

export default async function FunnelsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) notFound();
  const funnels = await q<{ id: string; name: string; updated_at: string; nodes: string }>(
    `SELECT id, name, updated_at, jsonb_array_length(graph->'nodes') AS nodes FROM funnels WHERE project_id = $1 ORDER BY created_at`,
    [id],
  );
  return (
    <>
      <ToolHeader tool="lejki" context={`${project.client_name} · ${project.name}`} />
      <div className="card" style={{ marginBottom: 16 }}>
        <CreateForm url="/api/funnels" extra={{ project_id: id }} fields={[{ name: "name", label: "Nazwa nowego lejka", required: true }]} submitLabel="Utwórz lejek" goTo="/funnels/" />
      </div>
      <div className="grid">
        {funnels.map((f) => (
          <Link key={f.id} href={`/funnels/${f.id}`} className="card link funnel-card">
            <span className="tool-tile-icon"><Workflow size={20} /></span>
            <h3>{f.name}</h3>
          </Link>
        ))}
      </div>
      {!funnels.length && <p>Brak lejków – utwórz pierwszy powyżej.</p>}
      <div className="section">
        <h2>Ruch na stronach (wszystkie strony projektu)</h2>
        <MonitorPanel projectId={id} />
      </div>
    </>
  );
}
