// Ustawienia projektu (klienta): VAT, kategorie produktów, typy kampanii, kąty reklam, okresy, koszty.
// Wszystko edytowalne w aplikacji – domyślne wartości to tylko punkt startowy.
import { fold } from "./csv.ts";

export interface Rule {
  /** Wyrażenie regularne (bez rozróżniania wielkości liter, bez polskich znaków) lub zwykły fragment tekstu. */
  pattern: string;
  value: string;
}

export interface Period {
  name: string;
  from: string; // RRRR-MM-DD
  to: string; // RRRR-MM-DD
}

export interface ProjectSettings {
  currency: string;
  vat: number; // %
  mainCategory: string;
  productRules: Rule[];
  campaignTypeRules: Rule[];
  angleRules: Rule[];
  periods: Period[];
  costs: {
    incomeTaxRate: number; // % od zysku przed opodatkowaniem (uproszczenie)
    variableCostRates: Rule[]; // value = % przychodu netto danej kategorii (np. warsztat → 50)
    monthlyFixed: number; // koszty stałe miesięcznie (np. wynagrodzenia)
  };
  /** Zakres Ekonomii: dokładne nazwy kampanii (wydatki) i produktów (produkt główny). Puste = cały projekt. */
  economicsScope: { campaigns: string[]; products: string[] };
  /** Zakres sesji analitycznej (kampanie → wydatki, produkty → zamówienia). Brak = jak w Ekonomii. Puste listy = wszystko. */
  analysisScope?: { campaigns: string[]; products: string[] };
  /** Sesja analityczna: progi próby i źródło benchmarku dźwigni. */
  session: SessionSettings;
  /** Ustawienia modułu „Testy reklam” (patrz lib/ad-tests.ts → mergeTestSettings). */
  adTests?: unknown;
}

export const DEFAULT_SETTINGS: ProjectSettings = {
  currency: "zł",
  vat: 23,
  mainCategory: "kurs",
  productRules: [
    { pattern: "warsztat|workshop|dzien otwarty", value: "warsztat" },
    { pattern: "webinar", value: "webinar" },
    { pattern: "konsultac|mentoring|coaching|1:1", value: "konsultacja" },
    { pattern: "abonament|subskrypc|czlonkostw|spolecznosc|membership", value: "społeczność" },
    { pattern: "oto|upsell|oferta specjalna", value: "OTO" },
    { pattern: "e-?book|poradnik|pdf|checklist", value: "tani produkt" },
    { pattern: "kurs|szkolenie|program|akademia|course", value: "kurs" },
  ],
  campaignTypeRules: [
    { pattern: "webinar", value: "zapis na webinar" },
    { pattern: "lead|zapis|rejestr|opt-?in", value: "pozyskanie leadów" },
    { pattern: "ruch|traffic|wizyt|klikniec", value: "ruch" },
    { pattern: "zasieg|reach|awareness|swiadomosc", value: "zasięg" },
    { pattern: "remarketing|retarget|rmk", value: "remarketing" },
    { pattern: "sprzedaz|sales|konwers|purchase|zakup", value: "sprzedaż" },
  ],
  angleRules: [],
  periods: [],
  costs: { incomeTaxRate: 19, variableCostRates: [], monthlyFixed: 0 },
  economicsScope: { campaigns: [], products: [] },
  session: { minClicks: 100, minOrders: 10, benchmark: "best7", targets: {}, emailUtm: "mail|newsletter|mailerlite" },
};

export interface SessionSettings {
  /** Poniżej progu w oknie = „niska pewność” + zakres. */
  minClicks: number;
  minOrders: number;
  /** best7 = najlepsze okno 7 dni z ostatnich 60 (spełniające próg); targets = wartości docelowe poniżej. */
  benchmark: "best7" | "targets";
  targets: { cpm?: number; ctr?: number; cr?: number; aov?: number };
  /** Zamówienie jest „z maila”, gdy utm_source lub utm_medium zawiera któryś fragment (oddzielone „|”). */
  emailUtm: string;
}

export const DEFAULT_EMAIL_UTM = "mail|newsletter|mailerlite";

function mergeSession(v: unknown): SessionSettings {
  const r = (v && typeof v === "object" ? v : {}) as Partial<SessionSettings>;
  const pos = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : d);
  const t = (r.targets ?? {}) as Record<string, unknown>;
  const targets: SessionSettings["targets"] = {};
  for (const k of ["cpm", "ctr", "cr", "aov"] as const) if (typeof t[k] === "number" && Number.isFinite(t[k]) && (t[k] as number) > 0) targets[k] = t[k] as number;
  const emailUtm = typeof r.emailUtm === "string" && r.emailUtm.trim() ? r.emailUtm.trim().slice(0, 300) : DEFAULT_EMAIL_UTM;
  return { minClicks: pos(r.minClicks, 100), minOrders: pos(r.minOrders, 10), benchmark: r.benchmark === "targets" ? "targets" : "best7", targets, emailUtm };
}

export function mergeSettings(raw: unknown): ProjectSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<ProjectSettings>;
  return {
    ...DEFAULT_SETTINGS,
    ...r,
    costs: { ...DEFAULT_SETTINGS.costs, ...(r.costs ?? {}) },
    productRules: Array.isArray(r.productRules) ? r.productRules : DEFAULT_SETTINGS.productRules,
    campaignTypeRules: Array.isArray(r.campaignTypeRules) ? r.campaignTypeRules : DEFAULT_SETTINGS.campaignTypeRules,
    angleRules: Array.isArray(r.angleRules) ? r.angleRules : [],
    periods: Array.isArray(r.periods) ? r.periods : [],
    economicsScope: {
      campaigns: strings(r.economicsScope?.campaigns),
      products: strings(r.economicsScope?.products),
    },
    analysisScope: r.analysisScope && typeof r.analysisScope === "object"
      ? { campaigns: strings(r.analysisScope.campaigns), products: strings(r.analysisScope.products) }
      : undefined,
    session: mergeSession(r.session),
  };
}

const strings = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))].slice(0, 500) : [];

const cache = new Map<string, RegExp | null>();

function compile(pattern: string): RegExp | null {
  if (cache.has(pattern)) return cache.get(pattern)!;
  let re: RegExp | null = null;
  try {
    re = new RegExp(fold(pattern), "i");
  } catch {
    re = null;
  }
  cache.set(pattern, re);
  return re;
}

/** Pierwsza pasująca reguła wygrywa. Tekst porównywany po fold (bez polskich znaków, małe litery). */
export function applyRules(text: string, rules: Rule[], fallback: string): string {
  const t = fold(text);
  for (const r of rules) {
    if (!r.pattern?.trim()) continue;
    const re = compile(r.pattern);
    if (re ? re.test(t) : t.includes(fold(r.pattern))) return r.value;
  }
  return fallback;
}

export function netOf(gross: number, vat: number): number {
  return gross / (1 + vat / 100);
}
