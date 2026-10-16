import { guarded, json, type Params } from "@/lib/api";
import { reviewState, startReview } from "@/lib/review";

export const dynamic = "force-dynamic";

export const GET = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  return json(await reviewState(id));
});

/** Rozpoczęcie (albo wznowienie) przeglądu. */
export const POST = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  return json({ id: await startReview(id) }, 201);
});
