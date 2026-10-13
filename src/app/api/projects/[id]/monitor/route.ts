import { guarded, json, type Params } from "@/lib/api";
import { dailySeries, defaultRange, loadEvents, topCountries } from "@/lib/funnel-analysis";
import { eventSource } from "@/lib/analysis";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Monitor projektu: liczby, trend dzienny, strony, źródła i kraje dla zakresu dat. */
export const GET = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const url = new URL(req.url);
  const def = defaultRange();
  const from = url.searchParams.get("from") ?? def.from;
  const to = url.searchParams.get("to") ?? def.to;
  if (!DAY.test(from) || !DAY.test(to)) return json({ error: "Daty w formacie RRRR-MM-DD" }, 400);
  const { events, truncated } = await loadEvents(id, from, to);
  const visitors = new Set<string>();
  const leads = new Set<string>();
  let sales = 0;
  let revenue = 0;
  const pages = new Map<string, Set<string>>();
  const sources = new Map<string, Set<string>>();
  for (const e of events) {
    if (e.type === "pageview") {
      visitors.add(e.visitor_id);
      const p = e.path.length > 1 && e.path.endsWith("/") ? e.path.slice(0, -1) : e.path || "/";
      (pages.get(p) ?? pages.set(p, new Set()).get(p)!).add(e.visitor_id);
      const s = eventSource(e);
      (sources.get(s) ?? sources.set(s, new Set()).get(s)!).add(e.visitor_id);
    } else if (e.type === "lead" || e.type === "form_submit") leads.add(e.visitor_id);
    else if (e.type === "purchase") {
      sales++;
      revenue += e.value ?? 0;
    }
  }
  const top = (m: Map<string, Set<string>>) =>
    [...m.entries()].map(([value, s]) => ({ value, people: s.size })).sort((a, b) => b.people - a.people).slice(0, 10);
  return json({
    from,
    to,
    truncated,
    totals: { visitors: visitors.size, leads: leads.size, sales, revenue, conv: visitors.size ? sales / visitors.size : null },
    daily: dailySeries(events, from, to),
    pages: top(pages),
    sources: top(sources),
    countries: topCountries(events),
  });
});
