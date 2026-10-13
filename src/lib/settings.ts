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
};

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
  };
}

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
