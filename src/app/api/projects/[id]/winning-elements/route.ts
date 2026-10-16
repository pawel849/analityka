import { guarded, json, type Params } from "@/lib/api";
import { winningElements } from "@/lib/ad-tests-data";

export const dynamic = "force-dynamic";

export const GET = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  return json(await winningElements(id));
});
