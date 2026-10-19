import { body, guarded, json, type Params } from "@/lib/api";
import { deleteReport, renameReport } from "@/lib/loop";

/** Zmiana tytułu raportu. */
export const PATCH = guarded(async (req, { params }: Params<"lid">) => {
  const b = await body<{ title?: string }>(req);
  try {
    await renameReport((await params).lid, b.title ?? "");
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});

export const DELETE = guarded(async (_req, { params }: Params<"lid">) => {
  try {
    await deleteReport((await params).lid);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 404);
  }
});
