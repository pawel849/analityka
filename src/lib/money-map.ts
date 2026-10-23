// „Gdzie leżą pieniądze”: dźwignie reklam i maili w jednej liście + kategorie (pure – używane na serwerze i w przeglądarce).
import { emailHypothesisValue, type EmailKey } from "./email-levers.ts";
import { modelProfit, type MetricKey } from "./levers.ts";
import type { EngineResult } from "./loop-data";
import { CATEGORIES, catOfLever, type CatKey } from "./loop-def.ts";

export interface AnyLever {
  key: string;
  label: string;
  stage: string;
  current: number | null;
  benchmark: number | null;
  benchmarkSource: string;
  value: number | null;
  range: [number, number] | null;
  lowConfidence: boolean;
  missing: string | null;
  per10: number | null;
  category: CatKey;
}

/** Wszystkie dźwignie (reklamy + maile), od największej kwoty. */
export function allLevers(eng: EngineResult): AnyLever[] {
  const out: AnyLever[] = [
    ...eng.ranking.levers.map((l) => ({ ...l, category: catOfLever(l.key)!.key })),
    ...(eng.email?.ranking.levers ?? []).map((l) => ({ ...l, category: "email" as CatKey })),
  ];
  return out.sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
}

/** Dźwignia nr 1 (z kwotą) – do pogłębienia w pytaniach. */
export const topLever = (eng: EngineResult) => allLevers(eng).find((l) => l.value != null) ?? null;

/**
 * Kwota kategorii: naraz wszystkie jej wskaźniki, które w najlepszym okresie były lepsze niż teraz (poprawy się mnożą).
 * Null, gdy żadna dźwignia kategorii nie ma kwoty.
 */
export function categoryValue(eng: EngineResult, cat: CatKey): number | null {
  const mine = allLevers(eng).filter((l) => l.category === cat && l.value != null && l.benchmark != null);
  if (!mine.length) return null;
  const ls = mine.filter((l) => l.value! > 0);
  if (!ls.length) return 0;
  if (cat === "email") {
    if (!eng.email) return null;
    const to = Object.fromEntries(ls.map((l) => [l.key, l.benchmark!])) as Partial<Record<EmailKey, number>>;
    return emailHypothesisValue(eng.email.ranking.base, eng.econ, to);
  }
  const over = Object.fromEntries(ls.map((l) => [l.key, l.benchmark!])) as Partial<Record<MetricKey, number>>;
  const now = modelProfit(eng.ranking.budget, eng.ranking.base, eng.econ);
  const then = modelProfit(eng.ranking.budget, eng.ranking.base, eng.econ, over);
  return now == null || then == null ? null : then - now;
}

export interface CategorySummary {
  key: CatKey;
  name: string;
  value: number | null;
  levers: AnyLever[];
  /** dźwignie bez danych (opis luki) */
  missing: string[];
}

export function categories(eng: EngineResult): CategorySummary[] {
  const all = allLevers(eng);
  return CATEGORIES.map((c) => {
    const levers = all.filter((l) => l.category === c.key);
    return {
      key: c.key, name: c.name, value: categoryValue(eng, c.key), levers,
      missing: [...new Set(levers.filter((l) => l.value == null && l.missing).map((l) => l.missing!))],
    };
  }).sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
}
