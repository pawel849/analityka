import Anthropic from "@anthropic-ai/sdk";
import { body, guarded, json } from "@/lib/api";
import { helpKnowledgeText, searchHelp } from "@/lib/help";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM = `Jesteś asystentem pomocy w aplikacji „Analityka” – narzędziu do mapowania i analityki lejków marketingowych (klient → projekt → lejek).
Zasady:
- Odpowiadaj po polsku, krótko i konkretnie, w punktach gdy to kroki.
- Opieraj się wyłącznie na opisie aplikacji poniżej. Jeśli czegoś w nim nie ma, napisz wprost „Nie wiem – tego nie ma w opisie aplikacji” i nie zgaduj.
- Nie wymyślaj przycisków, zakładek ani funkcji, których nie ma w opisie.
- Możesz tłumaczyć pojęcia marketingowe (ROAS, CPL, LTV itd.), zaznaczając, co jest ogólną wiedzą, a co działaniem aplikacji.

# Opis aplikacji
${helpKnowledgeText()}`;

export const POST = guarded(async (req) => {
  const b = await body<{ messages?: ChatMessage[]; path?: string }>(req);
  const messages = (b.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  const last = messages[messages.length - 1];
  if (!last || last.role !== "user") return json({ error: "Brak pytania" }, 400);

  const related = searchHelp(last.content, 3).map((a) => ({ id: a.id, title: a.title }));
  if (!process.env.ANTHROPIC_API_KEY) return json({ answer: null, related, ai: false });

  const client = new Anthropic();
  try {
    const res = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: `${SYSTEM}\n\n# Kontekst\nUżytkownik jest teraz na stronie: ${String(b.path ?? "").slice(0, 200) || "nieznana"}`,
      messages,
    });
    if (res.stop_reason === "refusal") return json({ answer: "Nie mogę odpowiedzieć na to pytanie.", related, ai: true });
    const answer = res.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("")
      .trim();
    return json({ answer: answer || "Brak odpowiedzi.", related, ai: true });
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return json({ error: "Nieprawidłowy klucz ANTHROPIC_API_KEY.", related }, 502);
    if (e instanceof Anthropic.RateLimitError) return json({ error: "Limit zapytań API – spróbuj za chwilę.", related }, 429);
    if (e instanceof Anthropic.APIError) return json({ error: `Błąd API Claude (${e.status ?? "?"}): ${e.message}`, related }, 502);
    throw e;
  }
});
