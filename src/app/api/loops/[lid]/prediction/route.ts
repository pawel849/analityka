import { body, guarded, json, type Params } from "@/lib/api";
import { savePrediction } from "@/lib/loop";

/** Predykcja przed odsłonięciem danych. */
export const POST = guarded(async (req, { params }: Params<"lid">) => {
  const { lid } = await params;
  const b = await body<{ profit?: number; stage?: string }>(req);
  try {
    await savePrediction(lid, Number(b.profit), String(b.stage ?? ""));
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
