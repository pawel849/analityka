import { guarded, json, type Params } from "@/lib/api";
import { q } from "@/lib/db";

/** Unikalne nazwy produktów (z zamówień) i kampanii/reklam (z importu) – do sprawdzania reguł. */
export const GET = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const products = await q<{ name: string; n: string }>(
    `SELECT p->>'name' AS name, count(*) AS n FROM orders, jsonb_array_elements(products) p
     WHERE project_id = $1 GROUP BY 1 ORDER BY 2 DESC LIMIT 300`,
    [id],
  );
  const campaigns = await q<{ name: string; spend: number }>(
    `SELECT campaign AS name, sum(spend) AS spend FROM ad_rows WHERE project_id = $1 GROUP BY 1 ORDER BY 2 DESC LIMIT 300`,
    [id],
  );
  const ads = await q<{ name: string; spend: number }>(
    `SELECT ad AS name, sum(spend) AS spend FROM ad_rows WHERE project_id = $1 AND ad <> '' GROUP BY 1 ORDER BY 2 DESC LIMIT 300`,
    [id],
  );
  return json({
    products: products.map((r) => ({ name: r.name, count: Number(r.n) })),
    campaigns: campaigns.map((r) => ({ name: r.name, spend: Number(r.spend) })),
    ads: ads.map((r) => ({ name: r.name, spend: Number(r.spend) })),
  });
});
