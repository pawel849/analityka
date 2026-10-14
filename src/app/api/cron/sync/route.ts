import { isAuthed } from "@/lib/auth";
import { runAllSyncs } from "@/lib/sync/run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Automatyczna synchronizacja (Vercel Cron, vercel.json). Vercel wysyła nagłówek
 * „Authorization: Bearer <CRON_SECRET>”, jeśli zmienna CRON_SECRET jest ustawiona.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const ok = secret ? req.headers.get("authorization") === `Bearer ${secret}` : await isAuthed();
  if (!ok) return Response.json({ error: "Brak autoryzacji" }, { status: 401 });
  return Response.json({ results: await runAllSyncs() });
}
