// Moduł „Testy reklam”: ustawienia, nazwy reklam, wskaźniki wariantu, podpowiedzi (reguły 6.1–6.5 specyfikacji).
// Czyste funkcje – bez bazy (testowane w tests/ad-tests.test.ts).

export interface TestSettings {
  goal: string;
  /** Produkty główne w sklepie (pełne nazwy lub fragmenty) – „kursy” liczone tylko z nich. */
  productMatch: string[];
  cacMax: number;
  /** null = 2 × cacMax. */
  budgetPerVariant: number | null;
  variantsPerRound: number;
  minWinDiff: number;
  loseCac: number;
  fatigueCtrDrop: number;
  fatigueCostMult: number;
  scaleStep: number;
  scaleDays: number;
  attributionDays: number;
  namingPattern: string;
}

export const DEFAULT_TEST_SETTINGS: TestSettings = {
  goal: "zakup kursu",
  productMatch: [],
  cacMax: 265,
  budgetPerVariant: null,
  variantsPerRound: 3,
  minWinDiff: 0.2,
  loseCac: 400,
  fatigueCtrDrop: 0.2,
  fatigueCostMult: 1.5,
  scaleStep: 0.25,
  scaleDays: 7,
  attributionDays: 7,
  namingPattern: "{KAT}_R{n}_{WARIANT}",
};

const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);

export function mergeTestSettings(raw: unknown): TestSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<TestSettings>;
  const d = DEFAULT_TEST_SETTINGS;
  return {
    goal: typeof r.goal === "string" && r.goal.trim() ? r.goal : d.goal,
    productMatch: Array.isArray(r.productMatch) ? r.productMatch.filter((x): x is string => typeof x === "string" && !!x.trim()) : d.productMatch,
    cacMax: num(r.cacMax, d.cacMax),
    budgetPerVariant: typeof r.budgetPerVariant === "number" && r.budgetPerVariant > 0 ? r.budgetPerVariant : null,
    variantsPerRound: Math.min(4, Math.max(2, Math.round(num(r.variantsPerRound, d.variantsPerRound)))),
    minWinDiff: num(r.minWinDiff, d.minWinDiff),
    loseCac: num(r.loseCac, d.loseCac),
    fatigueCtrDrop: num(r.fatigueCtrDrop, d.fatigueCtrDrop),
    fatigueCostMult: num(r.fatigueCostMult, d.fatigueCostMult),
    scaleStep: num(r.scaleStep, d.scaleStep),
    scaleDays: Math.max(1, Math.round(num(r.scaleDays, d.scaleDays))),
    attributionDays: Math.max(1, Math.round(num(r.attributionDays, d.attributionDays))),
    namingPattern: typeof r.namingPattern === "string" && r.namingPattern.includes("{WARIANT}") ? r.namingPattern : d.namingPattern,
  };
}

export const budgetPerVariant = (s: TestSettings) => s.budgetPerVariant ?? 2 * s.cacMax;

export const ELEMENTS = ["hook", "body", "close", "kąt", "CTA", "format", "odbiorcy", "styl graficzno-wizualny"] as const;
export const IDEA_SOURCES = ["własne reklamy", "research klientów", "VSL / strona sprzedażowa", "konkurencja"];
export const DECISIONS = ["w toku", "wygrał", "przegrał", "remis", "wyłączony"] as const;
export type Decision = (typeof DECISIONS)[number];

/** „Amerykański coach” → „AMERYKANSKI_COACH” (do nazw reklam). */
export function angleSlug(angle: string): string {
  return (
    angle
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/ł/g, "l")
      .replace(/Ł/g, "L")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 24) || "TEST"
  );
}

export function adName(pattern: string, angle: string, round: number, letter: string): string {
  return pattern.replace(/\{KAT\}/g, angleSlug(angle)).replace(/\{n\}/g, String(round)).replace(/\{WARIANT\}/g, letter);
}

export const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

/** Link docelowy z UTM (utm_content = nazwa reklamy – po niej przypisujemy wejścia i zamówienia). */
export function variantLink(pageUrl: string, name: string, campaign = ""): string {
  const base = pageUrl.trim();
  if (!base) return "";
  const params = new URLSearchParams({ utm_source: "ads_meta", utm_medium: "paid", utm_content: name });
  if (campaign.trim()) params.set("utm_campaign", campaign.trim());
  const [noHash, hash] = base.split("#");
  return `${noHash}${noHash.includes("?") ? "&" : "?"}${params}${hash ? `#${hash}` : ""}`;
}

/** Parametry do pola „Parametry URL” w Meta – Meta sama wstawi nazwę reklamy. */
export const META_URL_PARAMS = "utm_source=ads_meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}";

export interface VariantTotals {
  spend: number;
  impressions: number;
  linkClicks: number;
  video3s: number;
  thruplay: number;
  metaPurchases: number;
  metaValue: number;
  visits: number;
  orders: number;
  mainOrders: number;
  revenue: number;
}

