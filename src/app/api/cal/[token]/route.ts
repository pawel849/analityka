import { one } from "@/lib/db";
import { planItems, toIcs } from "@/lib/planner";

export const dynamic = "force-dynamic";

/** Publiczny (po tajnym tokenie) kalendarz iCal: zadania i terminy testów od 60 dni wstecz do roku naprzód. */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = token.replace(/\.ics$/, "");
  if (!/^[a-f0-9]{32}$/.test(t)) return new Response("Not found", { status: 404 });
  const p = await one<{ id: string; name: string }>("SELECT id, name FROM projects WHERE calendar_token = $1", [t]);
  if (!p) return new Response("Not found", { status: 404 });
  const d = (n: number) => new Date(Date.now() + n * 86400_000).toISOString().slice(0, 10);
  const items = await planItems(p.id, d(-60), d(365));
  const origin = new URL(req.url).origin;
  return new Response(toIcs(`Analityka – ${p.name}`, items, origin), {
    headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store" },
  });
}
