import { guarded, json, type Params } from "@/lib/api";
import { decisionResult, deleteDecision } from "@/lib/loop";

export const dynamic = "force-dynamic";

/** Wynik decyzji w oknie od wdrożenia do dnia sprawdzenia. */
export const GET = guarded(async (_req, { params }: Params<"did">) => {
  try {
    return json(await decisionResult((await params).did));
  } catch (e) {
    return json({ error: (e as Error).message }, 404);
  }
});

export const DELETE = guarded(async (_req, { params }: Params<"did">) => {
  try {
    await deleteDecision((await params).did);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
