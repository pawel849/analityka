import { loadAds, loadOrders, loadSettings } from "./project-data";
import { monthly, periodStats, prepare } from "./economics";
import { applyRules } from "./settings";
import { adMatches, parseAdsMatch } from "./setup";
import { fold } from "./csv";

export interface EconScope {
  /** Kampanie (składnia pola „Koszty z importu reklam”, np. „meta:VSL 797”). Puste = wszystkie. */
  campaigns?: string | null;
  /** Fragmenty nazw produktów po przecinku – stają się produktem głównym. Puste = reguły z ustawień. */
  products?: string | null;
}

export function productMatcher(v: string | null | undefined): ((name: string) => boolean) | undefined {
  const parts = (v ?? "").split(",").map((x) => fold(x.trim())).filter(Boolean);
  return parts.length ? (name: string) => parts.some((x) => fold(name).includes(x)) : undefined;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Ekonomia jednostkowa projektu: miesiące + okresy z ustawień (lub cały zakres danych). */
/**
 * Zakres: parametry wywołania (tekst, np. „meta:VSL 797”) mają pierwszeństwo; bez nich – zakres zapisany w ustawieniach projektu
 * (dokładne nazwy kampanii i produktów wybrane z listy).
 */
export async function economicsReport(
  id: string,
  fromIn?: string | null,
  toIn?: string | null,
  scope: EconScope = {},
  /** "poprzedni" = porównanie wybranego okresu z poprzednim tej samej długości; "ustawienia" = okresy z ustawień; brak = jak dawniej. */
  compare?: "poprzedni" | "ustawienia" | null,
) {
  const [settings0, orders, allAds] = await Promise.all([loadSettings(id), loadOrders(id), loadAds(id)]);
  const saved = settings0.economicsScope;
  const campaigns = (scope.campaigns ?? "").trim();
  const tokens = campaigns ? parseAdsMatch(campaigns) : null;
  const savedCampaigns = new Set(saved.campaigns.map((c) => fold(c)));
  const ads = tokens
    ? allAds.filter((a) => adMatches(tokens, a.source, `${a.campaign} | ${a.adset} | ${a.ad}`))
    : savedCampaigns.size
      ? allAds.filter((a) => savedCampaigns.has(fold(a.campaign.trim())))
      : allAds;
  const savedProducts = new Set(saved.products.map((x) => fold(x)));
  const match = (scope.products ?? "").trim()
    ? productMatcher(scope.products)
    : savedProducts.size
      ? (name: string) => savedProducts.has(fold(name.trim()))
      : undefined;
  const scopeLabel = (scope.products ?? "").trim() || (saved.products.length === 1 ? saved.products[0] : saved.products.length ? `${saved.products.length} produkty` : "");
  const settings = match ? { ...settings0, mainCategory: `wybrane: ${scopeLabel}` } : settings0;
  const p = prepare(orders, settings, match);
  const dataFrom = [orders[0] ? new Date(orders[0].ts).toISOString().slice(0, 10) : null, ads[0]?.start ?? null].filter(Boolean).sort()[0] ?? null;
  const dataTo = [p.lastDataTs ? new Date(p.lastDataTs).toISOString().slice(0, 10) : null, ...ads.map((a) => a.end)].filter(Boolean).sort().pop() ?? null;
  const from = fromIn ?? dataFrom;
  const to = toIn ?? dataTo;
  if (!dataFrom || !from || !to) return { empty: true as const, settings };
  if (!DAY.test(from) || !DAY.test(to)) throw new Error("Daty w formacie RRRR-MM-DD");
  const periods =
    compare === "poprzedni"
      ? [{ name: "Poprzedni okres", ...previousRange(from, to) }, { name: "Wybrany okres", from, to }]
      : settings.periods.length
        ? settings.periods
        : [{ name: "Cały zakres", from, to }];
  return {
    empty: false as const,
    from,
    to,
    dataFrom,
    dataTo,
    lastOrder: p.lastDataTs ? new Date(p.lastDataTs).toISOString().slice(0, 10) : null,
    counts: { orders: orders.length, adRows: ads.length, adRowsAll: allAds.length, customersIdentified: new Set(orders.map((o) => o.customer).filter(Boolean)).size },
    scope: {
      source: campaigns || (scope.products ?? "").trim() ? "parametry" : saved.campaigns.length || saved.products.length ? "zapisany w ustawieniach" : "cały projekt",
      campaigns: campaigns || (saved.campaigns.length ? saved.campaigns : null),
      products: (scope.products ?? "").trim() || (saved.products.length ? saved.products : null),
    },
    campaignList: campaignSummary(allAds, from, to),
    settings,
    monthly: monthly(p, ads, settings, from, to, !!match),
    periods: periods.map((per) => periodStats(p, ads, settings, per, !!match)),
    products: productSummary(orders, settings0, from, to, match),
  };
}

/** Poprzedni okres tej samej długości (kończy się dzień przed `from`). */
export function previousRange(from: string, to: string) {
  const D = 86400_000;
  const f = Date.parse(`${from}T00:00:00Z`);
  const days = Math.round((Date.parse(`${to}T00:00:00Z`) - f) / D) + 1;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  return { from: iso(f - days * D), to: iso(f - D) };
}

/** Produkty w zamówieniach okresu: liczba, mediana ceny, kategoria wg reguł – do ustawiania reguł i zawężenia. */
function productSummary(orders: Awaited<ReturnType<typeof loadOrders>>, s: Awaited<ReturnType<typeof loadSettings>>, from: string, to: string, match?: (n: string) => boolean) {
  const f = Date.parse(`${from}T00:00:00Z`);
  const t = Date.parse(`${to}T23:59:59Z`);
  const m = new Map<string, { name: string; count: number; prices: number[]; gross: number }>();
  for (const o of orders) {
    if (o.ts < f || o.ts > t) continue;
    for (const pr of o.products) {
      const x = m.get(pr.name) ?? { name: pr.name, count: 0, prices: [], gross: 0 };
      x.count++;
      if (pr.price != null) {
        x.prices.push(pr.price);
        x.gross += pr.price;
      }
      m.set(pr.name, x);
    }
  }
  const med = (xs: number[]) => {
    if (!xs.length) return null;
    const v = [...xs].sort((a, b) => a - b);
    return v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2;
  };
  return [...m.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 200)
    .map((x) => ({
      name: x.name,
      count: x.count,
      medianPrice: med(x.prices),
      gross: x.prices.length ? x.gross : null,
      category: applyRules(x.name, s.productRules, "inne"),
      inScope: match ? match(x.name) : null,
    }));
}

/** Kampanie z wydatkami w zakresie dat (do wyboru zakresu). */
function campaignSummary(ads: Awaited<ReturnType<typeof loadAds>>, from: string, to: string) {
  const m = new Map<string, { name: string; platform: string; spend: number }>();
  for (const a of ads) {
    if (a.end < from || a.start > to) continue;
    const name = a.campaign.trim() || "(bez nazwy)";
    const x = m.get(name) ?? { name, platform: a.source === "meta_api" || a.source === "meta" ? "Meta" : a.source === "google_ads" ? "Google" : "inne", spend: 0 };
    x.spend += a.spend;
    m.set(name, x);
  }
  return [...m.values()].sort((a, b) => b.spend - a.spend).slice(0, 300).map((x) => ({ ...x, spend: Math.round(x.spend * 100) / 100 }));
}
