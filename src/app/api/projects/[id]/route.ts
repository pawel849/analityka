import { body, guarded, json, notFound, type Params } from "@/lib/api";
import { one } from "@/lib/db";
import { forgetProjectKey } from "@/lib/collect";

export const PATCH = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const { name, domain } = await body<{ name?: string; domain?: string }>(req);
  const row = await one(
    "UPDATE projects SET name = COALESCE($2, name), domain = COALESCE($3, domain) WHERE id = $1 RETURNING *",
    [id, name?.trim() || null, domain ?? null],
  );
  return row ? json(row) : notFound();
});

export const DELETE = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const row = await one<{ tracking_key: string }>("DELETE FROM projects WHERE id = $1 RETURNING tracking_key", [id]);
  if (!row) return notFound();
  forgetProjectKey(row.tracking_key);
  return json({ ok: true });
});
