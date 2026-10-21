import { body, guarded, json, notFound, type Params } from "@/lib/api";
import { newId, one } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { canProject } from "@/lib/access";

/** Kopiuje mapę lejka (bez danych ręcznych) – także do innego projektu/klienta. */
export const POST = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const { project_id, name } = await body<{ project_id?: string; name?: string }>(req);
  const src = await one<{ project_id: string; name: string; graph: unknown }>(
    "SELECT project_id, name, graph FROM funnels WHERE id = $1",
    [id],
  );
  if (!src) return notFound();
  if (project_id && !(await canProject((await currentUser())!, project_id))) return json({ error: "Brak uprawnień" }, 403);
  const row = await one(
    "INSERT INTO funnels (id, project_id, name, graph) VALUES ($1, $2, $3, $4::jsonb) RETURNING id, project_id, name",
    [newId(), project_id || src.project_id, name?.trim() || `${src.name} (kopia)`, typeof src.graph === "string" ? src.graph : JSON.stringify(src.graph)],
  );
  return json(row, 201);
});
