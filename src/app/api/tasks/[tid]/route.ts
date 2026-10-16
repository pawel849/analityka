import { body, guarded, json, notFound, type Params } from "@/lib/api";
import { one } from "@/lib/db";

export const PATCH = guarded(async (req, { params }: Params<"tid">) => {
  const { tid } = await params;
  const b = await body<{ done?: boolean; title?: string; due?: string; time?: string | null }>(req);
  const due = b.due && /^\d{4}-\d{2}-\d{2}$/.test(b.due) ? b.due : null;
  const time = b.time === undefined ? undefined : b.time && /^([01]\d|2[0-3]):[0-5]\d$/.test(b.time) ? b.time : null;
  const row = await one(
    `UPDATE tasks SET done = COALESCE($2, done), title = COALESCE($3, title), due = COALESCE($4::date, due),
       time = CASE WHEN $5::boolean THEN $6 ELSE time END WHERE id = $1 RETURNING id`,
    [tid, typeof b.done === "boolean" ? b.done : null, b.title?.trim() || null, due, time !== undefined, time ?? null],
  );
  return row ? json({ ok: true }) : notFound();
});

export const DELETE = guarded(async (_req, { params }: Params<"tid">) => {
  const { tid } = await params;
  const row = await one("DELETE FROM tasks WHERE id = $1 RETURNING id", [tid]);
  return row ? json({ ok: true }) : notFound();
});
