import { newId, one, q } from "./db";
import { SOP, type Review, type ReviewNote } from "./sop";

const parse = (r: { notes: unknown } & Omit<Review, "notes">): Review => ({ ...r, notes: (typeof r.notes === "string" ? JSON.parse(r.notes) : r.notes) as Record<string, ReviewNote> });

export interface ReviewState {
  active: Review | null;
  last: Review | null;
  /** działania zapisane w poprzednim (zakończonym) przeglądzie */
  lastActions: { id: string; title: string; due: string; done: boolean; level: string | null }[];
  actions: { id: string; title: string; due: string; done: boolean; level: string | null }[];
}

const SEL = "SELECT id, step, notes, to_char(started_at, 'YYYY-MM-DD HH24:MI') AS started_at, to_char(finished_at, 'YYYY-MM-DD') AS finished_at FROM reviews";
const actionsOf = (rid: string) =>
  q<{ id: string; title: string; due: string; done: boolean; level: string | null }>(
    "SELECT id, title, to_char(due, 'YYYY-MM-DD') AS due, done, level FROM tasks WHERE review_id = $1 ORDER BY due, created_at",
    [rid],
  );

export async function reviewState(projectId: string): Promise<ReviewState> {
  const [a, l] = await Promise.all([
    one<Review & { notes: unknown }>(`${SEL} WHERE project_id = $1 AND finished_at IS NULL ORDER BY started_at DESC LIMIT 1`, [projectId]),
    one<Review & { notes: unknown }>(`${SEL} WHERE project_id = $1 AND finished_at IS NOT NULL ORDER BY finished_at DESC LIMIT 1`, [projectId]),
  ]);
  const active = a ? parse(a) : null;
  const last = l ? parse(l) : null;
  const [actions, lastActions] = await Promise.all([active ? actionsOf(active.id) : [], last ? actionsOf(last.id) : []]);
  return { active, last, actions, lastActions };
}

export async function startReview(projectId: string): Promise<string> {
  const open = await one<{ id: string }>("SELECT id FROM reviews WHERE project_id = $1 AND finished_at IS NULL", [projectId]);
  if (open) return open.id;
  const id = newId();
  await q("INSERT INTO reviews (id, project_id) VALUES ($1, $2)", [id, projectId]);
  return id;
}

/** Zapis notatki kroku i przejście dalej (bez notatki albo „bez uwag” nie da się przejść). */
export async function saveStep(rid: string, step: number, note: ReviewNote, advance: boolean) {
  if (step < 0 || step >= SOP.length) throw new Error("Zły krok");
  if (advance && !note.note.trim() && !note.ok) throw new Error("Zapisz, co zauważyłeś – albo zaznacz „bez uwag”.");
  const key = SOP[step].key;
  const row = await one<{ id: string }>(
    `UPDATE reviews SET notes = notes || jsonb_build_object($2::text, $3::jsonb), step = GREATEST(step, $4) WHERE id = $1 AND finished_at IS NULL RETURNING id`,
    [rid, key, JSON.stringify({ note: note.note.trim().slice(0, 4000), ok: !!note.ok }), advance ? step + 1 : step],
  );
  if (!row) throw new Error("Przegląd jest zakończony albo nie istnieje");
}

export async function addAction(rid: string, title: string, due: string, level: string) {
  const r = await one<{ project_id: string }>("SELECT project_id FROM reviews WHERE id = $1", [rid]);
  if (!r) throw new Error("Brak przeglądu");
  if (!title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error("Wpisz działanie i termin");
  await q("INSERT INTO tasks (id, project_id, title, due, review_id, level) VALUES ($1, $2, $3, $4, $5, $6)", [newId(), r.project_id, title.trim().slice(0, 300), due, rid, level]);
}

/** Zakończenie: wnioski z każdego poziomu + działania trafiają na oś czasu (wracają do makro). */
export async function finishReview(rid: string) {
  const r = await one<{ project_id: string; notes: unknown; step: number }>("SELECT project_id, notes, step FROM reviews WHERE id = $1 AND finished_at IS NULL", [rid]);
  if (!r) throw new Error("Przegląd jest zakończony albo nie istnieje");
  const notes = (typeof r.notes === "string" ? JSON.parse(r.notes) : r.notes) as Record<string, ReviewNote>;
  const missing = SOP.filter((s) => !notes[s.key]?.note?.trim() && !notes[s.key]?.ok);
  if (missing.length) throw new Error(`Uzupełnij: ${missing.map((s) => s.label).join(", ")}`);
  const actions = await actionsOf(rid);
  const lines = [
    ...SOP.map((s) => `${s.level} (${s.label}): ${notes[s.key].ok && !notes[s.key].note.trim() ? "bez uwag" : notes[s.key].note.trim()}`),
    ...(actions.length ? ["", "Działania:", ...actions.map((a) => `• ${a.title} – do ${a.due}`)] : []),
  ];
  const today = new Date().toISOString().slice(0, 10);
  await q(
    `INSERT INTO timeline_events (id, project_id, day, type, title, description, source, confidence) VALUES ($1, $2, $3, 'przegląd', $4, $5, 'Przegląd', 'memory')`,
    [newId(), r.project_id, today, `Przegląd: ${actions.length} ${actions.length === 1 ? "działanie" : "działań"}`, lines.join("\n")],
  );
  await q("UPDATE reviews SET finished_at = now(), step = $2 WHERE id = $1", [rid, SOP.length]);
}
