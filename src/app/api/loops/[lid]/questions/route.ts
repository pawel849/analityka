import { body, guarded, json, type Params } from "@/lib/api";
import { ensureQuestions, setFocus } from "@/lib/loop";

export const dynamic = "force-dynamic";

export const GET = guarded(async (_req, { params }: Params<"lid">) => {
  try {
    return json(await ensureQuestions((await params).lid));
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});

/** Inna dźwignia do pogłębienia → nowe pytania. */
export const POST = guarded(async (req, { params }: Params<"lid">) => {
  const b = await body<{ focus?: string }>(req);
  try {
    return json(await setFocus((await params).lid, String(b.focus ?? "")));
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
