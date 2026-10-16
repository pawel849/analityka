import { guarded, json, type Params } from "@/lib/api";
import { finishReview } from "@/lib/review";

export const POST = guarded(async (_req, { params }: Params<"rid">) => {
  const { rid } = await params;
  try {
    await finishReview(rid);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
