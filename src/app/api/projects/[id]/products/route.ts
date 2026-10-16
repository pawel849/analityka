import { guarded, json, type Params } from "@/lib/api";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Nazwy produktów z zamówień projektu (do wyboru produktu głównego). */
export const GET = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const rows = await q<{ name: string; n: string; paid: string; gross: string | null }>(
    `SELECT p->>'name' AS name, count(*) AS n,
            count(*) FILTER (WHERE coalesce((p->>'price')::numeric, 0) > 0) AS paid,
            sum(coalesce((p->>'price')::numeric, 0)) AS gross
     FROM orders o, jsonb_array_elements(o.products) p
     WHERE o.project_id = $1 AND coalesce(p->>'name', '') <> '' GROUP BY 1 ORDER BY 3 DESC, 2 DESC LIMIT 300`,
    [id],
  );
  // paid = sztuki sprzedane za > 0 zł (darmowe dodatki i bonusy mają 0)
  return json(rows.map((r) => ({ name: r.name, count: Number(r.n), paid: Number(r.paid), gross: Number(r.gross ?? 0) })));
});
