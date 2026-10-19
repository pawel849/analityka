import { guarded, json, type Params } from "@/lib/api";
import { listReports } from "@/lib/loop";

export const dynamic = "force-dynamic";
export const GET = guarded(async (_req, { params }: Params<"id">) => json(await listReports((await params).id)));
