import { body, guarded, json, type Params } from "@/lib/api";
import { saveStep } from "@/lib/loop";

/** Zapis kroku; advance = przejście dalej (tylko gdy krok jest kompletny – inaczej lista braków). */
export const PATCH = guarded(async (req, { params }: Params<"lid">) => {
  const { lid } = await params;
  const b = await body<{ step?: number; patch?: Record<string, unknown>; advance?: boolean }>(req);
  try {
    return json(await saveStep(lid, Number(b.step), b.patch ?? {}, !!b.advance));
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
