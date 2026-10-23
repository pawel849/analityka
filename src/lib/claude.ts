// Wywołania Claude dla sesji analitycznej (klucz tylko na serwerze, nigdy w przeglądarce).
import Anthropic from "@anthropic-ai/sdk";
import type { EngineResult } from "./loop-data";
import { LEVER_NAMES } from "./loop-def";
import { allLevers, categories } from "./money-map";

export class ClaudeError extends Error {}

export async function askClaude(system: string, user: string, effort: "low" | "medium" = "medium"): Promise<string> {
  if (!process.env.ANTHROPIC_API_KEY) throw new ClaudeError("Brak klucza ANTHROPIC_API_KEY na serwerze.");
  const client = new Anthropic();
  try {
    const res = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort },
      system,
      messages: [{ role: "user", content: user }],
    });
    if (res.stop_reason === "refusal") throw new ClaudeError("Claude odmówił odpowiedzi.");
    return res.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
  } catch (e) {
    if (e instanceof ClaudeError) throw e;
    if (e instanceof Anthropic.AuthenticationError) throw new ClaudeError("Nieprawidłowy klucz ANTHROPIC_API_KEY.");
    if (e instanceof Anthropic.RateLimitError) throw new ClaudeError("Limit zapytań API – spróbuj za chwilę.");
    if (e instanceof Anthropic.APIError) throw new ClaudeError(`Błąd API Claude (${e.status ?? "?"}): ${e.message}`);
    throw e;
  }
}

/** Liczby sesji w zwięzłej postaci – jedyne źródło faktów dla Claude. */
export function sessionFacts(eng: EngineResult, focus: string | null) {
  return {
    okno_analizy: `${eng.window.from} – ${eng.window.to}`,
    budzet_reklam_mies_zl: Math.round(eng.ranking.budget),
    profit_mies_z_modelu_zl: eng.ranking.profitNow == null ? null : Math.round(eng.ranking.profitNow),
    metryki_teraz: eng.ranking.base,
    metryki_poprzednie_30_dni: eng.metricsPrev,
    kategorie_zl_mies: categories(eng).map((c) => ({ kategoria: c.name, zl_mies: c.value == null ? null : Math.round(c.value), brak_danych: c.missing })),
    maile: eng.email
      ? { okno: eng.email.window, metryki_teraz: eng.email.ranking.base, zysk_mies_z_maili_zl: eng.email.ranking.profitNow == null ? null : Math.round(eng.email.ranking.profitNow), utm_maili: eng.email.utm }
      : null,
    dzwignie: allLevers(eng).map((l) => ({
      kategoria: l.category,
      metryka: `${LEVER_NAMES[l.key].name} (${LEVER_NAMES[l.key].short})`,
      teraz: l.current,
      benchmark: l.benchmark,
      skad_benchmark: l.benchmarkSource,
      zl_mies: l.value == null ? null : Math.round(l.value),
      zakres_zl_mies: l.range?.map(Math.round) ?? null,
      niska_pewnosc: l.lowConfidence,
      brak_danych: l.missing,
    })),
    zl_za_jednostke: { zamowienie: eng.units.perOrder, klikniecie: eng.units.perClick, tysiac_wyswietlen: eng.units.perMille },
    ltv30_dodatkowo_netto_zl: eng.ltv.value,
    proba: { klikniecia: Math.round(eng.window.clicks), zamowienia: eng.window.orders, progi: eng.th },
    zdarzenia_na_osi_czasu: eng.events.slice(-15),
    luki_w_danych: eng.gaps,
    dzwignia_poglebiana: focus ? `${LEVER_NAMES[focus]?.name} (${LEVER_NAMES[focus]?.short})` : null,
  };
}

const RULES = `- Po polsku, ludzkim językiem, krótko. Zamiast skrótów pisz, co znaczą (np. „odsetek kliknięć w reklamę (CTR)”).
- Opieraj się WYŁĄCZNIE na podanych liczbach. Nie wymyślaj danych. Jeśli czegoś brakuje – napisz „brak danych: …”.
- Procenty jako „2,4%”, kwoty jako „1 250 zł”.`;

/** 2–3 pytania do właściciela o pogłębianą dźwignię. */
export async function claudeQuestions(eng: EngineResult, focus: string): Promise<string[]> {
  const system = `Jesteś analitykiem marketingu performance. Zadajesz właścicielowi 2–3 pytania, które pomogą mu samemu zrozumieć, dlaczego dźwignia „${LEVER_NAMES[focus]?.name}” jest tam, gdzie jest.
${RULES}
- Każde pytanie: najpierw 1 zdanie z liczbą (jak było, jak jest, do czego dążymy), potem pytanie „co się zmieniło / dlaczego”.
- Pytania otwarte, bez sugerowania odpowiedzi.
- Zwróć WYŁĄCZNIE JSON: {"questions": ["…", "…"]}`;
  const text = await askClaude(system, `Liczby (JSON):\n${JSON.stringify(sessionFacts(eng, focus))}`, "low");
  const m = text.match(/\{[\s\S]*\}/);
  const parsed = m ? (JSON.parse(m[0]) as { questions?: unknown }) : null;
  const qs = Array.isArray(parsed?.questions) ? parsed!.questions.filter((x): x is string => typeof x === "string" && !!x.trim()).slice(0, 3) : [];
  if (!qs.length) throw new ClaudeError("Claude nie zwrócił pytań.");
  return qs;
}

/** Analiza po odpowiedziach właściciela – odnosi się do tego, co napisał. */
export async function claudeAnalysis(eng: EngineResult, focus: string | null, qa: { q: string; a: string }[]): Promise<string> {
  const system = `Jesteś analitykiem marketingu performance. Właściciel odpowiedział na pytania o swój lejek. Napisz analizę dla niego.
${RULES}
- Struktura (nagłówki w osobnych liniach zaczynających się od „## ”):
## Co mówią liczby
(2–3 zdania o dźwigni nr 1 i pogłębianej dźwigni)
## Twoje odpowiedzi a dane
(odnieś się do KAŻDEJ odpowiedzi po kolei: punkt „- ” z krótkim cytatem i oceną, czy dane to potwierdzają, przeczą czy nie da się tego sprawdzić)
## Hipotezy do sprawdzenia
(2–3 punkty „- Jeśli X, to [metryka] z A do B” + jak to sprawdzić)
- Przy „niskiej pewności” mów o zakresie, nie o jednej liczbie.
- Decyzję podejmuje właściciel – nie rozstrzygaj za niego.`;
  const user = `Liczby (JSON):\n${JSON.stringify(sessionFacts(eng, focus))}\n\nPytania i odpowiedzi właściciela:\n${qa.map((x) => `P: ${x.q}\nO: ${x.a}`).join("\n\n")}`;
  return askClaude(system, user, "medium");
}
