import { guarded, json, type Params } from "@/lib/api";
import { activeGoal } from "@/lib/loop";
import { gap } from "@/lib/loop-data";

export const dynamic = "force-dynamic";
export const GET = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const g = await activeGoal(id);
  return json(g ? await gap(id, g) : null);
});
