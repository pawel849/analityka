import { body, guarded, json, type Params } from "@/lib/api";
import { saveGoal } from "@/lib/loop";

export const POST = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  try {
    return json({ id: await saveGoal(id, await body(req)) }, 201);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
