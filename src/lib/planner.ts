// Planer projektu: własne zadania + terminy z testów reklam (start rundy, werdykt).
import { newId, newKey, one, q } from "./db";

export interface PlanItem {
  id: string;
  kind: "task" | "start" | "verdict";
  title: string;
  date: string; // RRRR-MM-DD
  done: boolean;
  link?: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function planItems(projectId: string, from: string, to: string): Promise<PlanItem[]> {
  if (!DAY.test(from) || !DAY.test(to)) throw new Error("Daty w formacie RRRR-MM-DD");
  const [tasks, rounds] = await Promise.all([
    q<{ id: string; title: string; due: string; done: boolean }>(
      "SELECT id, title, to_char(due, 'YYYY-MM-DD') AS due, done FROM tasks WHERE project_id = $1 AND due BETWEEN $2::date AND $3::date ORDER BY due, created_at",
      [projectId, from, to],
    ),
    q<{ id: string; test_id: string; number: number; angle: string; start_date: string; verdict_date: string | null; status: string }>(
      `SELECT r.id, r.test_id, r.number, t.angle, to_char(r.start_date, 'YYYY-MM-DD') AS start_date, to_char(r.verdict_date, 'YYYY-MM-DD') AS verdict_date, r.status
       FROM ad_test_rounds r JOIN ad_tests t ON t.id = r.test_id
       WHERE t.project_id = $1 AND (r.start_date BETWEEN $2::date AND $3::date OR r.verdict_date BETWEEN $2::date AND $3::date)`,
      [projectId, from, to],
    ),
  ]);
  const items: PlanItem[] = tasks.map((t) => ({ id: t.id, kind: "task", title: t.title, date: t.due, done: t.done }));
  for (const r of rounds) {
    const link = `/projects/${projectId}/testy/${r.test_id}`;
    const closed = r.status !== "w toku";
    if (r.start_date >= from && r.start_date <= to)
      items.push({ id: `s-${r.id}`, kind: "start", title: `Start rundy R${r.number} – ${r.angle}: włącz reklamy`, date: r.start_date, done: closed, link });
    if (r.verdict_date && r.verdict_date >= from && r.verdict_date <= to)
      items.push({ id: `v-${r.id}`, kind: "verdict", title: `Werdykt R${r.number} – ${r.angle}: sprawdź wyniki i zatwierdź decyzję`, date: r.verdict_date, done: closed, link });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

export async function addTask(projectId: string, title: string, due: string) {
  if (!title.trim()) throw new Error("Wpisz, co masz zrobić");
  if (!DAY.test(due)) throw new Error("Wybierz datę");
  return one("INSERT INTO tasks (id, project_id, title, due) VALUES ($1, $2, $3, $4) RETURNING id", [newId(), projectId, title.trim().slice(0, 300), due]);
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

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
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
      `DTSTART;VALUE=DATE:${icsDate(it.date)}`,
      `DTEND;VALUE=DATE:${icsDate(nextDay(it.date))}`,
      `SUMMARY:${esc((it.done ? "✓ " : "") + it.title)}`,
      ...(it.link ? [`URL:${origin}${it.link}`] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
