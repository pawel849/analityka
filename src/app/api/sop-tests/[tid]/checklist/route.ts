import { body, guarded, json, type Params } from "@/lib/api";
import { addChecklistItem } from "@/lib/loop";

export const POST = guarded(async (req, { params }: Params<"tid">) => {
  const { tid } = await params;
  const b = await body<{ title?: string; who?: string; due?: string }>(req);
  try {
    await addChecklistItem(tid, b.title ?? "", b.who ?? "", b.due ?? "");
    return json({ ok: true }, 201);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
