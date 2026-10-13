import { guarded, json, notFound, type Params } from "@/lib/api";
import { defaultRange, loadEvents, loadFunnel } from "@/lib/funnel-analysis";
import { attrValue, presenceMatcher } from "@/lib/analysis";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ATTRS = ["source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "path"] as const;

/** Osoby na węźle + eksplorator atrybutów (najczęstsze wartości UTM, ścieżek itd.). */
export const GET = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const url = new URL(req.url);
  const def = defaultRange();
  const from = url.searchParams.get("from") ?? def.from;
  const to = url.searchParams.get("to") ?? def.to;
  const nodeId = url.searchParams.get("node_id");
  if (!DAY.test(from) || !DAY.test(to)) return json({ error: "Daty w formacie RRRR-MM-DD" }, 400);
  const funnel = await loadFunnel(id);
  const node = funnel?.nodes.find((n) => n.id === nodeId);
  if (!funnel || !node) return notFound();
  const match = presenceMatcher(node.data);
  if (!match) return json({ people: [], total: 0, attributes: {} });

  const { events } = await loadEvents(funnel.projectId, from, to);
  const people = new Map<string, { visitor_id: string; first: number; last: number; events: number; source: string; campaign: string; value: number }>();
  const counts: Record<string, Map<string, Set<string>>> = Object.fromEntries(ATTRS.map((a) => [a, new Map()]));
  for (const ev of events) {
    if (!match(ev)) continue;
    const p = people.get(ev.visitor_id) ?? {
      visitor_id: ev.visitor_id,
      first: ev.ts,
      last: ev.ts,
      events: 0,
      source: attrValue(ev, "source"),
      campaign: ev.utm_campaign ?? "",
      value: 0,
    };
    p.events++;
    p.first = Math.min(p.first, ev.ts);
    p.last = Math.max(p.last, ev.ts);
    p.value += ev.value ?? 0;
    people.set(ev.visitor_id, p);
    for (const a of ATTRS) {
      const v = attrValue(ev, a) || "(brak)";
      const set = counts[a].get(v) ?? new Set<string>();
      set.add(ev.visitor_id);
      counts[a].set(v, set);
    }
  }
  const attributes = Object.fromEntries(
    ATTRS.map((a) => [
      a,
      [...counts[a].entries()]
        .map(([value, s]) => ({ value, people: s.size }))
        .sort((x, y) => y.people - x.people)
        .slice(0, 10),
    ]),
  );
  const list = [...people.values()].sort((a, b) => b.last - a.last).slice(0, 100);
  return json({ people: list, total: people.size, attributes });
});
