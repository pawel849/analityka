import Link from "next/link";
import { q } from "@/lib/db";
import { CreateForm } from "@/components/forms";
import { TOOLS } from "@/lib/nav";

export default async function ClientsPage() {
  const rows = await q<{ client_id: string; client_name: string; project_id: string | null; project_name: string | null; domain: string | null }>(
    `SELECT c.id AS client_id, c.name AS client_name, p.id AS project_id, p.name AS project_name, p.domain
     FROM clients c LEFT JOIN projects p ON p.client_id = c.id ORDER BY c.created_at, p.created_at`,
  );
  const clients: { id: string; name: string; projects: { id: string; name: string; domain: string }[] }[] = [];
  for (const r of rows) {
    let c = clients.find((x) => x.id === r.client_id);
    if (!c) clients.push((c = { id: r.client_id, name: r.client_name, projects: [] }));
    if (r.project_id) c.projects.push({ id: r.project_id, name: r.project_name ?? "", domain: r.domain ?? "" });
  }
  return (
    <main className="page">
      <h1>Analityka</h1>
      <p className="sub">Narzędzie, które pokazuje, skąd przychodzą klienci, gdzie odpadają po drodze i czy reklamy się opłacają.</p>

      <section className="how-it-works">
        <div>
          <span className="step-n">1</span>
          <b>Wybierz klienta i projekt</b>
          <span>Projekt = jedna strona / oferta klienta z własnymi danymi. Dane każdego klienta są oddzielone.</span>
        </div>
        <div>
          <span className="step-n">2</span>
          <b>Podłącz dane</b>
          <span>Skrypt na stronach, Meta Ads i sklep przez API albo pliki CSV. Przewodnik przeprowadzi Cię krok po kroku.</span>
        </div>
        <div>
          <span className="step-n">3</span>
          <b>Używaj narzędzi</b>
          <span>{TOOLS.filter((t) => t.section === "narzedzia").map((t) => t.label).join(" · ")} – te same dla każdego klienta.</span>
        </div>
      </section>

      <div className="row" style={{ justifyContent: "space-between", marginTop: 24 }}>
        <h2 style={{ margin: 0 }}>Klienci</h2>
      </div>
      <div className="grid" data-tour="client-list" style={{ marginTop: 10 }}>
        {clients.map((c) => (
          <div key={c.id} className="card client-card">
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h3 style={{ margin: 0 }}>{c.name}</h3>
              <Link href={`/clients/${c.id}`} className="hint">zarządzaj</Link>
            </div>
            {c.projects.map((p) => (
              <Link key={p.id} href={`/projects/${p.id}`} className="client-proj">
                <span>{p.name}</span>
                <span className="hint">{p.domain || "otwórz →"}</span>
              </Link>
            ))}
            {!c.projects.length && (
              <Link href={`/clients/${c.id}`} className="hint">Brak projektów – dodaj pierwszy →</Link>
            )}
          </div>
        ))}
      </div>
      {clients.length === 0 && <p className="hint">Brak klientów – dodaj pierwszego poniżej.</p>}
      <div className="card" style={{ marginTop: 16 }} data-tour="create-client">
        <CreateForm url="/api/clients" fields={[{ name: "name", label: "Nowy klient (nazwa firmy)", required: true }]} submitLabel="Dodaj klienta" goTo="/clients/" />
      </div>
    </main>
  );
}
