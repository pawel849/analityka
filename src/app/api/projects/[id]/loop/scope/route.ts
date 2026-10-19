import { body, guarded, json, type Params } from "@/lib/api";
import { economicsReport } from "@/lib/economics-report";
import { refreshAfterScope, saveScope } from "@/lib/loop";
import { addDays, today } from "@/lib/loop-data";

export const dynamic = "force-dynamic";

/** Kampanie i produkty z ostatnich 60 dni – do wyboru zakresu sesji. */
export const GET = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const t = today();
  const r = await economicsReport(id, addDays(t, -59), t);
  if (r.empty) return json({ campaigns: [], products: [] });
  return json({
    campaigns: r.campaignList.map((c) => ({ name: c.name, platform: c.platform, spend: c.spend })),
    products: r.products.map((p) => ({ name: p.name, gross: p.gross })),
  });
});

export const PUT = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const b = await body<{ campaigns?: string[]; products?: string[] }>(req);
  await saveScope(id, b.campaigns ?? [], b.products ?? []);
  await refreshAfterScope(id);
  return json({ ok: true });
});