export const EMPTY_TOTALS: VariantTotals = {
  spend: 0, impressions: 0, linkClicks: 0, video3s: 0, thruplay: 0, metaPurchases: 0, metaValue: 0, visits: 0, orders: 0, mainOrders: 0, revenue: 0,
};

const div = (a: number, b: number) => (b ? a / b : null);

export interface Derived {
  ctr: number | null;
  cpc: number | null;
  hook: number | null;
  retention: number | null;
  cac: number | null;
  revPerSpend: number | null;
  progress: number;
  metaCpa: number | null;
}

export function derive(t: VariantTotals, s: TestSettings): Derived {
  return {
    ctr: div(t.linkClicks, t.impressions),
    cpc: div(t.spend, t.linkClicks),
    hook: div(t.video3s, t.impressions),
    retention: div(t.thruplay, t.video3s),
    cac: t.mainOrders > 0 ? t.spend / t.mainOrders : null,
    revPerSpend: div(t.revenue, t.spend),
    progress: Math.min(1, budgetPerVariant(s) ? t.spend / budgetPerVariant(s) : 0),
    metaCpa: div(t.spend, t.metaPurchases),
  };
}

export type SuggestionCode = "w_toku" | "wylacz" | "przegrywa" | "zwyciezca" | "najlepszy_ponad_cac" | "remis";

export interface Suggestion {
  code: SuggestionCode;
  label: string;
  /** Decyzja zapisywana po „zatwierdź”. */
  decision: Decision;
  diffToBest: number | null;
}

/**
 * Podpowiedź dla wariantu (reguła 6.1, kolejność sprawdzania jak w specyfikacji).
 * `round` = wszystkie warianty rundy z wyliczonymi wskaźnikami.
 */
export function suggestVariant(
  v: { letter: string; totals: VariantTotals; d: Derived },
  round: { letter: string; totals: VariantTotals; d: Derived }[],
  s: TestSettings,
): Suggestion {
  const cacs = round.map((x) => x.d.cac).filter((c): c is number => c != null && c > 0);
  const best = cacs.length ? Math.min(...cacs) : null;
  const diff = v.d.cac != null && best ? v.d.cac / best - 1 : null;
  if (v.totals.spend < budgetPerVariant(s)) return { code: "w_toku", label: "w toku", decision: "w toku", diffToBest: diff };
  if (v.totals.mainOrders === 0) return { code: "wylacz", label: "wyłącz – brak sprzedaży po budżecie", decision: "wyłączony", diffToBest: diff };
  const cac = v.d.cac!;
  if (cac > s.loseCac) return { code: "przegrywa", label: `przegrywa – CAC powyżej ${s.loseCac} zł`, decision: "przegrał", diffToBest: diff };
  if (best != null && cac === best) {
    return cac <= s.cacMax
      ? { code: "zwyciezca", label: "zwycięzca – baza następnej rundy", decision: "wygrał", diffToBest: 0 }
      : { code: "najlepszy_ponad_cac", label: `najlepszy w rundzie, ale CAC powyżej ${s.cacMax} zł`, decision: "w toku", diffToBest: 0 };
  }
  if (diff != null && diff < s.minWinDiff) {
    const bestV = round.find((x) => x.d.cac === best)!;
    const keep = (v.d.ctr ?? 0) > (bestV.d.ctr ?? 0) ? v.letter : bestV.letter;
    return { code: "remis", label: `remis – zostaje ${keep} (wyższy CTR)`, decision: "remis", diffToBest: diff };
  }
  return { code: "przegrywa", label: "przegrywa", decision: "przegrał", diffToBest: diff };
}

/** Podpowiedzi na rundę (6.2). */
export function roundHints(
  variants: { letter: string; totals: VariantTotals; d: Derived; metaSource: "api" | "manual" | null }[],
  s: TestSettings,
  ctx: { accountCtr: number | null; daysRunning: number; unattributedShare: number | null; productMatchSet: boolean },
): string[] {
  const out: string[] = [];
  const b = budgetPerVariant(s);
  if (
    variants.length &&
    variants.every((v) => v.totals.spend >= b) &&
    ctx.accountCtr != null &&
    variants.every((v) => (v.d.ctr ?? 0) >= ctx.accountCtr!) &&
    variants.every((v) => v.totals.mainOrders === 0)
  )
    out.push("Wszystkie warianty po budżecie, CTR nie gorszy od średniej konta, a 0 zamówień – problem na stronie lub w koszyku, nie w reklamie.");
  for (const v of variants) {
    if (ctx.daysRunning >= 1 && v.metaSource && v.totals.linkClicks === 0)
      out.push(`Wariant ${v.letter}: 0 kliknięć po ${ctx.daysRunning} dn. – sprawdź, czy reklama emituje się i czy link działa.`);
    if (v.totals.linkClicks >= 5 && v.totals.visits === 0)
      out.push(`Wariant ${v.letter}: są kliknięcia w Meta, ale 0 wejść z jego UTM – brak utm_content w linku reklamy (albo skryptu na stronie).`);
  }
  if (ctx.unattributedShare != null && ctx.unattributedShare > 0.2)
    out.push(`${Math.round(ctx.unattributedShare * 100)}% sprzedaży w okresie testu nie ma źródła (UTM) – wynik niepewny.`);
  if (!ctx.productMatchSet) out.push("Nie ustawiono produktu głównego (Ustawienia testów) – „kursy” liczą wszystkie zamówienia.");
  return out;
}

