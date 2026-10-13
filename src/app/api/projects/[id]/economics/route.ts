import { guarded, json, type Params } from "@/lib/api";
import { loadAds, loadOrders, loadSettings } from "@/lib/project-data";
import { monthly, periodStats, prepare } from "@/lib/economics";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Ekonomia jednostkowa projektu: miesiące + okresy z ustawień (lub cały zakres danych). */
export const GET = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const [settings, orders, ads] = await Promise.all([loadSettings(id), loadOrders(id), loadAds(id)]);
  const p = prepare(orders, settings);
  const dataFrom = [orders[0] ? new Date(orders[0].ts).toISOString().slice(0, 10) : null, ads[0]?.start ?? null].filter(Boolean).sort()[0] ?? null;
  const dataTo = [p.lastDataTs ? new Date(p.lastDataTs).toISOString().slice(0, 10) : null, ...ads.map((a) => a.end)].filter(Boolean).sort().pop() ?? null;
  const url = new URL(req.url);
  const from = url.searchParams.get("from") ?? dataFrom;
  const to = url.searchParams.get("to") ?? dataTo;
  if (!from || !to) return json({ empty: true, settings });
  if (!DAY.test(from) || !DAY.test(to)) return json({ error: "Daty w formacie RRRR-MM-DD" }, 400);
  const periods = settings.periods.length ? settings.periods : [{ name: "Cały zakres", from, to }];
  return json({
    empty: false,
    from,
    to,
    dataFrom,
    dataTo,
    lastOrder: p.lastDataTs ? new Date(p.lastDataTs).toISOString().slice(0, 10) : null,
    counts: { orders: orders.length, adRows: ads.length, customersIdentified: new Set(orders.map((o) => o.customer).filter(Boolean)).size },
    settings,
    monthly: monthly(p, ads, settings, from, to),
    periods: periods.map((per) => periodStats(p, ads, settings, per)),
  });
});
