import { guarded, json, type Params } from "@/lib/api";
import { loopState, startLoop } from "@/lib/loop";

export const dynamic = "force-dynamic";

export const GET = guarded(async (_req, { params }: Params<"id">) => json(await loopState((await params).id)));
/** Start pętli (albo powrót do niezakończonej – zawsze od kroku, na którym stanęła). */
export const POST = guarded(async (_req, { params }: Params<"id">) => json({ id: await startLoop((await params).id) }, 201));
