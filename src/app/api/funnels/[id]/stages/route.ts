import { guarded, json, type Params } from "@/lib/api";
import { funnelStages } from "@/lib/loop-data";

export const dynamic = "force-dynamic";
export const GET = guarded(async (_req, { params }: Params<"id">) => json(await funnelStages((await params).id)));
