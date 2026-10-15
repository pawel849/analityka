// Ekonomia jednostkowa: przychód vs reklamy, CAC, LTV (kohorty), zysk, rozkład przyczyn (Shapley).
// Czysty moduł – testy w tests/economics.test.ts.
import { applyRules, netOf, type Period, type ProjectSettings } from "./settings.ts";

export interface EconOrder {
  ref: string;
  ts: number; // ms
  customer: string; // skrót e-maila lub pusty
  gross: number;
  products: { name: string; price: number | null }[];
}

export interface EconAd {
  start: string; // RRRR-MM-DD
  end: string;
  campaign: string;
  spend: number;
}

const DAY = 86400_000;
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);
const monthKey = (ts: number) => new Date(ts).toISOString().slice(0, 7);
const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Wydatki reklam w przedziale dni [from, to] – wiersze dzielone proporcjonalnie do liczby dni. */
export function spendBetween(ads: EconAd[], from: string, to: string): number {
  const f = dayMs(from);
  const t = dayMs(to);
  let sum = 0;
  for (const a of ads) {
    const s = dayMs(a.start);
    const e = dayMs(a.end);
    const days = Math.round((e - s) / DAY) + 1;
    const overlap = Math.round((Math.min(e, t) - Math.max(s, f)) / DAY) + 1;
    if (overlap > 0 && days > 0) sum += (a.spend * overlap) / days;
  }
  return sum;
}

export interface Prepared {
  orders: (EconOrder & { key: string; categories: string[]; hasMain: boolean })[];
  firstMain: Map<string, number>; // klient → czas pierwszego zakupu produktu głównego
  lastDataTs: number;
}

/**
 * `mainMatch` (zawężenie Ekonomii do produktu): pozycje pasujące stają się produktem głównym (kategoria s.mainCategory),
 * niezależnie od reguł kategorii.
 */
export function prepare(orders: EconOrder[], s: ProjectSettings, mainMatch?: (name: string) => boolean): Prepared {
  const out = orders
    .map((o) => {
      const categories = o.products.length
        ? o.products.map((p) => (mainMatch ? (mainMatch(p.name) ? s.mainCategory : applyRules(p.name, s.productRules, "inne")) : applyRules(p.name, s.productRules, "inne")))
        : ["inne"];
      // Przy zawężeniu do produktu kategoria spoza zawężenia nie może udawać produktu głównego.
      const cats = mainMatch ? categories.map((c, i) => (c === s.mainCategory && !mainMatch(o.products[i]?.name ?? "") ? "inne" : c)) : categories;
      return { ...o, key: o.customer || `order:${o.ref}`, categories: cats, hasMain: cats.includes(s.mainCategory) };
    })
    .sort((a, b) => a.ts - b.ts);
  const firstMain = new Map<string, number>();
  for (const o of out) if (o.hasMain && !firstMain.has(o.key)) firstMain.set(o.key, o.ts);
  return { orders: out, firstMain, lastDataTs: out.length ? out[out.length - 1].ts : 0 };
}

/** Przychód zamówienia rozbity na kategorie (ceny pozycji, a gdy ich brak – po równo). */
function splitByCategory(o: Prepared["orders"][number]): Map<string, number> {
  const m = new Map<string, number>();
  const priced = o.products.every((p) => p.price != null) && o.products.length > 0;
  const total = priced ? o.products.reduce((a, p) => a + (p.price ?? 0), 0) : 0;
  o.categories.forEach((c, i) => {
    const share = priced && total > 0 ? (o.products[i].price ?? 0) / total : 1 / o.categories.length;
    m.set(c, (m.get(c) ?? 0) + o.gross * share);
  });
  return m;
}

export interface MonthRow {
  month: string;
  gross: number;
  net: number;
  byCategory: Record<string, number>;
  spend: number;
  orders: number;
  newMainCustomers: number;
  revenuePerSpend: number | null;
  adsShare: number | null;
}

/** `onlyMain` = przychód tylko z zamówień zawierających produkt główny (Ekonomia zawężona do produktu). */
export function monthly(p: Prepared, ads: EconAd[], s: ProjectSettings, from: string, to: string, onlyMain = false): MonthRow[] {
  const rows = new Map<string, MonthRow>();
  for (let t = dayMs(`${from.slice(0, 7)}-01`); t <= dayMs(to); ) {
    const d = new Date(t);
    const m = d.toISOString().slice(0, 7);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    rows.set(m, { month: m, gross: 0, net: 0, byCategory: {}, spend: spendBetween(ads, `${m}-01`, last), orders: 0, newMainCustomers: 0, revenuePerSpend: null, adsShare: null });
    t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
  }
  for (const o of p.orders) {
    const r = rows.get(monthKey(o.ts));
    if (!r || (onlyMain && !o.hasMain)) continue;
    r.gross += o.gross;
    r.orders++;
    for (const [c, v] of splitByCategory(o)) r.byCategory[c] = (r.byCategory[c] ?? 0) + v;
    if (o.hasMain && p.firstMain.get(o.key) === o.ts) r.newMainCustomers++;
  }
  for (const r of rows.values()) {
    r.net = netOf(r.gross, s.vat);
    r.revenuePerSpend = div(r.gross, r.spend);
    r.adsShare = div(r.spend, r.gross);
  }
  return [...rows.values()];
}

