import Link from "next/link";
import { q } from "@/lib/db";
import { CreateForm } from "@/components/forms";

export default async function ClientsPage() {
  const clients = await q<{ id: string; name: string; notes: string; projects: string; funnels: string }>(
    `SELECT c.id, c.name, c.notes,
       (SELECT count(*) FROM projects p WHERE p.client_id = c.id) AS projects,
       (SELECT count(*) FROM funnels f JOIN projects p ON p.id = f.project_id WHERE p.client_id = c.id) AS funnels
     FROM clients c ORDER BY c.created_at`,
  );
  return (
    <main className="page">
      <h1>Klienci</h1>
      <p className="sub">Każdy klient ma własne projekty (np. strona, kampania), a w nich lejki.</p>
      <div className="card" style={{ marginBottom: 16 }} data-tour="create-client">
        <CreateForm url="/api/clients" fields={[{ name: "name", label: "Nazwa klienta", required: true }]} submitLabel="Dodaj klienta" goTo="/clients/" />
      </div>
      <div className="grid" data-tour="client-list">
        {clients.map((c) => (
          <Link key={c.id} href={`/clients/${c.id}`} className="card link">
            <h3>{c.name}</h3>
            <div className="meta">
              Projekty: {c.projects} · Lejki: {c.funnels}
            </div>
          </Link>
        ))}
      </div>
      {clients.length === 0 && <p className="hint">Brak klientów – dodaj pierwszego powyżej.</p>}
    </main>
  );
}
