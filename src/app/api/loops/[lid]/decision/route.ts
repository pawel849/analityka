import { body, guarded, json, type Params } from "@/lib/api";
import { createDecision } from "@/lib/loop";

export const POST = guarded(async (req, { params }: Params<"lid">) => {
  const { lid } = await params;
  try {
    return json({ id: await createDecision(lid, await body(req)) }, 201);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
