import { guarded, json, notFound, type Params } from "@/lib/api";
import { calendarToken } from "@/lib/planner";
import { requestOrigin } from "@/lib/project-context";

/** Adres subskrypcji kalendarza (iCal) tego projektu. */
export const POST = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const token = await calendarToken(id);
  if (!token) return notFound();
  const origin = await requestOrigin();
  return json({ url: `${origin}/api/cal/${token}` });
});
