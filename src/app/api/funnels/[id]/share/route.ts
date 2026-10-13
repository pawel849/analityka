import { body, guarded, json, notFound, type Params } from "@/lib/api";
import { one } from "@/lib/db";

/** Włącza/wyłącza publiczny link tylko do odczytu. */
export const POST = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const { enable } = await body<{ enable?: boolean }>(req);
  const token = enable ? crypto.randomUUID().replace(/-/g, "") : null;
  const row = await one<{ share_token: string | null }>(
    "UPDATE funnels SET share_token = $2 WHERE id = $1 RETURNING share_token",
    [id, token],
  );
  return row ? json({ token: row.share_token }) : notFound();
});

export const GET = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const row = await one<{ share_token: string | null }>("SELECT share_token FROM funnels WHERE id = $1", [id]);
  return row ? json({ token: row.share_token }) : notFound();
});
