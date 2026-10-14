import { body, guarded, json, notFound, type Params } from "@/lib/api";
import { newId, one, q } from "@/lib/db";
import type { AdRow } from "@/lib/importing";
import { upsertAdRows, upsertOrders, type OrderIn } from "@/lib/import-store";

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

  if (b.kind === "ads") await upsertAdRows(id, importId, rows as AdRow[]);
  else await upsertOrders(id, importId, (b.source ?? "").slice(0, 100), rows as OrderIn[]);
  await one("UPDATE imports SET rows = rows + $2 WHERE id = $1 RETURNING id", [importId, rows.length]);
  return json({ import_id: importId, inserted: rows.length });
});

export const DELETE = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const importId = new URL(req.url).searchParams.get("import");
  const row = await one("DELETE FROM imports WHERE id = $1 AND project_id = $2 RETURNING id", [importId, id]);
  return row ? json({ ok: true }) : notFound();
});
