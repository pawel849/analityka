import { body, guarded, json, notFound, type Params } from "@/lib/api";
import { normalizeEmail } from "@/lib/email";
import { one } from "@/lib/db";
import { addMember, listMembers } from "@/lib/access";

/** Osoby z dostępem do klienta (tylko właściciel konta – pilnuje tego guarded). */
export const GET = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  return json(await listMembers(id));
});

export const POST = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  if (!(await one("SELECT 1 FROM clients WHERE id = $1", [id]))) return notFound();
  const email = normalizeEmail((await body<{ email?: string }>(req)).email);
  if (!email) return json({ error: "Podaj poprawny e-mail" }, 400);
  return json(await addMember(id, email), 201);
});
