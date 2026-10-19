import { body, guarded, json, type Params } from "@/lib/api";
import { loopState, startLoop } from "@/lib/loop";

export const dynamic = "force-dynamic";

export const GET = guarded(async (_req, { params }: Params<"id">) => json(await loopState((await params).id)));

/** Start sesji (albo powrót do niezakończonej). Gdy jest poprzedni raport – wymagana fraza. */
export const POST = guarded(async (req, { params }: Params<"id">) => {
  const b = await body<{ phrase?: string }>(req);
  try {
    return json({ id: await startLoop((await params).id, b.phrase ?? "") }, 201);
  } catch (e) {
    return json({ error: (e as Error).message }, 403);
  }
});
