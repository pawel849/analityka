import { notFound } from "next/navigation";
import { EconomicsPanel } from "@/components/data/EconomicsPanel";
import { ToolHeader } from "@/components/shell/ToolHeader";
import { loadProject } from "@/lib/project-context";

export default async function EconomicsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string; to?: string; cmp?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const day = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
  const project = await loadProject(id);
  if (!project) notFound();
  return (
    <>
      <ToolHeader tool="ekonomia" context={`${project.client_name} · ${project.name}`} />
      <EconomicsPanel projectId={id} from={day(sp.from)} to={day(sp.to)} cmp={sp.cmp} />
    </>
  );
}
