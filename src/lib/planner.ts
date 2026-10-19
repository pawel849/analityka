// Planer projektu: własne zadania + terminy z testów reklam (start rundy, werdykt) + daty sprawdzenia decyzji z sesji.
import { newId, newKey, one, q } from "./db";

export interface PlanItem {
  id: string;
  kind: "task" | "round";
  title: string;
  /** termin (deadline) – RRRR-MM-DD */
  date: string;
  /** początek okresu (pasek od start do terminu); brak = zadanie jednodniowe */
  start?: string;
  /** godzina „HH:MM” (tylko zadania jednodniowe) */
  time?: string | null;
  done: boolean;
  link?: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function planItems(projectId: string, from: string, to: string): Promise<PlanItem[]> {
  if (!DAY.test(from) || !DAY.test(to)) throw new Error("Daty w formacie RRRR-MM-DD");
  const [tasks, rounds, sopTests, decisions] = await Promise.all([
    q<{ id: string; title: string; due: string; start: string | null; time: string | null; done: boolean }>(
      `SELECT id, title, to_char(due, 'YYYY-MM-DD') AS due, to_char(start, 'YYYY-MM-DD') AS start, time, done FROM tasks
       WHERE project_id = $1 AND due >= $2::date AND coalesce(start, due) <= $3::date ORDER BY due, time NULLS FIRST, created_at`,
      [projectId, from, to],
    ),
    q<{ id: string; test_id: string; number: number; angle: string; start_date: string; verdict_date: string | null; status: string }>(
      `SELECT r.id, r.test_id, r.number, t.angle, to_char(r.start_date, 'YYYY-MM-DD') AS start_date, to_char(r.verdict_date, 'YYYY-MM-DD') AS verdict_date, r.status
       FROM ad_test_rounds r JOIN ad_tests t ON t.id = r.test_id
       WHERE t.project_id = $1 AND r.start_date <= $3::date AND coalesce(r.verdict_date, r.start_date) >= $2::date`,
      [projectId, from, to],
    ),
    q<{ id: string; hypothesis: string; start_date: string; end_date: string; decided_at: string | null }>(
      `SELECT id, hypothesis, to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date, decided_at FROM sop_tests
       WHERE project_id = $1 AND start_date IS NOT NULL AND end_date IS NOT NULL AND start_date <= $3::date AND end_date >= $2::date`,
      [projectId, from, to],
    ).catch(() => []),
    q<{ id: string; what: string; start_date: string; check_date: string; verdict: string | null }>(
      `SELECT id, what, to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(check_date, 'YYYY-MM-DD') AS check_date, verdict FROM decisions
       WHERE project_id = $1 AND start_date <= $3::date AND check_date >= $2::date`,
      [projectId, from, to],
    ).catch(() => []),
  ]);
  const items: PlanItem[] = tasks.map((t) => ({
    id: t.id, kind: "task", title: t.title, date: t.due, start: t.start && t.start < t.due ? t.start : undefined, time: t.time, done: t.done,
  }));
  for (const r of rounds) {
    const due = r.verdict_date ?? r.start_date;
    items.push({
      id: `r-${r.id}`, kind: "round", title: `Test: ${r.angle} – R${r.number} (werdykt)`, date: due,
      start: r.start_date < due ? r.start_date : undefined, done: r.status !== "w toku", link: `/projects/${projectId}/testy/${r.test_id}`,
    });
  }
  for (const t of sopTests)
    items.push({
      id: `t-${t.id}`, kind: "round", title: `Test: ${t.hypothesis} (koniec)`, date: t.end_date,
      start: t.start_date < t.end_date ? t.start_date : undefined, done: !!t.decided_at, link: `/projects/${projectId}/analiza`,
    });
  for (const d of decisions)
    items.push({
      id: `d-${d.id}`, kind: "round", title: `Sprawdzenie decyzji: ${d.what}`, date: d.check_date,
      start: d.start_date < d.check_date ? d.start_date : undefined, done: !!d.verdict, link: `/projects/${projectId}`,
    });
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

export async function addTask(projectId: string, title: string, due: string, start?: string | null, time?: string | null) {
  if (!title.trim()) throw new Error("Wpisz, co masz zrobić");
  if (!DAY.test(due)) throw new Error("Wybierz datę");
  const s = start && DAY.test(start) && start < due ? start : null;
  const t = time && TIME.test(time) && !s ? time : null;
  return one("INSERT INTO tasks (id, project_id, title, due, start, time) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id", [
    newId(), projectId, title.trim().slice(0, 300), due, s, t,
  ]);
}

/** Token subskrypcji kalendarza (tworzony przy pierwszym użyciu). */
export async function calendarToken(projectId: string): Promise<string | null> {
  const row = await one<{ calendar_token: string | null }>("SELECT calendar_token FROM projects WHERE id = $1", [projectId]);
  if (!row) return null;
  if (row.calendar_token) return row.calendar_token;
  const token = newKey() + newKey();
  await q("UPDATE projects SET calendar_token = $2 WHERE id = $1", [projectId, token]);
  return token;
}

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const icsDate = (d: string) => d.replace(/-/g, "");
const nextDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86400_000).toISOString().slice(0, 10);

/** Plik iCalendar (wydarzenia całodniowe) – do subskrypcji w Google / Apple / Outlook. */
export function toIcs(name: string, items: PlanItem[], origin: string): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Analityka//Planer//PL", "CALSCALE:GREGORIAN", `X-WR-CALNAME:${esc(name)}`];
  for (const it of items) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${it.id}@analityka`,
      `DTSTAMP:${stamp}`,
      ...(it.time && !it.start
        ? [`DTSTART;TZID=Europe/Warsaw:${icsDate(it.date)}T${it.time.replace(":", "")}00`, `DURATION:PT1H`]
        : [`DTSTART;VALUE=DATE:${icsDate(it.start ?? it.date)}`, `DTEND;VALUE=DATE:${icsDate(nextDay(it.date))}`]),
      `SUMMARY:${esc((it.done ? "✓ " : "") + it.title)}`,
      ...(it.link ? [`URL:${origin}${it.link}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
