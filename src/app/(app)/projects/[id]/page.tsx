import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { one, q } from "@/lib/db";
import { CreateForm, DeleteButton } from "@/components/forms";
import { TrackingPanel } from "@/components/TrackingPanel";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await one<{ id: string; name: string; domain: string; tracking_key: string; client_id: string; client_name: string }>(
    `SELECT p.*, c.name AS client_name FROM projects p JOIN clients c ON c.id = p.client_id WHERE p.id = $1`,
    [id],
  );
  if (!project) notFound();
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

      <h2>Lejki</h2>
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
        <TrackingPanel projectId={id} origin={origin} trackingKey={project.tracking_key} funnels={funnels.map((f) => ({ id: f.id, name: f.name }))} />
      </div>
    </main>
  );
}
