import { one, q } from "./db";
import { mergeSettings, type ProjectSettings } from "./settings";
import type { EconAd, EconOrder } from "./economics";

export async function loadSettings(projectId: string): Promise<ProjectSettings> {
  const row = await one<{ settings: unknown }>("SELECT settings FROM project_settings WHERE project_id = $1", [projectId]);
  const raw = typeof row?.settings === "string" ? JSON.parse(row.settings) : row?.settings;
  return mergeSettings(raw);
}

export async function loadOrders(projectId: string): Promise<EconOrder[]> {
  const rows = await q<{ order_ref: string; ts: Date | string; customer: string; gross: number; products: unknown }>(
    "SELECT order_ref, ts, customer, gross, products FROM orders WHERE project_id = $1 ORDER BY ts",
    [projectId],
  );
  return rows.map((r) => ({
    ref: r.order_ref,
    ts: new Date(r.ts).getTime(),
    customer: r.customer,
    gross: Number(r.gross),
    products: (typeof r.products === "string" ? JSON.parse(r.products) : r.products) as EconOrder["products"],
  }));
}

export interface AdRecord extends EconAd {
  /** Źródło importu (meta, meta_api, google_ads, ads_other). */
  source: string;
  adset: string;
  ad: string;
  impressions: number;
  clicks: number;
  video_3s: number;
  thruplay: number;
  registrations: number;
  purchases: number;
  purchase_value: number;
  title: string;
  body: string;
}

export async function loadAds(projectId: string, from?: string, to?: string): Promise<AdRecord[]> {
  const rows = await q<Record<string, unknown>>(
    `SELECT to_char(a.period_start, 'YYYY-MM-DD') AS start, to_char(a.period_end, 'YYYY-MM-DD') AS "end", a.campaign, a.adset, a.ad,
       a.spend, a.impressions, a.clicks, a.video_3s, a.thruplay, a.registrations, a.purchases, a.purchase_value, a.title, a.body, i.source
     FROM ad_rows a JOIN imports i ON i.id = a.import_id
     WHERE a.project_id = $1 AND ($2::date IS NULL OR a.period_end >= $2::date) AND ($3::date IS NULL OR a.period_start <= $3::date)
     ORDER BY a.period_start`,
    [projectId, from ?? null, to ?? null],
  );
  return rows.map((r) => ({
    start: String(r.start),
    end: String(r.end),
    source: String(r.source ?? ""),
    campaign: String(r.campaign ?? ""),
    adset: String(r.adset ?? ""),
    ad: String(r.ad ?? ""),
    spend: Number(r.spend),
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    video_3s: Number(r.video_3s),
    thruplay: Number(r.thruplay),
    registrations: Number(r.registrations),
    purchases: Number(r.purchases),
    purchase_value: Number(r.purchase_value),
    title: String(r.title ?? ""),
    body: String(r.body ?? ""),
  }));
}
