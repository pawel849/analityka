import { body, guarded, json, notFound, type Params } from "@/lib/api";
import { newId, one, q } from "@/lib/db";
import type { AdRow } from "@/lib/importing";

interface OrderIn {
  order_ref: string;
  ts: string;
  customer: string; // skrót e-maila (liczony w przeglądarce)
  gross: number;
  products: { name: string; price: number | null }[];
  coupon: string;
}

const AD_COLS = [
  "period_start", "period_end", "campaign", "adset", "ad", "spend", "impressions", "reach", "clicks", "video_3s", "thruplay",
  "landing_views", "registrations", "add_to_cart", "checkouts", "purchases", "purchase_value", "title", "body",
] as const;

export const GET = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  return json(await q("SELECT id, kind, source, filename, rows, created_at FROM imports WHERE project_id = $1 ORDER BY created_at DESC", [id]));
});

/**
 * Import w paczkach: pierwsza paczka bez import_id tworzy wpis importu, kolejne dopisują wiersze.
 * Ponowny import tych samych danych nadpisuje rekordy (zamówienie: sklep + numer; reklama: okres + kampania + zestaw + reklama).
 */
export const POST = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const b = await body<{ import_id?: string; kind?: "ads" | "orders"; source?: string; filename?: string; rows?: unknown[] }>(req);
  const rows = Array.isArray(b.rows) ? b.rows.slice(0, 2000) : [];
  if (b.kind !== "ads" && b.kind !== "orders") return json({ error: "Nieznany rodzaj importu" }, 400);
  let importId = b.import_id;
  if (!importId) {
    importId = newId();
    await one("INSERT INTO imports (id, project_id, kind, source, filename) VALUES ($1, $2, $3, $4, $5) RETURNING id", [
      importId, id, b.kind, (b.source ?? "").slice(0, 100), (b.filename ?? "").slice(0, 200),
    ]);
  } else {
    const ok = await one("SELECT id FROM imports WHERE id = $1 AND project_id = $2", [importId, id]);
    if (!ok) return notFound();
  }
  if (!rows.length) return json({ import_id: importId, inserted: 0 });

  if (b.kind === "ads") {
    const values: unknown[] = [];
    // Ten sam klucz dwa razy w jednej paczce = ostatni wiersz wygrywa (Postgres nie pozwala nadpisać wiersza dwukrotnie).
    const unique = new Map<string, AdRow>();
    for (const r of rows as AdRow[]) unique.set([r.period_start, r.period_end, r.campaign, r.adset, r.ad].join("\u0001"), r);
    const TEXT = new Set(["period_start", "period_end", "campaign", "adset", "ad", "title", "body"]);
    const tuples = [...unique.values()].map((r, i) => {
      const base = i * (AD_COLS.length + 2);
      values.push(id, importId, ...AD_COLS.map((c) => (TEXT.has(c) ? String(r[c] ?? "") : Number(r[c]) || 0)));
      return `(${Array.from({ length: AD_COLS.length + 2 }, (_, k) => `$${base + k + 1}`).join(",")})`;
    });
    await q(
      `INSERT INTO ad_rows (project_id, import_id, ${AD_COLS.join(", ")}) VALUES ${tuples.join(",")}
       ON CONFLICT (project_id, period_start, period_end, campaign, adset, ad) DO UPDATE SET
       ${AD_COLS.filter((c) => !["period_start", "period_end", "campaign", "adset", "ad"].includes(c)).map((c) => `${c} = EXCLUDED.${c}`).join(", ")},
       import_id = EXCLUDED.import_id`,
      values,
    );
  } else {
    const values: unknown[] = [];
    const source = (b.source ?? "").slice(0, 100);
    const tuples = (rows as OrderIn[]).map((r, i) => {
      const base = i * 8;
      values.push(id, importId, source, String(r.order_ref).slice(0, 100), r.ts, String(r.customer ?? "").slice(0, 64), Number(r.gross) || 0, JSON.stringify(r.products ?? []));
      return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6},$${base + 7},$${base + 8}::jsonb)`;
    });
    await q(
      `INSERT INTO orders (project_id, import_id, source, order_ref, ts, customer, gross, products) VALUES ${tuples.join(",")}
       ON CONFLICT (project_id, source, order_ref) DO UPDATE SET ts = EXCLUDED.ts, customer = EXCLUDED.customer,
       gross = EXCLUDED.gross, products = EXCLUDED.products, import_id = EXCLUDED.import_id`,
      values,
    );
  }
  await one("UPDATE imports SET rows = rows + $2 WHERE id = $1 RETURNING id", [importId, rows.length]);
  return json({ import_id: importId, inserted: rows.length });
});

export const DELETE = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const importId = new URL(req.url).searchParams.get("import");
  const row = await one("DELETE FROM imports WHERE id = $1 AND project_id = $2 RETURNING id", [importId, id]);
  return row ? json({ ok: true }) : notFound();
});
