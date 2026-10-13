// Generator danych testowych: symuluje ruch po mapie lejka, żeby zobaczyć tryb analizy
// zanim podepniesz prawdziwy skrypt. Zdarzenia są oznaczone is_test i można je usunąć jednym kliknięciem.
import type { NodeData } from "./catalog";
import type { CleanEvent } from "./collect";

interface N {
  id: string;
  data: NodeData;
}
interface E {
  source: string;
  target: string;
}

function rand<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pageUrl(d: NodeData, host: string): string | null {
  const p = (d.url ?? "").trim();
  if (!p) return null;
  if (p.startsWith("/")) return `https://${host}${p.replace(/\*$/, "")}`;
  if (/^https?:\/\//.test(p)) return p;
  return `https://${p}`;
}

export function generateTestEvents(nodes: N[], edges: E[], host: string, visitors = 400): CleanEvent[] {
  const out: CleanEvent[] = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, string[]>();
  const incoming = new Set<string>();
  for (const e of edges) {
    outgoing.set(e.source, [...(outgoing.get(e.source) ?? []), e.target]);
    incoming.add(e.target);
  }
  const starts = nodes.filter((n) => !incoming.has(n.id) && n.data.category !== "offline");
  if (!starts.length) return out;
  const now = Date.now();
  const keep: Record<string, number> = {};
  for (const n of nodes) keep[n.id] = 0.35 + Math.random() * 0.45;

  for (let i = 0; i < visitors; i++) {
    const vid = `test_${i}_${Math.random().toString(36).slice(2, 8)}`;
    let ts = now - Math.random() * 29 * 86400_000;
    let utm = "";
    let lastUrl = `https://${host}/`;
    const visited = new Set<string>();
    let current: N | undefined = rand(starts);
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      const d = current.data;
      const base = {
        name: "",
        visitor_id: vid,
        session_id: vid,
        referrer: "",
        utm_source: utm,
        utm_medium: "",
        utm_campaign: "",
        utm_content: "",
        utm_term: "",
        element: "",
        value: null as number | null,
        scroll: null as number | null,
      };
      if (d.category === "source") {
        const tok = (d.sourceMatch ?? "").split(",")[0]?.trim() ?? "";
        utm = tok === "(direct)" ? "" : tok;
      } else if (d.category === "page") {
        const url = pageUrl(d, host);
        if (url) {
          lastUrl = url;
          const path = new URL(url).pathname;
          const at = new Date(ts);
          out.push({ ...base, utm_source: utm, type: "pageview", url, path, ts: at });
          const depth = Math.random();
          for (const t of [25, 50, 75, 100]) {
            if (depth * 110 >= t) out.push({ ...base, utm_source: utm, type: "scroll", url, path, scroll: t, ts: at });
          }
          if (Math.random() < 0.45) {
            out.push({ ...base, utm_source: utm, type: "click", url, path, element: "Przycisk CTA", ts: new Date(ts + 20_000) });
          }
        }
      } else if (d.category === "action" && d.eventType) {
        const path = new URL(lastUrl).pathname;
        out.push({
          ...base,
          utm_source: utm,
          type: d.eventType,
          name: d.eventType === "custom" ? (d.eventName ?? "") : (d.eventName ?? ""),
          element: d.eventType === "click" ? (d.eventName ?? "Przycisk CTA") : "",
          scroll: d.eventType === "scroll" ? Number(d.eventName || 75) : null,
          value: d.eventType === "purchase" ? rand([97, 197, 297, 497]) : null,
          url: lastUrl,
          path,
          ts: new Date(ts),
        });
      }
      ts += 30_000 + Math.random() * 600_000;
      const next = outgoing.get(current.id) ?? [];
      if (!next.length) break;
      // Ze źródeł przechodzą wszyscy; dalej część osób odpada.
      if (d.category !== "source" && Math.random() > keep[current.id]) break;
      current = byId.get(rand(next));
    }
  }
  return out;
}
