import { guarded, json, type Params } from "@/lib/api";
import { previewReport } from "@/lib/loop";

export const dynamic = "force-dynamic";

/** Podgląd raportu przed zamknięciem sesji. */
export const GET = guarded(async (_req, { params }: Params<"lid">) => {
  try {
    return json(await previewReport((await params).lid));
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
