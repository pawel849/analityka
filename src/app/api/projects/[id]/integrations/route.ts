import { body, guarded, json, notFound, type Params } from "@/lib/api";
import { newId, one, q } from "@/lib/db";
import { buildConfig, type IntegrationInput } from "@/lib/sync/config";

export const dynamic = "force-dynamic";

/** Lista integracji projektu – bez kluczy (zwracamy tylko, czy klucz jest zapisany). */
export const GET = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const rows = await q<Record<string, unknown>>(
    `SELECT id, provider, name, config, state, status, last_sync_at, last_error, last_result, enabled, created_at, secret <> '' AS has_secret
     FROM integrations WHERE project_id = $1 ORDER BY created_at`,
    [id],
  );
  return json(rows);
});

export const POST = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const project = await one("SELECT id FROM projects WHERE id = $1", [id]);
  if (!project) return notFound();
  const b = await body<IntegrationInput>(req);
  const provider = String(b.provider ?? "");
  let built;
  try {
    built = buildConfig(provider, b);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
  if (!built.secret) return json({ error: provider === "meta" ? "Wklej token dostępu." : "Wklej klucze REST API." }, 400);
  const name = (b.name ?? "").trim() || (provider === "meta" ? `Meta Ads ${built.config.accountId}` : `WooCommerce ${new URL(String(built.config.site)).host}`);
  const iid = newId();
  await one(
    "INSERT INTO integrations (id, project_id, provider, name, config, secret) VALUES ($1, $2, $3, $4, $5::jsonb, $6) RETURNING id",
    [iid, id, provider, name.slice(0, 200), JSON.stringify(built.config), built.secret],
  );
  return json({ id: iid });
});
