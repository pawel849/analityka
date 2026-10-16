import { body, guarded, json, type Params } from "@/lib/api";
import { rateAction } from "@/lib/loop";

export const POST = guarded(async (req, { params }: Params<"lid">) => {
  const { lid } = await params;
  const b = await body<{ taskId?: string; effect?: string; carry?: boolean; due?: string }>(req);
  try {
    await rateAction(lid, b.taskId ?? "", b.effect ?? "", !!b.carry, b.due);
    return json({ ok: true });
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
