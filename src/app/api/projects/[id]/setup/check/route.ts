import { guarded, json, type Params } from "@/lib/api";
import { setupCheck } from "@/lib/setup-check";

export const dynamic = "force-dynamic";

export const GET = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  return json(await setupCheck(id));
});
