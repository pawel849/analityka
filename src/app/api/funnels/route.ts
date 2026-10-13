import { body, guarded, json } from "@/lib/api";
import { newId, one } from "@/lib/db";

export const POST = guarded(async (req) => {
  const { project_id, name } = await body<{ project_id?: string; name?: string }>(req);
  if (!project_id || !name?.trim()) return json({ error: "Podaj nazwę lejka" }, 400);
  const row = await one(
    "INSERT INTO funnels (id, project_id, name) VALUES ($1, $2, $3) RETURNING id, project_id, name",
    [newId(), project_id, name.trim()],
  );
  return json(row, 201);
});
