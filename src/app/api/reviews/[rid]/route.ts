import { body, guarded, json, type Params } from "@/lib/api";
import { saveStep } from "@/lib/review";

/** Zapis notatki kroku; advance = przejście do następnego poziomu. */
export const PATCH = guarded(async (req, { params }: Params<"rid">) => {
  const { rid } = await params;
  const b = await body<{ step?: number; note?: string; ok?: boolean; advance?: boolean }>(req);
  try {
    await saveStep(rid, Number(b.step), { note: b.note ?? "", ok: !!b.ok }, !!b.advance);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
