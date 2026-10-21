import { guarded, json, notFound, type Params } from "@/lib/api";
import { one } from "@/lib/db";
import { newInvite, removeMember } from "@/lib/access";

const member = (cid: string, uid: string) => one("SELECT 1 FROM client_members WHERE client_id = $1 AND user_id = $2", [cid, uid]);

/** Nowy link do ustawienia hasła (np. gdy ktoś zapomniał hasła albo link wygasł). */
export const POST = guarded(async (_req, { params }: Params<"id" | "uid">) => {
  const { id, uid } = await params;
  if (!(await member(id, uid))) return notFound();
  return json({ invite: await newInvite(uid) });
});

export const DELETE = guarded(async (_req, { params }: Params<"id" | "uid">) => {
  const { id, uid } = await params;
  await removeMember(id, uid);
  return json({ ok: true });
});
