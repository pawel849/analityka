import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { one, q } from "@/lib/db";
import { CreateForm, DeleteButton } from "@/components/forms";
import { ApiConnections } from "@/components/ApiConnections";
import { ReopenSetup, SetupChoice, SetupWizard } from "@/components/setup/SetupWizard";
import type { SetupState } from "@/lib/setup";
import { TrackingPanel } from "@/components/TrackingPanel";
import { MonitorPanel } from "@/components/MonitorPanel";
import { IntegrationsPanel } from "@/components/IntegrationsPanel";
import { ImportPanel } from "@/components/data/ImportPanel";
import { EconomicsPanel } from "@/components/data/EconomicsPanel";
import { TimelinePanel } from "@/components/data/TimelinePanel";
import { SettingsPanel } from "@/components/data/SettingsPanel";

const TABS = [
  ["lejki", "Lejki i monitor"],
  ["dane", "Dane (import)"],
  ["ekonomia", "Ekonomia"],
  ["os", "Oś czasu"],
  ["ustawienia", "Ustawienia klienta"],
  ["integracje", "Skrypt i integracje"],
] as const;

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const project = await one<{ id: string; name: string; domain: string; tracking_key: string; client_id: string; client_name: string; setup: unknown }>(
    `SELECT p.*, c.name AS client_name FROM projects p JOIN clients c ON c.id = p.client_id WHERE p.id = $1`,
    [id],
  );
  if (!project) notFound();
  const setup = (typeof project.setup === "string" ? JSON.parse(project.setup) : project.setup ?? {}) as SetupState;
  const guided = setup.mode === "guided" && !setup.hidden;
  const tabs: (readonly [string, string])[] = guided ? [["start", "Zbuduj ze mną"], ...TABS] : [...TABS];
  const tab = tabs.some(([k]) => k === rawTab) ? rawTab! : guided && !setup.done ? "start" : "lejki";
  const funnels = await q<{ id: string; name: string; updated_at: string; nodes: string }>(
    `SELECT id, name, updated_at, jsonb_array_length(graph->'nodes') AS nodes FROM funnels WHERE project_id = $1 ORDER BY created_at`,
    [id],
  );
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const origin = `${proto}://${h.get("host")}`;

  return (
    <main className="page">
      <div className="crumbs">
        <Link href="/">Klienci</Link> / <Link href={`/clients/${project.client_id}`}>{project.client_name}</Link> /
      </div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>{project.name}</h1>
        <DeleteButton url={`/api/projects/${id}`} confirmText={`Usunąć projekt „${project.name}” razem z lejkami i danymi?`} goTo={`/clients/${project.client_id}`} />
      </div>
      <p className="sub">{project.domain || "bez domeny"}</p>

      <nav className="page-tabs">
        {tabs.map(([k, label]) => (
          <Link key={k} href={`/projects/${id}?tab=${k}`} className={tab === k ? "on" : ""} data-tour={`tab-${k}`}>
            {label}
          </Link>
        ))}
      </nav>

      {tab === "start" && guided && (
        <SetupWizard projectId={id} origin={origin} trackingKey={project.tracking_key} initial={setup} />
      )}
      {tab === "lejki" && !setup.mode && <SetupChoice projectId={id} />}
      {tab === "lejki" && (
        <>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2>Lejki</h2>
            {setup.mode && !guided && <ReopenSetup projectId={id} />}
          </div>
          <div className="card" style={{ marginBottom: 16 }}>
            <CreateForm url="/api/funnels" extra={{ project_id: id }} fields={[{ name: "name", label: "Nazwa lejka", required: true }]} submitLabel="Nowy lejek" goTo="/funnels/" />
          </div>
          <div className="grid">
            {funnels.map((f) => (
              <Link key={f.id} href={`/funnels/${f.id}`} className="card link">
                <h3>{f.name}</h3>
                <div className="meta">Elementów: {f.nodes} · Zmieniono: {new Date(f.updated_at).toLocaleString("pl-PL")}</div>
              </Link>
            ))}
          </div>
          <div className="section">
            <MonitorPanel projectId={id} />
          </div>
        </>
      )}
      {tab === "dane" && <ImportPanel projectId={id} />}
      {tab === "ekonomia" && <EconomicsPanel projectId={id} />}
      {tab === "os" && <TimelinePanel projectId={id} />}
      {tab === "ustawienia" && <SettingsPanel projectId={id} />}
      {tab === "integracje" && (
        <>
          <ApiConnections projectId={id} />
          <TrackingPanel projectId={id} origin={origin} trackingKey={project.tracking_key} funnels={funnels.map((f) => ({ id: f.id, name: f.name }))} />
          <div className="section">
            <IntegrationsPanel projectId={id} origin={origin} />
          </div>
        </>
      )}
    </main>
  );
}
