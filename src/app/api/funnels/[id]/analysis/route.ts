import { guarded, json, notFound, type Params } from "@/lib/api";
import { defaultRange, runFunnelAnalysis } from "@/lib/funnel-analysis";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export const GET = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const url = new URL(req.url);
  const def = defaultRange();
  const from = url.searchParams.get("from") ?? def.from;
  const to = url.searchParams.get("to") ?? def.to;
  if (!DAY.test(from) || !DAY.test(to)) return json({ error: "Daty w formacie RRRR-MM-DD" }, 400);
  const res = await runFunnelAnalysis(id, from, to);
  return res ? json(res) : notFound();
});
