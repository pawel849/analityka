// Pulpit projektu: stan źródeł danych i najważniejsze liczby (cały projekt, bez zawężeń).
import { one, q } from "./db";
import { loadAds } from "./project-data";
import { spendBetween } from "./economics";

const DAY = 86400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export interface SourceStatus {
  key: string;
  label: string;
  state: "ok" | "warn" | "off";
  detail: string;
  fix?: string; // ścieżka podstrony z instrukcją
}

export async function dashboard(projectId: string) {
  const now = Date.now();
  const to = iso(now);
  const from = iso(now - 29 * DAY);
  const pFrom = iso(now - 59 * DAY);
  const pTo = iso(now - 30 * DAY);

  const [ev7, lastEv, integrations, orders, ads, funnels, tests, visitors, prevVisitors, ordersNow, ordersPrev] = await Promise.all([
    one<{ n: string }>("SELECT count(*) AS n FROM events WHERE project_id = $1 AND NOT is_test AND ts >= now() - interval '7 days'", [projectId]),
    one<{ last: string | null }>("SELECT max(ts) AS last FROM events WHERE project_id = $1 AND NOT is_test AND origin = 'script'", [projectId]),
    q<{ provider: string; name: string; status: string; last_sync_at: string | null; last_error: string }>(
      "SELECT provider, name, status, last_sync_at, last_error FROM integrations WHERE project_id = $1 ORDER BY created_at",
      [projectId],
    ),
    one<{ n: string; last: string | null }>("SELECT count(*) AS n, max(ts) AS last FROM orders WHERE project_id = $1", [projectId]),
    one<{ n: string; last: string | null }>("SELECT count(*) AS n, to_char(max(period_end), 'YYYY-MM-DD') AS last FROM ad_rows WHERE project_id = $1", [projectId]),
    one<{ n: string }>("SELECT count(*) AS n FROM funnels WHERE project_id = $1", [projectId]),
    one<{ n: string }>("SELECT count(*) AS n FROM ad_tests WHERE project_id = $1 AND status <> 'zakończony'", [projectId]).catch(() => ({ n: "0" })),
    one<{ n: string }>(
      "SELECT count(DISTINCT visitor_id) AS n FROM events WHERE project_id = $1 AND NOT is_test AND type = 'pageview' AND ts >= $2::date AND ts < ($3::date + 1)",
      [projectId, from, to],
    ),
    one<{ n: string }>(
      "SELECT count(DISTINCT visitor_id) AS n FROM events WHERE project_id = $1 AND NOT is_test AND type = 'pageview' AND ts >= $2::date AND ts < ($3::date + 1)",
      [projectId, pFrom, pTo],
    ),
    one<{ n: string; gross: string | null }>("SELECT count(*) AS n, sum(gross) AS gross FROM orders WHERE project_id = $1 AND ts >= $2::date AND ts < ($3::date + 1)", [projectId, from, to]),
    one<{ n: string; gross: string | null }>("SELECT count(*) AS n, sum(gross) AS gross FROM orders WHERE project_id = $1 AND ts >= $2::date AND ts < ($3::date + 1)", [projectId, pFrom, pTo]),
  ]);
  const adRows = await loadAds(projectId, pFrom, to);
  const spend = spendBetween(adRows, from, to);
  const prevSpend = spendBetween(adRows, pFrom, pTo);

  const sources: SourceStatus[] = [];
  const e7 = Number(ev7?.n ?? 0);
  sources.push({
    key: "script",
    label: "Skrypt na stronach",
    state: e7 > 0 ? "ok" : lastEv?.last ? "warn" : "off",
    detail: e7 > 0 ? `${e7.toLocaleString("pl-PL")} zdarzeń w 7 dni` : lastEv?.last ? `brak zdarzeń od ${new Date(lastEv.last).toLocaleDateString("pl-PL")}` : "nie zainstalowany",
    fix: "dane?s=skrypt",
  });
  for (const p of ["meta", "woocommerce"] as const) {
    const it = integrations.filter((i) => i.provider === p);
    const label = p === "meta" ? "Meta Ads (API)" : "WooCommerce (API)";
    if (!it.length) {
      sources.push({ key: p, label, state: "off", detail: "nie podłączone", fix: "dane?s=api" });
      continue;
    }
    const bad = it.find((i) => i.status === "error");
    const last = it.map((i) => i.last_sync_at).filter(Boolean).sort().pop();
    sources.push({
      key: p,
      label,
      state: bad ? "warn" : "ok",
      detail: bad ? `błąd: ${bad.last_error.slice(0, 120)}` : last ? `synchronizacja ${new Date(last).toLocaleString("pl-PL")}` : "jeszcze nie synchronizowano",
      fix: "dane?s=api",
    });
  }
  const nOrders = Number(orders?.n ?? 0);
  const nAds = Number(ads?.n ?? 0);
  sources.push({
    key: "orders",
    label: "Zamówienia",
    state: nOrders ? "ok" : "off",
    detail: nOrders ? `${nOrders.toLocaleString("pl-PL")} zamówień, ostatnie ${orders?.last ? new Date(orders.last).toLocaleDateString("pl-PL") : "—"}` : "brak – podłącz sklep lub zaimportuj plik",
    fix: "dane?s=api",
  });
  sources.push({
    key: "ads",
    label: "Koszty reklam",
    state: nAds ? "ok" : "off",
    detail: nAds ? `${nAds.toLocaleString("pl-PL")} wierszy, do ${ads?.last ?? "—"}` : "brak – podłącz Meta lub zaimportuj plik",
    fix: "dane?s=api",
  });

  const gross = Number(ordersNow?.gross ?? 0);
  const prevGross = Number(ordersPrev?.gross ?? 0);
  return {
    range: { from, to },
    sources,
    counts: { funnels: Number(funnels?.n ?? 0), activeTests: Number(tests?.n ?? 0) },
    kpis: {
      visitors: { now: Number(visitors?.n ?? 0), prev: Number(prevVisitors?.n ?? 0) },
      orders: { now: Number(ordersNow?.n ?? 0), prev: Number(ordersPrev?.n ?? 0) },
      revenue: { now: gross, prev: prevGross },
      spend: { now: spend, prev: prevSpend },
      roas: { now: spend ? gross / spend : null, prev: prevSpend ? prevGross / prevSpend : null },
    },
  };
}
