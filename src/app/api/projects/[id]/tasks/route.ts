import { body, guarded, json, type Params } from "@/lib/api";
import { addTask, planItems } from "@/lib/planner";

export const dynamic = "force-dynamic";

/** Zadania i terminy z testów w zakresie dat. */
export const GET = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const u = new URL(req.url);
  try {
    return json(await planItems(id, u.searchParams.get("from") ?? "", u.searchParams.get("to") ?? ""));
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});

export const POST = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const b = await body<{ title?: string; due?: string; start?: string | null; time?: string | null }>(req);
  try {
    return json(await addTask(id, b.title ?? "", b.due ?? "", b.start, b.time), 201);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
