// WooCommerce REST API (wc/v3) → zamówienia.
import { createHash } from "node:crypto";
import type { OrderIn } from "../import-store.ts";

export const WOO_DEFAULT_PAID = "processing,completed";

export interface WooOrder {
  id: number;
  number?: string;
  status: string;
  currency?: string;
  date_created_gmt?: string | null;
  date_paid_gmt?: string | null;
  date_modified_gmt?: string | null;
  total?: string;
  billing?: { email?: string };
  line_items?: { name?: string; quantity?: number; total?: string; total_tax?: string }[];
  coupon_lines?: { code?: string }[];
  meta_data?: { key?: string; value?: unknown }[];
}

/** Źródło zamówienia z „Order Attribution” WooCommerce (pola meta _wc_order_attribution_*), gdy sklep je zapisuje. */
function attribution(o: WooOrder, field: string): string {
  const m = (o.meta_data ?? []).find((x) => x.key === `_wc_order_attribution_${field}`);
  return typeof m?.value === "string" ? m.value.slice(0, 200) : "";
}

/** Ten sam skrót co w imporcie CSV (SHA-256, pierwsze 8 bajtów hex). */
export function hashEmailSync(email: string): string {
  const e = email.trim().toLowerCase();
  if (!e) return "";
  return createHash("sha256").update(e).digest("hex").slice(0, 16);
}

const gmt = (v?: string | null) => (v ? (/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v}Z`) : "");

export function wooOrderRef(o: WooOrder): string {
  return String(o.number || o.id);
}

/** Zamówienie → wiersz (gdy opłacone) albo null (gdy status spoza listy opłaconych). */
export function wooOrderToRow(o: WooOrder, paidStatuses: string[]): OrderIn | null {
  if (!paidStatuses.includes(String(o.status).toLowerCase())) return null;
  const ts = gmt(o.date_paid_gmt) || gmt(o.date_created_gmt);
  if (!ts || Number.isNaN(Date.parse(ts))) return null;
  return {
    order_ref: wooOrderRef(o),
    ts: new Date(ts).toISOString(),
    customer: hashEmailSync(o.billing?.email ?? ""),
    gross: Number(o.total) || 0,
    products: (o.line_items ?? []).map((li) => ({
      name: String(li.name ?? "").slice(0, 200),
      price: li.total == null ? null : Math.round(((Number(li.total) || 0) + (Number(li.total_tax) || 0)) * 100) / 100,
    })),
    coupon: (o.coupon_lines ?? []).map((c) => c.code ?? "").filter(Boolean).join(","),
    utm_source: attribution(o, "utm_source"),
    utm_medium: attribution(o, "utm_medium"),
    utm_campaign: attribution(o, "utm_campaign"),
  };
}

export function normalizeSiteUrl(v: string): string {
  let u: URL;
  try {
    u = new URL(v.trim().match(/^https?:\/\//i) ? v.trim() : `https://${v.trim()}`);
  } catch {
    throw new Error("Niepoprawny adres sklepu.");
  }
  // SYNC_ALLOW_LOCAL=1 – tylko do testów z atrapą sklepu na localhost.
  const local = (process.env.NODE_ENV !== "production" || process.env.SYNC_ALLOW_LOCAL === "1") && (u.hostname === "localhost" || u.hostname === "127.0.0.1");
  if (u.protocol !== "https:" && !local) throw new Error("Adres sklepu musi zaczynać się od https:// (klucze API nie mogą iść otwartym tekstem).");
  return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
}

type Fetch = typeof fetch;

/**
 * Jedna strona zamówień. Najpierw uwierzytelnianie nagłówkiem (Basic), a gdy serwer go odrzuci (401) –
 * kluczami w adresie (niektóre hostingi obcinają nagłówek Authorization).
 */
export async function fetchWooPage(
  opts: { site: string; key: string; secret: string; page: number; after?: string; modifiedAfter?: string },
  doFetch: Fetch = fetch,
): Promise<{ orders: WooOrder[]; totalPages: number | null }> {
  const params = new URLSearchParams({ per_page: "100", page: String(opts.page), orderby: "date", order: "asc", dates_are_gmt: "true" });
  if (opts.after) params.set("after", opts.after);
  if (opts.modifiedAfter) params.set("modified_after", opts.modifiedAfter);
  const base = `${normalizeSiteUrl(opts.site)}/wp-json/wc/v3/orders`;
  const auth = `Basic ${Buffer.from(`${opts.key}:${opts.secret}`).toString("base64")}`;
  let res = await doFetch(`${base}?${params}`, { headers: { Authorization: auth, Accept: "application/json" }, signal: AbortSignal.timeout(25_000) });
  if (res.status === 401) {
    const p2 = new URLSearchParams(params);
    p2.set("consumer_key", opts.key);
    p2.set("consumer_secret", opts.secret);
    res = await doFetch(`${base}?${p2}`, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(25_000) });
  }
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`WooCommerce: odpowiedź nie jest JSON (HTTP ${res.status}). Sprawdź adres sklepu i czy REST API jest włączone.`);
  }
  if (!res.ok || !Array.isArray(data)) {
    const m = (data as { message?: string })?.message ?? `HTTP ${res.status}`;
    throw new Error(`WooCommerce: ${m}`);
  }
  const tp = Number(res.headers.get("x-wp-totalpages"));
  return { orders: data as WooOrder[], totalPages: Number.isFinite(tp) && tp > 0 ? tp : null };
}
