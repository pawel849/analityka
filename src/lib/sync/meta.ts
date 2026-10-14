// Meta Marketing API → wiersze reklam (dziennie, poziom reklamy).
// Nazwy typów akcji to te, których Meta używa w polu `actions`; pierwszy znaleziony z listy wygrywa,
// żeby nie liczyć tej samej konwersji kilka razy (np. „omni_purchase” i „offsite_conversion.fb_pixel_purchase”).
import type { AdRow } from "../importing.ts";

export const META_DEFAULT_VERSION = "v26.0";

export interface MetaAction {
  action_type: string;
  value: string;
}

export interface MetaInsight {
  date_start: string;
  date_stop: string;
  campaign_name?: string;
  adset_name?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  inline_link_clicks?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
  video_thruplay_watched_actions?: MetaAction[];
}

export const META_FIELDS = [
  "date_start", "date_stop", "campaign_name", "adset_name", "ad_name", "spend", "impressions", "reach", "inline_link_clicks",
  "actions", "action_values", "video_thruplay_watched_actions",
].join(",");

const ACTIONS = {
  video_3s: ["video_view"],
  landing_views: ["landing_page_view", "omni_landing_page_view"],
  registrations: ["omni_complete_registration", "complete_registration", "offsite_conversion.fb_pixel_complete_registration", "lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"],
  add_to_cart: ["omni_add_to_cart", "add_to_cart", "offsite_conversion.fb_pixel_add_to_cart"],
  checkouts: ["omni_initiated_checkout", "initiate_checkout", "offsite_conversion.fb_pixel_initiate_checkout"],
  purchases: ["omni_purchase", "purchase", "offsite_conversion.fb_pixel_purchase"],
} as const;

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

function pick(list: MetaAction[] | undefined, types: readonly string[]): number {
  if (!list?.length) return 0;
  for (const t of types) {
    const a = list.find((x) => x.action_type === t);
    if (a) return n(a.value);
  }
  return 0;
}

export function metaInsightToAdRow(r: MetaInsight): AdRow {
  return {
    period_start: r.date_start,
    period_end: r.date_stop || r.date_start,
    campaign: r.campaign_name ?? "",
    adset: r.adset_name ?? "",
    ad: r.ad_name ?? "",
    spend: n(r.spend),
    impressions: n(r.impressions),
    reach: n(r.reach),
    clicks: n(r.inline_link_clicks),
    video_3s: pick(r.actions, ACTIONS.video_3s),
    thruplay: pick(r.video_thruplay_watched_actions, ["video_view"]),
    landing_views: pick(r.actions, ACTIONS.landing_views),
    registrations: pick(r.actions, ACTIONS.registrations),
    add_to_cart: pick(r.actions, ACTIONS.add_to_cart),
    checkouts: pick(r.actions, ACTIONS.checkouts),
    purchases: pick(r.actions, ACTIONS.purchases),
    purchase_value: pick(r.action_values, ACTIONS.purchases),
    title: "",
    body: "",
  };
}

export function normalizeAccountId(v: string): string {
  const id = v.trim().replace(/^act_/i, "");
  if (!/^\d{5,25}$/.test(id)) throw new Error("ID konta reklamowego to same cyfry (np. 1234567890, bez „act_”).");
  return id;
}

type Fetch = typeof fetch;

/** Pobiera dzienne wiersze dla zakresu dat (włącznie). Rzuca błąd z komunikatem Meta. */
export async function fetchMetaInsights(
  opts: { accountId: string; token: string; version: string; since: string; until: string },
  doFetch: Fetch = fetch,
): Promise<{ rows: MetaInsight[]; actionTypes: string[] }> {
  const params = new URLSearchParams({
    level: "ad",
    time_increment: "1",
    time_range: JSON.stringify({ since: opts.since, until: opts.until }),
    fields: META_FIELDS,
    limit: "500",
    access_token: opts.token,
  });
  // META_GRAPH_BASE – tylko do testów lokalnych (atrapa API).
  const base = process.env.META_GRAPH_BASE || "https://graph.facebook.com";
  let url: string | null = `${base}/${opts.version}/act_${normalizeAccountId(opts.accountId)}/insights?${params}`;
  const rows: MetaInsight[] = [];
  const types = new Set<string>();
  for (let page = 0; url && page < 200; page++) {
    const res = await doFetch(url, { signal: AbortSignal.timeout(25_000) });
    const data = (await res.json().catch(() => ({}))) as { data?: MetaInsight[]; paging?: { next?: string }; error?: { message?: string; code?: number } };
    if (!res.ok || data.error) {
      const m = data.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`Meta API: ${m}${data.error?.code ? ` (kod ${data.error.code})` : ""}`);
    }
    for (const r of data.data ?? []) {
      rows.push(r);
      for (const a of r.actions ?? []) types.add(a.action_type);
    }
    url = data.paging?.next ?? null;
  }
  return { rows, actionTypes: [...types].sort() };
}
