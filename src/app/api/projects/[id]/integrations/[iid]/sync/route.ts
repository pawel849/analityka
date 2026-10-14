import { guarded, json, notFound, type Params } from "@/lib/api";
import { one } from "@/lib/db";
import { runSync } from "@/lib/sync/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = guarded(async (_req, { params }: Params<"id" | "iid">) => {
  const { id, iid } = await params;
  const row = await one("SELECT id FROM integrations WHERE id = $1 AND project_id = $2", [iid, id]);
  if (!row) return notFound();
  try {
    return json(await runSync(iid));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 502);
  }
});
