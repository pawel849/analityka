import { body, guarded, json } from "@/lib/api";
import { newId, one, q } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { clientIdsOf } from "@/lib/access";

export const GET = guarded(async () => {
  const ids = await clientIdsOf((await currentUser())!);
  return json(ids ? await q("SELECT * FROM clients WHERE id = ANY($1) ORDER BY created_at", [ids]) : await q("SELECT * FROM clients ORDER BY created_at"));
});

export const POST = guarded(async (req) => {
  const { name, notes } = await body<{ name?: string; notes?: string }>(req);
  if (!name?.trim()) return json({ error: "Podaj nazwę klienta" }, 400);
  const row = await one("INSERT INTO clients (id, name, notes) VALUES ($1, $2, $3) RETURNING *", [newId(), name.trim(), notes ?? ""]);
  return json(row, 201);
});
