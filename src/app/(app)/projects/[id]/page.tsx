import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TOOL_ICONS } from "@/components/shell/tool-icons";
import { LEGACY_TABS, TOOLS, projectHref } from "@/lib/nav";
import { loadProject } from "@/lib/project-context";

/** Pulpit projektu: same przyciski do narzędzi (+ przekierowanie starych adresów ?tab=…). */
export default async function ProjectHome({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
  if (tab && LEGACY_TABS[tab]) redirect(projectHref(id, LEGACY_TABS[tab]) + (tab === "integracje" ? "?s=api" : ""));
  const project = await loadProject(id);
  if (!project) notFound();
  const guideActive = project.setup.mode === "guided" && !project.setup.done && !project.setup.hidden;
  return (
    <>
      <header className="tool-head">
        <div className="tool-title">
          <Link href="/" className="back-btn" title="Wróć do klientów" aria-label="Wróć do klientów"><ArrowLeft size={20} /></Link>
          <div>
            <span className="pulpit-client">{project.client_name}</span>
            <h1>{project.name}</h1>
          </div>
        </div>
      </header>
      <div className="pulpit-grid">
        {TOOLS.filter((t) => t.key !== "pulpit").map((t) => {
          const Icon = TOOL_ICONS[t.key];
          return (
            <Link key={t.key} href={projectHref(id, t.key)} className={`pulpit-tile ${t.section === "dane" ? "sec" : ""}`} data-tour={`nav-${t.key}`}>
              <span className="pulpit-ic"><Icon size={28} /></span>
              <b>{t.label}</b>
              {t.key === "przewodnik" && guideActive && <span className="pulpit-dot" title="Przewodnik w toku" />}
            </Link>
          );
        })}
      </div>
    </>
  );
}
