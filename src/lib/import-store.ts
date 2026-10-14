// Zapis wierszy reklam i zamówień – wspólny dla importu CSV i synchronizacji przez API.
import { q } from "./db";
import type { AdRow } from "./importing";

export interface OrderIn {
  order_ref: string;
  ts: string;
  customer: string; // skrót e-maila (16 znaków hex)
  gross: number;
  products: { name: string; price: number | null }[];
  coupon?: string;
}

const AD_COLS = [
  "period_start", "period_end", "campaign", "adset", "ad", "spend", "impressions", "reach", "clicks", "video_3s", "thruplay",
  "landing_views", "registrations", "add_to_cart", "checkouts", "purchases", "purchase_value", "title", "body",
] as const;
const AD_KEY = ["period_start", "period_end", "campaign", "adset", "ad"];
const TEXT = new Set([...AD_KEY, "title", "body"]);

/** Nadpisuje wiersze o tym samym kluczu (okres + kampania + zestaw + reklama). */
export async function upsertAdRows(projectId: string, importId: string, rows: AdRow[]) {
  for (let i = 0; i < rows.length; i += 500) {
    // Ten sam klucz dwa razy w jednej paczce = ostatni wiersz wygrywa (Postgres nie pozwala nadpisać wiersza dwukrotnie).
    const unique = new Map<string, AdRow>();
    for (const r of rows.slice(i, i + 500)) unique.set(AD_KEY.map((k) => r[k as keyof AdRow]).join("\u0001"), r);
    const values: unknown[] = [];
    const tuples = [...unique.values()].map((r, j) => {
      const base = j * (AD_COLS.length + 2);
      values.push(projectId, importId, ...AD_COLS.map((c) => (TEXT.has(c) ? String(r[c] ?? "") : Number(r[c]) || 0)));
      return `(${Array.from({ length: AD_COLS.length + 2 }, (_, k) => `$${base + k + 1}`).join(",")})`;
    });
    await q(
      `INSERT INTO ad_rows (project_id, import_id, ${AD_COLS.join(", ")}) VALUES ${tuples.join(",")}
       ON CONFLICT (project_id, period_start, period_end, campaign, adset, ad) DO UPDATE SET
       ${AD_COLS.filter((c) => !AD_KEY.includes(c)).map((c) => `${c} = EXCLUDED.${c}`).join(", ")},
       import_id = EXCLUDED.import_id`,
      values,
    );
  }
}

/** Nadpisuje zamówienia o tym samym numerze w tym samym sklepie (source). */
export async function upsertOrders(projectId: string, importId: string, source: string, rows: OrderIn[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const unique = new Map<string, OrderIn>();
    for (const r of rows.slice(i, i + 500)) unique.set(String(r.order_ref), r);
    const values: unknown[] = [];
    const tuples = [...unique.values()].map((r, j) => {
      const base = j * 9;
      values.push(
        projectId, importId, source.slice(0, 100), String(r.order_ref).slice(0, 100), r.ts, String(r.customer ?? "").slice(0, 64),
        Number(r.gross) || 0, JSON.stringify(r.products ?? []), String(r.coupon ?? "").slice(0, 200),
      );
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8}::jsonb,$${base + 9})`;
    });
    await q(
      `INSERT INTO orders (project_id, import_id, source, order_ref, ts, customer, gross, products, coupon) VALUES ${tuples.join(",")}
       ON CONFLICT (project_id, source, order_ref) DO UPDATE SET ts = EXCLUDED.ts, customer = EXCLUDED.customer,
       gross = EXCLUDED.gross, products = EXCLUDED.products, coupon = EXCLUDED.coupon, import_id = EXCLUDED.import_id`,
      values,
    );
  }
}
