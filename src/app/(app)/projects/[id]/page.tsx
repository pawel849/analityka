import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SessionHome } from "@/components/loop/SessionHome";
import { LEGACY_TABS, projectHref } from "@/lib/nav";
import { loadProject } from "@/lib/project-context";

/** Pulpit klienta: nowa sesja + raporty (+ przekierowanie starych adresów ?tab=…). */
export default async function ProjectHome({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  if (tab && LEGACY_TABS[tab]) redirect(projectHref(id, LEGACY_TABS[tab]) + (tab === "integracje" ? "?s=api" : ""));
  const project = await loadProject(id);
  if (!project) notFound();
  return (
    <>
      <header className="tool-head sh-head">
        <div className="tool-title">
          <Link href="/" className="back-btn" title="Wróć do klientów" aria-label="Wróć do klientów"><ArrowLeft size={20} /></Link>
          <div>
            <span className="pulpit-client">{project.client_name}</span>
            <h1>{project.name}</h1>
          </div>
        </div>
      </header>
      <SessionHome projectId={id} />
    </>
  );
}
