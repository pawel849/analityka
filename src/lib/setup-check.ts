import { one, q } from "./db";

/** Stan danych projektu dla przewodnika (bez danych testowych): co już dociera ze stron, linków, formularzy, zakupów i reklam. */
export async function setupCheck(id: string) {
  const [total, paths, hosts, utm, forms, purchases, orders, ads, integrations, funnels] = await Promise.all([
    one<{ n: string; last: string | null }>("SELECT count(*) AS n, max(ts) AS last FROM events WHERE project_id = $1 AND NOT is_test", [id]),
    q<{ path: string; url: string; n: string; last: string }>(
      `SELECT path, max(url) AS url, count(*) AS n, max(ts) AS last FROM events
       WHERE project_id = $1 AND NOT is_test AND type = 'pageview' GROUP BY path ORDER BY max(ts) DESC LIMIT 300`,
      [id],
    ),
    q<{ host: string; n: string }>(
      `SELECT lower(split_part(url, '/', 3)) AS host, count(*) AS n FROM events
       WHERE project_id = $1 AND NOT is_test AND type = 'pageview' GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,
      [id],
    ),
    q<{ source: string; medium: string; n: string; last: string }>(
      `SELECT lower(utm_source) AS source, lower(max(utm_medium)) AS medium, count(DISTINCT visitor_id) AS n, max(ts) AS last FROM events
       WHERE project_id = $1 AND NOT is_test AND type = 'pageview' AND utm_source <> '' GROUP BY 1 ORDER BY 3 DESC LIMIT 50`,
      [id],
    ),
    q<{ path: string; n: string; last: string }>(
      `SELECT path, count(*) AS n, max(ts) AS last FROM events
       WHERE project_id = $1 AND NOT is_test AND type IN ('form_submit', 'lead') GROUP BY path ORDER BY 2 DESC LIMIT 50`,
      [id],
    ),
    q<{ origin: string; n: string; last: string }>(
      "SELECT origin, count(*) AS n, max(ts) AS last FROM events WHERE project_id = $1 AND NOT is_test AND type = 'purchase' GROUP BY origin",
      [id],
    ),
    q<{ source: string; n: string; last: string }>("SELECT source, count(*) AS n, max(ts) AS last FROM orders WHERE project_id = $1 GROUP BY source", [id]),
    q<{ source: string; n: string; last: string | null }>(
      `SELECT i.source, count(*) AS n, to_char(max(a.period_end), 'YYYY-MM-DD') AS last FROM ad_rows a JOIN imports i ON i.id = a.import_id
       WHERE a.project_id = $1 GROUP BY i.source`,
      [id],
    ),
    q<{ id: string; provider: string; name: string; status: string; last_error: string }>(
      "SELECT id, provider, name, status, last_error FROM integrations WHERE project_id = $1 ORDER BY created_at",
      [id],
    ),
    q<{ id: string; name: string }>("SELECT id, name FROM funnels WHERE project_id = $1 ORDER BY created_at", [id]),
  ]);
  const num = <T extends { n: string }>(rows: T[]) => rows.map((r) => ({ ...r, n: Number(r.n) }));
  return {
    events: Number(total?.n ?? 0),
    lastEvent: total?.last ?? null,
    paths: num(paths),
    hosts: num(hosts),
    utm: num(utm),
    forms: num(forms),
    purchases: num(purchases),
    orders: num(orders),
    ads: num(ads),
    integrations,
    funnels,
  };
}

export type SetupCheck = Awaited<ReturnType<typeof setupCheck>>;
