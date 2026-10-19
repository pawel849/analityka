import { body, guarded, json, type Params } from "@/lib/api";
import { addDecisionTask } from "@/lib/loop";

export const POST = guarded(async (req, { params }: Params<"did">) => {
  const b = await body<{ title?: string; who?: string; due?: string }>(req);
  try {
    await addDecisionTask((await params).did, b.title ?? "", b.who ?? "", b.due ?? "");
    return json({ ok: true }, 201);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
