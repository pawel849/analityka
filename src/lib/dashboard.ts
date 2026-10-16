// Stan źródeł danych projektu (Źródła danych).
import { one, q } from "./db";

export interface SourceStatus {
  key: string;
  label: string;
  state: "ok" | "warn" | "off";
  detail: string;
  fix?: string; // ścieżka podstrony z instrukcją
}

export async function dataSources(projectId: string): Promise<SourceStatus[]> {
  const [ev7, lastEv, integrations, orders, ads] = await Promise.all([
    one<{ n: string }>("SELECT count(*) AS n FROM events WHERE project_id = $1 AND NOT is_test AND ts >= now() - interval '7 days'", [projectId]),
    one<{ last: string | null }>("SELECT max(ts) AS last FROM events WHERE project_id = $1 AND NOT is_test AND origin = 'script'", [projectId]),
    q<{ provider: string; name: string; status: string; last_sync_at: string | null; last_error: string }>(
      "SELECT provider, name, status, last_sync_at, last_error FROM integrations WHERE project_id = $1 ORDER BY created_at",
      [projectId],
    ),
    one<{ n: string; last: string | null }>("SELECT count(*) AS n, max(ts) AS last FROM orders WHERE project_id = $1", [projectId]),
    one<{ n: string; last: string | null }>("SELECT count(*) AS n, to_char(max(period_end), 'YYYY-MM-DD') AS last FROM ad_rows WHERE project_id = $1", [projectId]),
  ]);
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

  return sources;
}
