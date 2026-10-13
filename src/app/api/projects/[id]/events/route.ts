import { guarded, json, type Params } from "@/lib/api";
import { q } from "@/lib/db";

/** Ostatnie zdarzenia – do sprawdzenia, czy skrypt śledzący działa. */
export const GET = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const rows = await q(
    `SELECT id, ts, type, name, path, utm_source, element, value, scroll, is_test
     FROM events WHERE project_id = $1 ORDER BY ts DESC LIMIT 50`,
    [id],
  );
  return json(rows);
});
