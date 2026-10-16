import { body, guarded, json, type Params } from "@/lib/api";
import { createRound, type RoundInput } from "@/lib/ad-tests-data";

export const dynamic = "force-dynamic";

export const POST = guarded(async (req, { params }: Params<"testId">) => {
  const { testId } = await params;
  const b = await body<RoundInput>(req);
  if (!b.element?.trim()) return json({ error: "Wybierz element, który zmieniasz" }, 400);
  if (!Array.isArray(b.variants) || !b.variants.length || b.variants.some((v) => !v.changeTo?.trim())) return json({ error: "Każdy wariant musi mieć opis „na co zmieniono”" }, 400);
  try {
    return json(await createRound(testId, b), 201);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
