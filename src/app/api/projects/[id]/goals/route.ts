import { body, guarded, json, type Params } from "@/lib/api";
import { activeGoal, lastGoal, saveGoal } from "@/lib/loop";

export const dynamic = "force-dynamic";

export const GET = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const [goal, last] = await Promise.all([activeGoal(id), lastGoal(id)]);
  return json({ goal, last });
});

export const POST = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  try {
    return json({ id: await saveGoal(id, await body(req)) }, 201);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
