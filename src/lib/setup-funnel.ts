import { newId, one } from "./db";
import { buildSetupGraph, type SetupState } from "./setup";

/** Buduje mapę lejka z odpowiedzi przewodnika: nowy lejek albo nadpisanie lejka utworzonego wcześniej przez przewodnik. */
export async function buildFunnelFromSetup(projectId: string, name?: string) {
  const row = await one<{ setup: unknown }>("SELECT setup FROM projects WHERE id = $1", [projectId]);
  if (!row) throw new Error("Nie znaleziono projektu");
  const setup = (typeof row.setup === "string" ? JSON.parse(row.setup) : row.setup) as SetupState;
  if (!setup.pages?.length) throw new Error("Najpierw dodaj strony lejka (krok „Strony”).");
  const graph = { ...buildSetupGraph(setup), meta: { notes: "Mapa zbudowana przez przewodnik „Zbuduj ze mną”. Możesz ją dowolnie zmieniać." } };
  const existing = setup.funnelId ? await one<{ id: string }>("SELECT id FROM funnels WHERE id = $1 AND project_id = $2", [setup.funnelId, projectId]) : null;
  let funnelId: string;
  if (existing) {
    funnelId = existing.id;
    await one("UPDATE funnels SET graph = $2::jsonb, updated_at = now() WHERE id = $1 RETURNING id", [funnelId, JSON.stringify(graph)]);
  } else {
    funnelId = newId();
    await one("INSERT INTO funnels (id, project_id, name, graph) VALUES ($1, $2, $3, $4::jsonb) RETURNING id", [
      funnelId, projectId, (name ?? "").trim() || "Mój lejek", JSON.stringify(graph),
    ]);
    await one("UPDATE projects SET setup = setup || $2::jsonb WHERE id = $1 RETURNING id", [projectId, JSON.stringify({ funnelId })]);
  }
  return { funnelId, nodes: graph.nodes.length, edges: graph.edges.length, rebuilt: !!existing };
}
