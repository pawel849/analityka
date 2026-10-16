import { q } from "@/lib/db";
import { ClientsHome, type HomeClient } from "@/components/home/ClientsHome";

export default async function ClientsPage() {
  const rows = await q<{ client_id: string; client_name: string; project_id: string | null; project_name: string | null }>(
    `SELECT c.id AS client_id, c.name AS client_name, p.id AS project_id, p.name AS project_name
     FROM clients c LEFT JOIN projects p ON p.client_id = c.id ORDER BY c.created_at, p.created_at`,
  );
  const clients: HomeClient[] = [];
  for (const r of rows) {
    let c = clients.find((x) => x.id === r.client_id);
    if (!c) clients.push((c = { id: r.client_id, name: r.client_name, projects: [] }));
    if (r.project_id) c.projects.push({ id: r.project_id, name: r.project_name ?? "" });
  }
  return (
    <main className="page">
      <ClientsHome clients={clients} />
    </main>
  );
}
