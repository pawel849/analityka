import { notFound } from "next/navigation";
import { TimelinePanel } from "@/components/data/TimelinePanel";
import { ToolHeader } from "@/components/shell/ToolHeader";
import { loadProject } from "@/lib/project-context";

export default async function TimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) notFound();
  return (
    <>
      <ToolHeader tool="os-czasu" projectId={id} />
      <TimelinePanel projectId={id} />
    </>
  );
}
