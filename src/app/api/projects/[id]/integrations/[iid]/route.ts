import { body, guarded, json, notFound, type Params } from "@/lib/api";
import { one } from "@/lib/db";
import { buildConfig, type IntegrationInput } from "@/lib/sync/config";

export const dynamic = "force-dynamic";

export const PATCH = guarded(async (req, { params }: Params<"id" | "iid">) => {
  const { id, iid } = await params;
  const row = await one<{ provider: string; config: unknown; name: string }>("SELECT provider, config, name FROM integrations WHERE id = $1 AND project_id = $2", [iid, id]);
  if (!row) return notFound();
  const b = await body<IntegrationInput>(req);
  const prev = (typeof row.config === "string" ? JSON.parse(row.config) : row.config) as Record<string, unknown>;
  let built;
  try {
    built = buildConfig(row.provider, b, prev);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
  // Zmiana konta / sklepu / liczby dni = pobranie historii od nowa.
  const reset = prev.accountId !== built.config.accountId || prev.site !== built.config.site || prev.days !== built.config.days;
  await one(
    `UPDATE integrations SET name = $3, config = $4::jsonb, secret = COALESCE($5, secret), enabled = COALESCE($6, enabled),
       state = CASE WHEN $7 THEN '{}'::jsonb ELSE state END
     WHERE id = $1 AND project_id = $2 RETURNING id`,
    [iid, id, (b.name ?? row.name).trim().slice(0, 200) || row.name, JSON.stringify(built.config), built.secret, typeof b.enabled === "boolean" ? b.enabled : null, reset],
  );
  return json({ ok: true });
});

/** Usuwa połączenie. Pobrane dane zostają (wpis „API: …” w Źródła danych → Import plików – tam można je usunąć). */
export const DELETE = guarded(async (_req, { params }: Params<"id" | "iid">) => {
  const { id, iid } = await params;
  const row = await one("DELETE FROM integrations WHERE id = $1 AND project_id = $2 RETURNING id", [iid, id]);
  return row ? json({ ok: true }) : notFound();
});
