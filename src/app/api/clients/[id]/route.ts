import { body, guarded, json, notFound, type Params } from "@/lib/api";
import { one } from "@/lib/db";

export const PATCH = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const { name, notes } = await body<{ name?: string; notes?: string }>(req);
  const row = await one(
    "UPDATE clients SET name = COALESCE($2, name), notes = COALESCE($3, notes) WHERE id = $1 RETURNING *",
    [id, name?.trim() || null, notes ?? null],
  );
  return row ? json(row) : notFound();
});

export const DELETE = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const row = await one("DELETE FROM clients WHERE id = $1 RETURNING id", [id]);
  return row ? json({ ok: true }) : notFound();
});
