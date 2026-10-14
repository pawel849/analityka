import { body, guarded, json, notFound } from "@/lib/api";
import { createAiKey, listAiKeys, revokeAiKey } from "@/lib/ai-keys";

export const dynamic = "force-dynamic";

export const GET = guarded(async () => json(await listAiKeys()));

/** Nowy klucz – pełna wartość zwracana tylko w tej odpowiedzi. */
export const POST = guarded(async (req) => {
  const { name } = await body<{ name?: string }>(req);
  return json(await createAiKey(name ?? ""), 201);
});

export const DELETE = guarded(async (req) => {
  const id = new URL(req.url).searchParams.get("key");
  return (await revokeAiKey(id ?? "")) ? json({ ok: true }) : notFound();
});
