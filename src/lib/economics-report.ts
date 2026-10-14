import { loadAds, loadOrders, loadSettings } from "./project-data";
import { monthly, periodStats, prepare } from "./economics";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Ekonomia jednostkowa projektu: miesiące + okresy z ustawień (lub cały zakres danych). */
export async function economicsReport(id: string, fromIn?: string | null, toIn?: string | null) {
  const [settings, orders, ads] = await Promise.all([loadSettings(id), loadOrders(id), loadAds(id)]);
  const p = prepare(orders, settings);
  const dataFrom = [orders[0] ? new Date(orders[0].ts).toISOString().slice(0, 10) : null, ads[0]?.start ?? null].filter(Boolean).sort()[0] ?? null;
  const dataTo = [p.lastDataTs ? new Date(p.lastDataTs).toISOString().slice(0, 10) : null, ...ads.map((a) => a.end)].filter(Boolean).sort().pop() ?? null;
  const from = fromIn ?? dataFrom;
  const to = toIn ?? dataTo;
  if (!from || !to) return { empty: true as const, settings };
  if (!DAY.test(from) || !DAY.test(to)) throw new Error("Daty w formacie RRRR-MM-DD");
  const periods = settings.periods.length ? settings.periods : [{ name: "Cały zakres", from, to }];
  return {
    empty: false as const,
    from,
    to,
    dataFrom,
    dataTo,
    lastOrder: p.lastDataTs ? new Date(p.lastDataTs).toISOString().slice(0, 10) : null,
    counts: { orders: orders.length, adRows: ads.length, customersIdentified: new Set(orders.map((o) => o.customer).filter(Boolean)).size },
    settings,
    monthly: monthly(p, ads, settings, from, to),
    periods: periods.map((per) => periodStats(p, ads, settings, per)),
  };
}
