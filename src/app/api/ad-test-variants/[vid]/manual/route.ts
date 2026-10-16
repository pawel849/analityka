import { body, guarded, json, type Params } from "@/lib/api";
import { addManual } from "@/lib/ad-tests-data";

export const dynamic = "force-dynamic";

/** Ręczne liczby (gdy integracja nie działa) – zastępowane automatycznie, gdy spłyną dane z Meta / sklepu. */
export const POST = guarded(async (req, { params }: Params<"vid">) => {
  const { vid } = await params;
  const b = await body<{ day: string; spend?: number; impressions?: number; linkClicks?: number; video3s?: number; thruplay?: number; orders?: number; revenue?: number }>(req);
  try {
    await addManual(vid, b);
    return json({ ok: true }, 201);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
