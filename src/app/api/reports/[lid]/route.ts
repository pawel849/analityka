import { body, guarded, json, type Params } from "@/lib/api";
import { renameReport } from "@/lib/loop";

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
