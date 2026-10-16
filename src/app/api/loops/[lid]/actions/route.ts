import { body, guarded, json, type Params } from "@/lib/api";
import { addLoopAction } from "@/lib/loop";

export const POST = guarded(async (req, { params }: Params<"lid">) => {
  const { lid } = await params;
  const b = await body<{ title?: string; due?: string; level?: string }>(req);
  try {
    await addLoopAction(lid, b.title ?? "", b.due ?? "", b.level ?? "");
    return json({ ok: true }, 201);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
