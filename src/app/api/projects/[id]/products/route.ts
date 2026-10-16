import { guarded, json, type Params } from "@/lib/api";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Nazwy produktów z zamówień projektu (do wyboru produktu głównego). */
export const GET = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const rows = await q<{ name: string; n: string }>(
    `SELECT p->>'name' AS name, count(*) AS n FROM orders o, jsonb_array_elements(o.products) p
     WHERE o.project_id = $1 AND coalesce(p->>'name', '') <> '' GROUP BY 1 ORDER BY count(*) DESC LIMIT 300`,
    [id],
  );
  return json(rows.map((r) => ({ name: r.name, count: Number(r.n) })));
});
