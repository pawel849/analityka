// Meta Ad Library API (ads_archive) – odczyt reklam z UE przez oficjalne API.
// Token: zmienna środowiskowa META_ADS_TOKEN (User Token z ads_read, przedłużony do 60 dni).

const GRAPH = "https://graph.facebook.com/v26.0/ads_archive";

const FIELDS = [
  "id", "page_id", "page_name", "ad_delivery_start_time", "ad_delivery_stop_time", "ad_creative_bodies",
  "ad_creative_link_titles", "ad_creative_link_captions", "ad_creative_link_descriptions", "ad_snapshot_url",
  "eu_total_reach", "publisher_platforms", "languages",
].join(",");

export type AdsLibraryQuery = {
  search_terms?: string;
  page_ids?: string[];
  countries?: string[];
  active_only?: boolean;
  limit?: number;
  after?: string;
};

export type AdRecord = {
  id: string;
  page_id: string;
  page_name: string;
  start: string | null;
  stop: string | null;
  bodies: string[];
  titles: string[];
  captions: string[];
  descriptions: string[];
  snapshot_url: string | null;
  eu_reach: number | null;
  platforms: string[];
  languages: string[];
};

export type AdsLibraryResult = { ads: AdRecord[]; next: string | null; count: number };

export async function searchAdsLibrary(qr: AdsLibraryQuery): Promise<AdsLibraryResult> {
  const token = process.env.META_ADS_TOKEN;
  if (!token) throw new Error("Brak META_ADS_TOKEN w zmiennych środowiskowych.");
  if (!qr.search_terms && !(qr.page_ids && qr.page_ids.length)) throw new Error("Podaj search_terms albo page_ids.");

  const u = new URL(GRAPH);
  u.searchParams.set("access_token", token);
  u.searchParams.set("ad_reached_countries", JSON.stringify(qr.countries?.length ? qr.countries : ["PL"]));
  u.searchParams.set("ad_type", "ALL");
  u.searchParams.set("ad_active_status", qr.active_only === false ? "ALL" : "ACTIVE");
  u.searchParams.set("fields", FIELDS);
  u.searchParams.set("limit", String(Math.min(Math.max(qr.limit ?? 50, 1), 100)));
  if (qr.search_terms) u.searchParams.set("search_terms", qr.search_terms);
  if (qr.page_ids?.length) u.searchParams.set("search_page_ids", qr.page_ids.join(","));
  if (qr.after) u.searchParams.set("after", qr.after);

  const res = await fetch(u, { cache: "no-store" });
  const json = (await res.json()) as {
    data?: Record<string, unknown>[];
    paging?: { cursors?: { after?: string }; next?: string };
    error?: { message?: string; code?: number; error_subcode?: number };
  };
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    throw new Error(`Meta API: ${e.message ?? res.statusText} (code ${e.code ?? res.status}${e.error_subcode ? `, subcode ${e.error_subcode}` : ""})`);
  }
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  const ads: AdRecord[] = (json.data ?? []).map((a) => ({
    id: String(a.id ?? ""),
    page_id: String(a.page_id ?? ""),
    page_name: String(a.page_name ?? ""),
    start: str(a.ad_delivery_start_time),
    stop: str(a.ad_delivery_stop_time),
    bodies: arr(a.ad_creative_bodies),
    titles: arr(a.ad_creative_link_titles),
    captions: arr(a.ad_creative_link_captions),
    descriptions: arr(a.ad_creative_link_descriptions),
    snapshot_url: str(a.ad_snapshot_url),
    eu_reach: typeof a.eu_total_reach === "number" ? a.eu_total_reach : null,
    platforms: arr(a.publisher_platforms),
    languages: arr(a.languages),
  }));
  return { ads, next: json.paging?.next ? (json.paging.cursors?.after ?? null) : null, count: ads.length };
}

/** Zbiera reklamy po stronie (page_id): liczba aktywnych, zakres dat, zasięg łączny, próbki tekstów, domeny z captionów. */
export function groupByPage(ads: AdRecord[]) {
  const map = new Map<string, { page_id: string; page_name: string; ads: number; first_start: string | null; last_start: string | null; eu_reach: number; domains: Set<string>; sample_bodies: string[] }>();
  for (const a of ads) {
    const g = map.get(a.page_id) ?? { page_id: a.page_id, page_name: a.page_name, ads: 0, first_start: null, last_start: null, eu_reach: 0, domains: new Set<string>(), sample_bodies: [] };
    g.ads += 1;
    if (a.start && (!g.first_start || a.start < g.first_start)) g.first_start = a.start;
    if (a.start && (!g.last_start || a.start > g.last_start)) g.last_start = a.start;
    g.eu_reach += a.eu_reach ?? 0;
    for (const c of a.captions) g.domains.add(c.toLowerCase().replace(/^https?:\/\//, "").split("/")[0]);
    if (g.sample_bodies.length < 2 && a.bodies[0]) g.sample_bodies.push(a.bodies[0].slice(0, 300));
    map.set(a.page_id, g);
  }
  return [...map.values()]
    .map((g) => ({ ...g, domains: [...g.domains].filter(Boolean) }))
    .sort((x, y) => y.ads - x.ads);
}
