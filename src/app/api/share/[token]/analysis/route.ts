import { one } from "@/lib/db";
import { defaultRange, runFunnelAnalysis } from "@/lib/funnel-analysis";
import { parseFilters } from "@/lib/filters";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Publiczna analiza dla udostępnionego lejka (bez logowania, tylko odczyt). */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{32}$/.test(token)) return Response.json({ error: "Nie znaleziono" }, { status: 404 });
  const f = await one<{ id: string }>("SELECT id FROM funnels WHERE share_token = $1", [token]);
  if (!f) return Response.json({ error: "Nie znaleziono" }, { status: 404 });
  const url = new URL(req.url);
  const def = defaultRange();
  const from = url.searchParams.get("from") ?? def.from;
  const to = url.searchParams.get("to") ?? def.to;
  if (!DAY.test(from) || !DAY.test(to)) return Response.json({ error: "Daty w formacie RRRR-MM-DD" }, { status: 400 });
  const mode = url.searchParams.get("mode") === "funnel" ? "funnel" : "traffic";
  const res = await runFunnelAnalysis(f.id, from, to, mode, parseFilters(url.searchParams.get("f")));
  return Response.json(res);
}
