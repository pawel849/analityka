import { body, guarded, json, type Params } from "@/lib/api";
import { saveVerdict } from "@/lib/loop";

export const POST = guarded(async (req, { params }: Params<"did">) => {
  const b = await body<{ verdict?: string; learning?: string }>(req);
  try {
    await saveVerdict((await params).did, String(b.verdict ?? ""), String(b.learning ?? ""));
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
