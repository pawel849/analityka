import { body, guarded, json, type Params } from "@/lib/api";
import { one } from "@/lib/db";
import { mergeSettings } from "@/lib/settings";
import { loadSettings } from "@/lib/project-data";

export const GET = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  return json(await loadSettings(id));
});

export const PUT = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const settings = mergeSettings(await body(req));
  await one(
    `INSERT INTO project_settings (project_id, settings, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (project_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = now() RETURNING project_id`,
    [id, JSON.stringify(settings)],
  );
  return json(settings);
});
