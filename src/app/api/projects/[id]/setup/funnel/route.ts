import { body, guarded, json, type Params } from "@/lib/api";
import { buildFunnelFromSetup } from "@/lib/setup-funnel";

export const dynamic = "force-dynamic";

export const POST = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const { name } = await body<{ name?: string }>(req);
  try {
    return json(await buildFunnelFromSetup(id, name));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
