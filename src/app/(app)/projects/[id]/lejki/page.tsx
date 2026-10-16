import Link from "next/link";
import { notFound } from "next/navigation";
import { Workflow } from "lucide-react";
import { q } from "@/lib/db";
import { FunnelThumb } from "@/components/FunnelThumb";
import { NewFunnelCard } from "@/components/NewFunnelCard";
import { ToolHeader } from "@/components/shell/ToolHeader";
import { loadProject } from "@/lib/project-context";

const ago = (iso: string) => {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400_000);
  return d <= 0 ? "dziś" : d === 1 ? "wczoraj" : `${d} dni temu`;
};

export default async function FunnelsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) notFound();
  const funnels = await q<{ id: string; name: string; updated_at: string; graph: { nodes?: []; edges?: [] } | null }>(
    `SELECT id, name, updated_at, graph FROM funnels WHERE project_id = $1 ORDER BY updated_at DESC`,
    [id],
  );
  return (
    <>
      <ToolHeader tool="lejki" />
      <div className="canvas-grid">
        <NewFunnelCard projectId={id} />
        {funnels.map((f) => (
          <Link key={f.id} href={`/funnels/${f.id}`} className="canvas-card">
            <div className="canvas-thumb">
              <FunnelThumb graph={f.graph} />
            </div>
            <div className="canvas-foot">
              <Workflow size={18} />
              <div>
                <b>{f.name}</b>
                <span>{ago(f.updated_at)}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
