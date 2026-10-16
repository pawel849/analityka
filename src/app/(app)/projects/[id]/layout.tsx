import { notFound } from "next/navigation";
import { loadProject } from "@/lib/project-context";

export const dynamic = "force-dynamic";

/** Układ projektu: bez bocznego menu – pulpit z przyciskami, a w każdym narzędziu strzałka powrotu. */
export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await loadProject(id);
  if (!project) notFound();
  return <main className="proj-main solo">{children}</main>;
}
