import { guarded, json, type Params } from "@/lib/api";
import { runAnalysis } from "@/lib/loop";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Analiza Claude po odpowiedziach na pytania (klucz API tylko na serwerze). */
export const POST = guarded(async (_req, { params }: Params<"lid">) => {
  try {
    return json({ text: await runAnalysis((await params).lid) });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
});