export interface DayPoint {
  day: string;
  spend: number;
  impressions: number;
  linkClicks: number;
  mainOrders: number;
}

/** Zmęczenie zwycięzcy (6.4): tygodnie od startu; alarm, gdy CTR spadł o próg albo CAC wzrósł mnożnik razy względem 1. tygodnia. */
export function fatigue(days: DayPoint[], s: TestSettings) {
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
  if (!sorted.length) return { weeks: [], alarm: null as string | null };
  const start = Date.parse(`${sorted[0].day}T00:00:00Z`);
  const weeks: { week: number; from: string; spend: number; impressions: number; linkClicks: number; mainOrders: number; ctr: number | null; cac: number | null }[] = [];
  for (const d of sorted) {
    const w = Math.floor((Date.parse(`${d.day}T00:00:00Z`) - start) / (7 * 86400_000));
    let row = weeks.find((x) => x.week === w);
    if (!row) weeks.push((row = { week: w, from: d.day, spend: 0, impressions: 0, linkClicks: 0, mainOrders: 0, ctr: null, cac: null }));
    row.spend += d.spend;
    row.impressions += d.impressions;
    row.linkClicks += d.linkClicks;
    row.mainOrders += d.mainOrders;
  }
  weeks.sort((a, b) => a.week - b.week);
  for (const w of weeks) {
    w.ctr = div(w.linkClicks, w.impressions);
    w.cac = w.mainOrders ? w.spend / w.mainOrders : null;
  }
  const first = weeks[0];
  const last = weeks[weeks.length - 1];
  let alarm: string | null = null;
  if (weeks.length >= 2 && first.ctr && last.ctr != null && last.ctr <= first.ctr * (1 - s.fatigueCtrDrop))
    alarm = `CTR spadł o ${Math.round((1 - last.ctr / first.ctr) * 100)}% względem 1. tygodnia – zmęczenie, zacznij nową rundę.`;
  else if (weeks.length >= 2 && first.cac && last.cac != null && last.cac >= first.cac * s.fatigueCostMult)
    alarm = `CAC wzrósł ${(last.cac / first.cac).toLocaleString("pl-PL", { maximumFractionDigits: 1 })}× względem 1. tygodnia – zmęczenie, zacznij nową rundę.`;
  return { weeks, alarm };
}

/** Skalowanie (6.5): CAC z ostatnich scaleDays dni ≤ cacMax (i była sprzedaż każdego… tygodnia) → podpowiedź podniesienia budżetu. */
export function scaling(days: DayPoint[], s: TestSettings, today: string): string | null {
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - (s.scaleDays - 1) * 86400_000).toISOString().slice(0, 10);
  const win = days.filter((d) => d.day >= from && d.day <= today);
  const covered = new Set(win.filter((d) => d.spend > 0).map((d) => d.day)).size;
  if (covered < s.scaleDays) return null;
  const spend = win.reduce((a, d) => a + d.spend, 0);
  const orders = win.reduce((a, d) => a + d.mainOrders, 0);
  if (!orders) return null;
  const cac = spend / orders;
  return cac <= s.cacMax
    ? `CAC z ${s.scaleDays} dni: ${Math.round(cac)} zł (≤ ${s.cacMax} zł) – zwiększ budżet o ${Math.round(s.scaleStep * 100)}%.`
    : null;
}

/** Data werdyktu: start + budżet na wariant ÷ budżet dzienny (zaokrąglone w górę). */
export function verdictDate(start: string, dailyBudget: number, s: TestSettings): string | null {
  if (!dailyBudget || dailyBudget <= 0) return null;
  const days = Math.ceil(budgetPerVariant(s) / dailyBudget);
  return new Date(Date.parse(`${start}T00:00:00Z`) + days * 86400_000).toISOString().slice(0, 10);
}

/** Przypisanie zakupu do wariantu: ostatnie wejście z utm_content w oknie atrybucji przed zakupem. */
export function attribute(
  purchaseTs: number,
  ownContent: string,
  touches: { ts: number; content: string }[] | undefined,
  windowDays: number,
): string | null {
  if (ownContent) return ownContent;
  if (!touches?.length) return null;
  let best: { ts: number; content: string } | null = null;
  for (const t of touches) {
    if (t.ts > purchaseTs || t.ts < purchaseTs - windowDays * 86400_000) continue;
    if (!best || t.ts > best.ts) best = t;
  }
  return best?.content ?? null;
}

export const normName = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l");
