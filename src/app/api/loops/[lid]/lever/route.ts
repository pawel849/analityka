import { body, guarded, json, type Params } from "@/lib/api";
import { guessLever } from "@/lib/loop";

/** „Gdzie jest największa dźwignia?” – odpowiedź odsłania ranking. */
export const POST = guarded(async (req, { params }: Params<"lid">) => {
  const { lid } = await params;
  const b = await body<{ guess?: string }>(req);
  try {
    await guessLever(lid, String(b.guess ?? ""));
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
