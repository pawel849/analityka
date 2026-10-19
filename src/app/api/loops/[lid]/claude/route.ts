import Anthropic from "@anthropic-ai/sdk";
import { guarded, json, type Params } from "@/lib/api";
import { one, q } from "@/lib/db";
import type { EngineResult } from "@/lib/loop-data";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SYSTEM = `Jesteś analitykiem marketingu performance. Dostajesz liczby z sesji analitycznej jednego klienta (zakres wybranych kampanii i produktów) oraz odpowiedzi właściciela na pytania.
Zasady:
- Po polsku, zwięźle, w punktach.
- Opieraj się WYŁĄCZNIE na podanych liczbach. Nie dopisuj danych, których nie ma. Jeśli czegoś brakuje, napisz „brak danych: …”.
- Przy „niskiej pewności” mów o zakresie, nie o jednej liczbie.
- Struktura: 1) Co mówią liczby o dźwigni nr 1 (2–3 zdania). 2) Gdzie odpowiedzi właściciela zgadzają się z danymi, a gdzie nie. 3) 2–3 hipotezy w formie „Jeśli X, to metryka M z A do B” i jak każdą sprawdzić.
- Decyzję podejmuje właściciel – nie rozstrzygaj za niego.`;

/** „Pokaż analizę Claude” – dopiero po odpowiedziach na pytania. Klucz API zostaje na serwerze. */
export const POST = guarded(async (_req, { params }: Params<"lid">) => {
  const { lid } = await params;
  const loop = await one<{ data: unknown; finished_at: string | null }>("SELECT data, finished_at FROM loops WHERE id = $1", [lid]);
  if (!loop) return json({ error: "Brak sesji" }, 404);
  const data = (typeof loop.data === "string" ? JSON.parse(loop.data) : loop.data) as Record<string, Record<string, unknown>>;
  const eng = data.kwota?.snapshot as EngineResult | undefined;
  const qs = (data.pytania?.questions ?? []) as string[];
  const ans = (data.pytania?.answers ?? {}) as Record<string, string>;
  if (!eng || !qs.length || qs.some((_, i) => !String(ans[i] ?? "").trim())) return json({ error: "Najpierw odpowiedz na wszystkie pytania." }, 400);
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: "Brak klucza ANTHROPIC_API_KEY na serwerze." }, 503);
  const facts = {
    okno: `${eng.window.from} – ${eng.window.to}`,
    budzet_mies: Math.round(eng.ranking.budget),
    profit_mies_model: eng.ranking.profitNow == null ? null : Math.round(eng.ranking.profitNow),
    metryki_teraz: eng.ranking.base,
    metryki_poprzednie_30_dni: eng.metricsPrev,
    dzwignie: eng.ranking.levers.map((l) => ({
      metryka: l.label, teraz: l.current, benchmark: l.benchmark, zrodlo_benchmarku: l.benchmarkSource,
      zl_mies: l.value == null ? null : Math.round(l.value), zakres: l.range?.map(Math.round) ?? null, niska_pewnosc: l.lowConfidence, brak_danych: l.missing,
    })),
    zl_za_jednostke: eng.units,
    ltv30_dodatkowo_netto: eng.ltv.value,
    proba: { klikniecia: Math.round(eng.window.clicks), zamowienia: eng.window.orders, progi: eng.th },
    zdarzenia_na_osi_czasu: eng.events.slice(-15),
    luki_w_danych: eng.gaps,
    dzwignia_pogłębiana: data.pytania?.focus,
  };
  const qa = qs.map((qq, i) => `P: ${qq}\nO: ${ans[i]}`).join("\n\n");
  const client = new Anthropic();
  try {
    const res = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system: SYSTEM,
      messages: [{ role: "user", content: `Liczby (JSON):\n${JSON.stringify(facts)}\n\nPytania i odpowiedzi właściciela:\n${qa}` }],
    });
    if (res.stop_reason === "refusal") return json({ error: "Claude odmówił odpowiedzi." }, 502);
    const text = res.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
    const pytania = { ...(data.pytania ?? {}), claude: text };
    await q("UPDATE loops SET data = $2 WHERE id = $1", [lid, JSON.stringify({ ...data, pytania })]);
    return json({ text });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "Nieprawidłowy klucz ANTHROPIC_API_KEY." }, 502);
    if (e instanceof Anthropic.RateLimitError) return json({ error: "Limit zapytań API – spróbuj za chwilę." }, 429);
    if (e instanceof Anthropic.APIError) return json({ error: `Błąd API Claude (${e.status ?? "?"}): ${e.message}` }, 502);
    throw e;
  }
});
