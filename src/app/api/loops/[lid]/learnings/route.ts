import { body, guarded, json, type Params } from "@/lib/api";
import { addLearning } from "@/lib/loop";

export const POST = guarded(async (req, { params }: Params<"lid">) => {
  const { lid } = await params;
  try {
    await addLearning(lid, await body(req));
    return json({ ok: true }, 201);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
