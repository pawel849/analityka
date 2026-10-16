import { body, guarded, json, type Params } from "@/lib/api";
import { createTest, type SopTest } from "@/lib/loop";

export const POST = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const b = await body<Partial<SopTest> & { loopId?: string }>(req);
  try {
    return json({ id: await createTest(id, b.loopId ?? null, b) }, 201);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
