import { body, guarded, json, notFound, type Params } from "@/lib/api";
import { one } from "@/lib/db";
import type { SetupState } from "@/lib/setup";

export const dynamic = "force-dynamic";

const parse = (v: unknown): SetupState => (typeof v === "string" ? JSON.parse(v) : (v as SetupState) ?? {});

export const GET = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const row = await one<{ setup: unknown }>("SELECT setup FROM projects WHERE id = $1", [id]);
  return row ? json(parse(row.setup)) : notFound();
});

/** Zapis (scalany z poprzednim stanem) odpowiedzi i postępu przewodnika. */
export const PUT = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const patch = await body<SetupState>(req);
  const text = JSON.stringify(patch);
  if (text.length > 100_000) return json({ error: "Za dużo danych" }, 413);
  const row = await one<{ setup: unknown }>("UPDATE projects SET setup = setup || $2::jsonb WHERE id = $1 RETURNING setup", [id, text]);
  return row ? json(parse(row.setup)) : notFound();
});
