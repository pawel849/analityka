import { body, guarded, json, type Params } from "@/lib/api";
import { addAction } from "@/lib/review";

/** Działanie z przeglądu = zadanie w kalendarzu powiązane z poziomem. */
export const POST = guarded(async (req, { params }: Params<"rid">) => {
  const { rid } = await params;
  const b = await body<{ title?: string; due?: string; level?: string }>(req);
  try {
    await addAction(rid, b.title ?? "", b.due ?? "", b.level ?? "");
    return json({ ok: true }, 201);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
});
