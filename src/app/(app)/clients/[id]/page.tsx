import Link from "next/link";
import { notFound } from "next/navigation";
import { one, q } from "@/lib/db";
import { viewerCanClient } from "@/lib/access";
import { isAdmin } from "@/lib/auth";
import { CreateForm, DeleteButton } from "@/components/forms";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await one<{ id: string; name: string }>("SELECT id, name FROM clients WHERE id = $1", [id]);
  if (!client || !(await viewerCanClient(client.id))) notFound();
  const projects = await q<{ id: string; name: string; domain: string; funnels: string; events: string }>(
    `SELECT p.id, p.name, p.domain,
       (SELECT count(*) FROM funnels f WHERE f.project_id = p.id) AS funnels,
       (SELECT count(*) FROM events e WHERE e.project_id = p.id AND e.ts > now() - interval '30 days') AS events
     FROM projects p WHERE p.client_id = $1 ORDER BY p.created_at`,
    [id],
  );
  return (
    <main className="page">
      <div className="crumbs"><Link href="/">Klienci</Link> /</div>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>{client.name}</h1>
        {(await isAdmin()) && <DeleteButton url={`/api/clients/${id}`} confirmText={`Usunąć klienta „${client.name}” razem z projektami, lejkami i danymi?`} goTo="/" />}
      </div>
      <p className="sub">Projekt = jedno miejsce zbierania danych (jeden skrypt śledzący), np. domena klienta.</p>
      <div className="card" style={{ marginBottom: 16 }}>
        <CreateForm
          url="/api/projects"
          extra={{ client_id: id }}
          fields={[
            { name: "name", label: "Nazwa projektu", required: true },
            { name: "domain", label: "Domena (np. klient.pl)" },
          ]}
          submitLabel="Dodaj projekt"
          goTo="/projects/"
        />
      </div>
      <div className="grid">
        {projects.map((p) => (
          <Link key={p.id} href={`/projects/${p.id}`} className="card link">
            <h3>{p.name}</h3>
            <div className="meta">{p.domain || "bez domeny"}</div>
            <div className="meta">Lejki: {p.funnels} · Zdarzenia (30 dni): {p.events}</div>
          </Link>
        ))}
      </div>
    </main>
  );
}
