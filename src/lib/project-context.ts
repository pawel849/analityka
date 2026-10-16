import { cache } from "react";
import { headers } from "next/headers";
import { one, q } from "./db";
import type { SetupState } from "./setup";

export interface ProjectContext {
  id: string;
  name: string;
  domain: string;
  tracking_key: string;
  client_id: string;
  client_name: string;
  setup: SetupState;
}

/** Projekt + klient (jedno zapytanie na żądanie, współdzielone przez układ i stronę). */
export const loadProject = cache(async (id: string): Promise<ProjectContext | null> => {
  const p = await one<ProjectContext & { setup: unknown }>(
    `SELECT p.id, p.name, p.domain, p.tracking_key, p.client_id, p.setup, c.name AS client_name
     FROM projects p JOIN clients c ON c.id = p.client_id WHERE p.id = $1`,
    [id],
  );
  if (!p) return null;
  return { ...p, setup: (typeof p.setup === "string" ? JSON.parse(p.setup) : p.setup ?? {}) as SetupState };
});

/** Wszyscy klienci i projekty – do przełącznika. */
export const loadSwitcher = cache(async () => {
  const rows = await q<{ client_id: string; client_name: string; project_id: string | null; project_name: string | null }>(
    `SELECT c.id AS client_id, c.name AS client_name, p.id AS project_id, p.name AS project_name
     FROM clients c LEFT JOIN projects p ON p.client_id = c.id ORDER BY c.created_at, p.created_at`,
  );
  const out: { id: string; name: string; projects: { id: string; name: string }[] }[] = [];
  for (const r of rows) {
    let c = out.find((x) => x.id === r.client_id);
    if (!c) out.push((c = { id: r.client_id, name: r.client_name, projects: [] }));
    if (r.project_id) c.projects.push({ id: r.project_id, name: r.project_name ?? "" });
  }
  return out;
});

export async function requestOrigin(): Promise<string> {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
}
