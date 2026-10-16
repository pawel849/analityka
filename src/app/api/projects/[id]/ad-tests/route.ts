import { body, guarded, json, notFound, type Params } from "@/lib/api";
import { one } from "@/lib/db";
import { createTest, loadTests } from "@/lib/ad-tests-data";

export const dynamic = "force-dynamic";

export const GET = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  return json(await loadTests(id));
});

export const POST = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const p = await one("SELECT id FROM projects WHERE id = $1", [id]);
  if (!p) return notFound();
  const b = await body<{ angle?: string; notes?: string }>(req);
  if (!b.angle?.trim()) return json({ error: "Podaj kąt (obietnicę) testu" }, 400);
  return json({ id: await createTest(id, b.angle, b.notes ?? "") }, 201);
});
