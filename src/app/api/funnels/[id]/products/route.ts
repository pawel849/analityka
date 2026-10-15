import { guarded, json, notFound, type Params } from "@/lib/api";
import { one, q } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Nazwy produktów do wyboru w węźle „Zakup”: z zamówień projektu (import / WooCommerce), najczęstsze najpierw. */
export const GET = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const f = await one<{ project_id: string }>("SELECT project_id FROM funnels WHERE id = $1", [id]);
  if (!f) return notFound();
  const rows = await q<{ name: string; n: string; last: string }>(
    `SELECT p->>'name' AS name, count(*) AS n, max(o.ts) AS last
     FROM orders o, jsonb_array_elements(o.products) p
     WHERE o.project_id = $1 AND coalesce(p->>'name', '') <> ''
     GROUP BY 1 ORDER BY count(*) DESC LIMIT 300`,
    [f.project_id],
  );
  return json(rows.map((r) => ({ name: r.name, count: Number(r.n), last: r.last })));
});