export interface LtvWindow {
  days: number;
  gross: number | null;
  net: number | null;
  matured: number; // klienci z pełnym oknem
}

export interface PeriodStats {
  name: string;
  from: string;
  to: string;
  months: number;
  spend: number;
  gross: number;
  net: number;
  byCategory: Record<string, number>;
  orders: number;
  mainUnits: number;
  mainPriceMedian: number | null;
  newMainCustomers: number;
  cac: number | null;
  ltv: LtvWindow[];
  ltvCac90: number | null;
  repeatRate: number | null;
  backendPerCustomer: number | null;
  orderBumpRate: number | null;
  revenuePerSpend: number | null;
  profit: { netRevenue: number; spend: number; variableCosts: number; fixedCosts: number; beforeTax: number; tax: number; afterTax: number };
  per10k: { newCustomers: number | null; netRevenue90: number | null; afterAds: number | null };
}

const WINDOWS = [30, 90, 365];

export function periodStats(p: Prepared, ads: EconAd[], s: ProjectSettings, period: Period, onlyMain = false): PeriodStats {
  const f = dayMs(period.from);
  const t = dayMs(period.to) + DAY - 1;
  // LTV i powroty liczą wszystkie zakupy klienta; przychód okresu – tylko zamówienia w zawężeniu.
  const inP = p.orders.filter((o) => o.ts >= f && o.ts <= t && (!onlyMain || o.hasMain));
  const byCategory: Record<string, number> = {};
  let gross = 0;
  let mainUnits = 0;
  let mainOrders = 0;
  let bumpOrders = 0;
  const mainPrices: number[] = [];
  for (const o of inP) {
    gross += o.gross;
    for (const [c, v] of splitByCategory(o)) byCategory[c] = (byCategory[c] ?? 0) + v;
    const mains = o.categories.filter((c) => c === s.mainCategory).length;
    mainUnits += mains;
    if (o.hasMain) {
      mainOrders++;
      // Dodatek = płatna pozycja spoza produktu głównego (darmowe bonusy za 0 zł się nie liczą; brak ceny = nie wiadomo, liczymy).
      if (o.products.some((pr, i) => o.categories[i] !== s.mainCategory && (pr.price == null || pr.price > 0))) bumpOrders++;
      o.products.forEach((pr, i) => {
        if (o.categories[i] === s.mainCategory && pr.price != null) mainPrices.push(pr.price);
      });
      if (o.products.length === 1 && o.products[0].price == null) mainPrices.push(o.gross);
    }
  }
  const spend = spendBetween(ads, period.from, period.to);
  // Kohorta: pierwszy zakup produktu głównego w okresie
  const cohort = [...p.firstMain.entries()].filter(([, ts]) => ts >= f && ts <= t);
  const ordersByKey = new Map<string, Prepared["orders"]>();
  for (const o of p.orders) ordersByKey.set(o.key, [...(ordersByKey.get(o.key) ?? []), o]);
  const ltv: LtvWindow[] = WINDOWS.map((days) => {
    const matured = cohort.filter(([, ts]) => ts + days * DAY <= p.lastDataTs);
    if (!matured.length) return { days, gross: null, net: null, matured: 0 };
    let sum = 0;
    for (const [k, first] of matured) {
      for (const o of ordersByKey.get(k) ?? []) if (o.ts >= first && o.ts <= first + days * DAY) sum += o.gross;
    }
    const avg = sum / matured.length;
    return { days, gross: avg, net: netOf(avg, s.vat), matured: matured.length };
  });
  let repeaters = 0;
  let backend = 0;
  for (const [k, first] of cohort) {
    const later = (ordersByKey.get(k) ?? []).filter((o) => o.ts > first);
    if (later.length && !k.startsWith("order:")) repeaters++;
    backend += later.reduce((a, o) => a + o.gross, 0);
  }
  const identified = cohort.filter(([k]) => !k.startsWith("order:")).length;
  const cac = div(spend, cohort.length);
  const ltv90 = ltv.find((l) => l.days === 90)!;
  const months = Math.max(1, Math.round((dayMs(period.to) - dayMs(period.from)) / (30.4375 * DAY)));
  const net = netOf(gross, s.vat);
  let variableCosts = 0;
  for (const [c, v] of Object.entries(byCategory)) {
    const rate = Number(applyRules(c, s.costs.variableCostRates, "0")) || 0;
    variableCosts += netOf(v, s.vat) * (rate / 100);
  }
  const fixedCosts = s.costs.monthlyFixed * months;
  const beforeTax = net - spend - variableCosts - fixedCosts;
  const tax = beforeTax > 0 ? beforeTax * (s.costs.incomeTaxRate / 100) : 0;
  const newCustomers10k = cac ? 10000 / cac : null;
  return {
    name: period.name,
    from: period.from,
    to: period.to,
    months,
    spend,
    gross,
    net,
    byCategory,
    orders: inP.length,
    mainUnits,
    mainPriceMedian: median(mainPrices),
    newMainCustomers: cohort.length,
    cac,
    ltv,
    ltvCac90: ltv90.net != null && cac ? ltv90.net / cac : null,
    repeatRate: div(repeaters, identified),
    backendPerCustomer: div(backend, cohort.length),
    orderBumpRate: div(bumpOrders, mainOrders),
    revenuePerSpend: div(gross, spend),
    profit: { netRevenue: net, spend, variableCosts, fixedCosts, beforeTax, tax, afterTax: beforeTax - tax },
    per10k: {
      newCustomers: newCustomers10k,
      netRevenue90: newCustomers10k != null && ltv90.net != null ? newCustomers10k * ltv90.net : null,
      afterAds: newCustomers10k != null && ltv90.net != null ? newCustomers10k * ltv90.net - 10000 : null,
    },
  };
}

