import { notFound } from "next/navigation";
import { Code2, Plug, Upload, Webhook, type LucideIcon } from "lucide-react";
import { q } from "@/lib/db";
import { ApiConnections } from "@/components/ApiConnections";
import { TrackingPanel } from "@/components/TrackingPanel";
import { IntegrationsPanel } from "@/components/IntegrationsPanel";
import { ImportPanel } from "@/components/data/ImportPanel";
import { ToolHeader } from "@/components/shell/ToolHeader";
import { loadProject, requestOrigin } from "@/lib/project-context";

export default async function DataPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ s?: string }> }) {
  const { id } = await params;
  const { s } = await searchParams;
  const project = await loadProject(id);
  if (!project) notFound();
  const origin = await requestOrigin();
  const funnels = await q<{ id: string; name: string }>("SELECT id, name FROM funnels WHERE project_id = $1 ORDER BY created_at", [id]);
  const sec = ["skrypt", "api", "import", "webhook"].includes(s ?? "") ? s : "skrypt";
  const tabs: [string, string, LucideIcon][] = [
    ["skrypt", "Skrypt na stronach", Code2],
    ["api", "Meta i WooCommerce", Plug],
    ["import", "Import plików", Upload],
    ["webhook", "Webhook", Webhook],
  ];
  return (
    <>
      <ToolHeader tool="dane" context={`${project.client_name} · ${project.name}`} />
      <nav className="sub-tabs">
        {tabs.map(([k, label, Icon]) => (
          <a key={k} href={`?s=${k}`} className={sec === k ? "on" : ""}>
            <Icon size={18} />
            <b>{label}</b>
          </a>
        ))}
      </nav>
      {sec === "skrypt" && <TrackingPanel projectId={id} origin={origin} trackingKey={project.tracking_key} funnels={funnels} />}
      {sec === "api" && <ApiConnections projectId={id} />}
      {sec === "import" && <ImportPanel projectId={id} />}
      {sec === "webhook" && <IntegrationsPanel projectId={id} origin={origin} />}
    </>
  );
}
