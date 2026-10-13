import { body, guarded, json } from "@/lib/api";
import { newId, newKey, one } from "@/lib/db";

export const POST = guarded(async (req) => {
  const { client_id, name, domain } = await body<{ client_id?: string; name?: string; domain?: string }>(req);
  if (!client_id || !name?.trim()) return json({ error: "Podaj nazwę projektu" }, 400);
  const row = await one(
    "INSERT INTO projects (id, client_id, name, domain, tracking_key) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [newId(), client_id, name.trim(), (domain ?? "").trim(), newKey()],
  );
  return json(row, 201);
});
