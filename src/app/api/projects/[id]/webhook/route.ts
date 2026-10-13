import { guarded, json, notFound, type Params } from "@/lib/api";
import { one } from "@/lib/db";

/** Zwraca (lub tworzy) tajny klucz webhooka projektu. POST = wygeneruj nowy (stary przestaje działać). */
async function secretFor(id: string, rotate: boolean) {
  const row = await one<{ webhook_secret: string | null }>("SELECT webhook_secret FROM projects WHERE id = $1", [id]);
  if (!row) return null;
  if (row.webhook_secret && !rotate) return row.webhook_secret;
  const secret = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  await one("UPDATE projects SET webhook_secret = $2 WHERE id = $1 RETURNING id", [id, secret]);
  return secret;
}

export const GET = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const s = await secretFor(id, false);
  return s ? json({ secret: s }) : notFound();
});

export const POST = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const s = await secretFor(id, true);
  return s ? json({ secret: s }) : notFound();
});
