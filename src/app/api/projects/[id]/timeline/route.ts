import { body, guarded, json, notFound, type Params } from "@/lib/api";
import { newId, one, q } from "@/lib/db";
import { loadAds, loadOrders, loadSettings } from "@/lib/project-data";
import { detectEvents, monthly, prepare } from "@/lib/economics";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const CONF = new Set(["data", "email", "memory", "gap"]);

/** Oś czasu: zdarzenia ręczne + wykryte w danych + seria miesięczna przychodu i wydatków. */
export const GET = guarded(async (_req, { params }: Params<"id">) => {
  const { id } = await params;
  const [settings, orders, ads, manual] = await Promise.all([
    loadSettings(id),
    loadOrders(id),
    loadAds(id),
    q(`SELECT id, to_char(day, 'YYYY-MM-DD') AS day, type, title, description, source, link, confidence FROM timeline_events WHERE project_id = $1 ORDER BY day`, [id]),
  ]);
  const p = prepare(orders, settings);
  const days = [...orders.map((o) => new Date(o.ts).toISOString().slice(0, 10)), ...ads.flatMap((a) => [a.start, a.end]), ...manual.map((m) => String(m.day))].sort();
  const series = days.length ? monthly(p, ads, settings, days[0], days[days.length - 1]) : [];
  return json({ manual, auto: detectEvents(p, ads, settings), series, currency: settings.currency });
});

export const POST = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const b = await body<{ day?: string; type?: string; title?: string; description?: string; source?: string; link?: string; confidence?: string }>(req);
  if (!b.day || !DAY.test(b.day) || !b.title?.trim()) return json({ error: "Podaj datę i tytuł" }, 400);
  const row = await one(
    `INSERT INTO timeline_events (id, project_id, day, type, title, description, source, link, confidence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [newId(), id, b.day, (b.type ?? "decyzja").slice(0, 40), b.title.trim().slice(0, 300), (b.description ?? "").slice(0, 4000),
      (b.source ?? "").slice(0, 200), (b.link ?? "").slice(0, 1000), CONF.has(b.confidence ?? "") ? b.confidence : "data"],
  );
  return json(row, 201);
});

export const DELETE = guarded(async (req, { params }: Params<"id">) => {
  const { id } = await params;
  const ev = new URL(req.url).searchParams.get("event");
  const row = await one("DELETE FROM timeline_events WHERE id = $1 AND project_id = $2 RETURNING id", [ev, id]);
  return row ? json({ ok: true }) : notFound();
});