/**
 * Rozkład zmiany przychodu netto na 10 000 zł reklam (R = 10 000 / CAC × LTV) na dwa czynniki
 * metodą Shapleya (średnia z obu kolejności podstawienia).
 */
export function shapley(a: PeriodStats, b: PeriodStats, windowDays = 90) {
  const la = a.ltv.find((l) => l.days === windowDays)?.net ?? null;
  const lb = b.ltv.find((l) => l.days === windowDays)?.net ?? null;
  if (!a.cac || !b.cac || la == null || lb == null) return null;
  const R = (cac: number, ltv: number) => (10000 / cac) * ltv;
  const r1 = R(a.cac, la);
  const r2 = R(b.cac, lb);
  const cacEffect = ((R(b.cac, la) - r1) + (r2 - R(a.cac, lb))) / 2;
  const ltvEffect = ((R(a.cac, lb) - r1) + (r2 - R(b.cac, la))) / 2;
  const total = r2 - r1;
  return {
    windowDays,
    from: r1,
    to: r2,
    total,
    cacEffect,
    ltvEffect,
    cacShare: total !== 0 ? cacEffect / total : null,
    ltvShare: total !== 0 ? ltvEffect / total : null,
  };
}

export interface AutoEvent {
  day: string;
  type: string;
  title: string;
  description: string;
}

/** Zdarzenia wykryte w danych: zmiany ceny produktu głównego (>10% m/m) oraz start/koniec kampanii. */
export function detectEvents(p: Prepared, ads: EconAd[], s: ProjectSettings): AutoEvent[] {
  const out: AutoEvent[] = [];
  const prices = new Map<string, number[]>();
  for (const o of p.orders) {
    if (!o.hasMain) continue;
    const m = monthKey(o.ts);
    o.products.forEach((pr, i) => {
      if (o.categories[i] === s.mainCategory && pr.price != null) prices.set(m, [...(prices.get(m) ?? []), pr.price]);
    });
    if (o.products.length === 1 && o.products[0].price == null) prices.set(m, [...(prices.get(m) ?? []), o.gross]);
  }
  let prev: { m: string; v: number } | null = null;
  for (const m of [...prices.keys()].sort()) {
    const v = median(prices.get(m)!)!;
    if (prev && Math.abs(v - prev.v) / prev.v > 0.1) {
      out.push({
        day: `${m}-01`,
        type: "cena",
        title: `Zmiana ceny (${s.mainCategory}): ${Math.round(prev.v)} → ${Math.round(v)} ${s.currency}`,
        description: `Mediana ceny w ${prev.m}: ${Math.round(prev.v)}, w ${m}: ${Math.round(v)} (z zamówień).`,
      });
    }
    prev = { m, v };
  }
  const camp = new Map<string, { first: string; last: string; spend: number }>();
  let lastData = "";
  for (const a of ads) {
    if (a.spend <= 0 || !a.campaign) continue;
    const c = camp.get(a.campaign) ?? { first: a.start, last: a.end, spend: 0 };
    if (a.start < c.first) c.first = a.start;
    if (a.end > c.last) c.last = a.end;
    c.spend += a.spend;
    camp.set(a.campaign, c);
    if (a.end > lastData) lastData = a.end;
  }
  for (const [name, c] of camp) {
    out.push({ day: c.first, type: "kampania", title: `Start kampanii: ${name}`, description: `Łączne wydatki w danych: ${Math.round(c.spend)} ${s.currency}.` });
    if (c.last < lastData) out.push({ day: c.last, type: "kampania", title: `Koniec kampanii: ${name}`, description: "Ostatni okres z wydatkami w danych." });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day));
}
