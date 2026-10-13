import { guarded, json, notFound, type Params } from "@/lib/api";
import { defaultRange, loadEvents, loadFunnel } from "@/lib/funnel-analysis";
import { eventSource } from "@/lib/analysis";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Eksploracja danych projektu: najczęstsze strony, źródła i zdarzenia – do szybkiego dodania na mapę. */
export const GET = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const url = new URL(req.url);
  const def = defaultRange();
  const from = url.searchParams.get("from") ?? def.from;
  const to = url.searchParams.get("to") ?? def.to;
  if (!DAY.test(from) || !DAY.test(to)) return json({ error: "Daty w formacie RRRR-MM-DD" }, 400);
  const funnel = await loadFunnel(id);
  if (!funnel) return notFound();
  const { events } = await loadEvents(funnel.projectId, from, to);

  const count = (key: (e: (typeof events)[number]) => string | null) => {
    const m = new Map<string, Set<string>>();
    for (const e of events) {
      const k = key(e);
      if (k == null) continue;
      const s = m.get(k) ?? new Set<string>();
      s.add(e.visitor_id);
      m.set(k, s);
    }
    return [...m.entries()].map(([value, s]) => ({ value, people: s.size })).sort((a, b) => b.people - a.people).slice(0, 25);
  };
  const normPath = (p: string) => (p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p || "/");

  return json({
    eventCount: events.length,
    pages: count((e) => (e.type === "pageview" ? normPath(e.path) : null)),
    sources: count((e) => (e.type === "pageview" ? eventSource(e) : null)),
    campaigns: count((e) => (e.type === "pageview" && e.utm_campaign ? e.utm_campaign : null)),
    events: count((e) => (e.type === "pageview" || e.type === "scroll" ? null : e.type === "custom" ? `custom:${e.name}` : e.type)),
  });
});
