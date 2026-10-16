// Pętla SOP „Analiza i poprawa reklam pod cel zysku” – zawsze te same kroki, zawsze od początku do końca.
import { newId, one, q } from "./db";
import { loadTests } from "./ad-tests-data";
import { reality, today, type GoalRow } from "./loop-data";

import { DECISIONS, MEASURE_TASK, STEPS } from "./loop-def";
export * from "./loop-def";

export interface Variant { letter: string; desc: string; spend?: number | null; revenue?: number | null; manual?: boolean }
export interface SopTest {
  id: string;
  loop_id: string | null;
  status: string;
  hypothesis: string;
  element: string;
  stage: string;
  metric: string;
  gain_estimate: number | null;
  cost_budget: number | null;
  cost_hours: number | null;
  override_reason: string;
  variants: Variant[];
  start_date: string | null;
  end_date: string | null;
  budget: number | null;
  end_condition: string;
  ad_test_id: string | null;
  result: { decision?: string; winner?: string; loop_id?: string; profit?: Record<string, number | null> };
  decided_at: string | null;
  checklist: { id: string; title: string; who: string | null; due: string; done: boolean; required: boolean }[];
  /** wyliczony stan: zaplanowany / wdrażany / w trakcie / do rozstrzygnięcia / zamknięty */
  phase: string;
}

const j = <T>(v: unknown, d: T): T => (v == null ? d : typeof v === "string" ? (JSON.parse(v) as T) : (v as T));

export async function listTests(projectId: string): Promise<SopTest[]> {
  const [rows, checks] = await Promise.all([
    q<Record<string, unknown>>(
      `SELECT id, loop_id, status, hypothesis, element, stage, metric, gain_estimate, cost_budget, cost_hours, override_reason, variants,
              to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date, budget, end_condition, ad_test_id, result,
              to_char(decided_at, 'YYYY-MM-DD') AS decided_at
       FROM sop_tests WHERE project_id = $1 ORDER BY created_at`,
      [projectId],
    ),
    q<{ id: string; test_id: string; title: string; who: string | null; due: string; done: boolean; required: boolean }>(
      "SELECT id, test_id, title, who, to_char(due, 'YYYY-MM-DD') AS due, done, required FROM tasks WHERE project_id = $1 AND test_id IS NOT NULL ORDER BY required, due, created_at",
      [projectId],
    ),
  ]);
  const t = today();
  return rows.map((r) => {
    const checklist = checks.filter((c) => c.test_id === r.id).map(({ test_id: _x, ...c }) => c);
    const result = j<SopTest["result"]>(r.result, {});
    const ready = checklist.length > 0 && checklist.every((c) => c.done);
    const phase = result.decision && result.decision !== "przedłużyć"
      ? "zamknięty"
      : r.end_date && (r.end_date as string) <= t && ready
        ? "do rozstrzygnięcia"
        : ready && r.start_date && (r.start_date as string) <= t
          ? "w trakcie"
          : checklist.length
            ? "wdrażany"
            : "zaplanowany";
    return {
      ...(r as unknown as SopTest),
      gain_estimate: r.gain_estimate == null ? null : Number(r.gain_estimate),
      cost_budget: r.cost_budget == null ? null : Number(r.cost_budget),
      cost_hours: r.cost_hours == null ? null : Number(r.cost_hours),
      budget: r.budget == null ? null : Number(r.budget),
      variants: j<Variant[]>(r.variants, []),
      result,
      checklist,
      phase,
    };
  });
}

/** Ostrzeżenia o kolizji: dwa niezamknięte testy na tym samym etapie lejka w nakładających się terminach. */
export function collisions(tests: SopTest[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  const open = tests.filter((t) => t.phase !== "zamknięty" && t.start_date && t.end_date);
  for (const a of open)
    for (const b of open)
      if (a.id !== b.id && a.stage && a.stage === b.stage && a.start_date! <= b.end_date! && b.start_date! <= a.end_date!)
        (out[a.id] ??= []).push(b.hypothesis);
  return out;
}

export async function activeGoal(projectId: string): Promise<GoalRow | null> {
  const t = today();
  const g = await one<GoalRow & { diag: unknown }>(
    `SELECT id, period, to_char(date_from, 'YYYY-MM-DD') AS date_from, to_char(date_to, 'YYYY-MM-DD') AS date_to, profit_target, diag, approved_by
     FROM goals WHERE project_id = $1 AND date_to >= $2::date ORDER BY date_from <= $2::date DESC, created_at DESC LIMIT 1`,
    [projectId, t],
  );
  return g ? { ...g, profit_target: Number(g.profit_target), diag: j(g.diag, {}) } : null;
}

export async function saveGoal(projectId: string, b: { period: string; date_from: string; date_to: string; profit_target: number; diag?: Record<string, number>; approved_by?: string }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date_from) || !/^\d{4}-\d{2}-\d{2}$/.test(b.date_to) || b.date_from > b.date_to) throw new Error("Podaj okres celu");
  if (!Number.isFinite(b.profit_target)) throw new Error("Podaj cel profitu w zł");
  const id = newId();
  await q("INSERT INTO goals (id, project_id, period, date_from, date_to, profit_target, diag, approved_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [
    id, projectId, b.period, b.date_from, b.date_to, b.profit_target, JSON.stringify(b.diag ?? {}), (b.approved_by ?? "").slice(0, 200),
  ]);
  return id;
}

export interface LoopRow { id: string; step: number; data: Record<string, Record<string, unknown>>; started_at: string; finished_at: string | null }
const LSEL = "SELECT id, step, data, to_char(started_at, 'YYYY-MM-DD') AS started_at, to_char(finished_at, 'YYYY-MM-DD') AS finished_at FROM loops";
const asLoop = (r: (Omit<LoopRow, "data"> & { data: unknown }) | null): LoopRow | null => (r ? { ...r, data: j(r.data, {}) } : null);

type Action = { id: string; title: string; due: string; done: boolean; level: string | null };
const actionsOf = (lid: string) =>
  q<Action>("SELECT id, title, to_char(due, 'YYYY-MM-DD') AS due, done, level FROM tasks WHERE review_id = $1 AND test_id IS NULL ORDER BY due, created_at", [lid]);

export async function loopState(projectId: string) {
  const [active, prev, goal, tests] = await Promise.all([
    one(`${LSEL} WHERE project_id = $1 AND finished_at IS NULL ORDER BY started_at DESC LIMIT 1`, [projectId]).then((r) => asLoop(r as never)),
    one(`${LSEL} WHERE project_id = $1 AND finished_at IS NOT NULL ORDER BY finished_at DESC, started_at DESC LIMIT 1`, [projectId]).then((r) => asLoop(r as never)),
    activeGoal(projectId),
    listTests(projectId),
  ]);
  const [actions, prevActions, learnings, funnels, adTests] = await Promise.all([
    active ? actionsOf(active.id) : [],
    prev ? actionsOf(prev.id) : [],
    q<{ id: string; stage: string; element: string; text: string; profit_delta: number | null; created_at: string; test_id: string | null }>(
      "SELECT id, stage, element, text, profit_delta, to_char(created_at, 'YYYY-MM-DD') AS created_at, test_id FROM learnings WHERE project_id = $1 ORDER BY created_at DESC LIMIT 200",
      [projectId],
    ),
    q<{ id: string; name: string }>("SELECT id, name FROM funnels WHERE project_id = $1 ORDER BY updated_at DESC", [projectId]),
    q<{ id: string; angle: string }>("SELECT id, angle FROM ad_tests WHERE project_id = $1 ORDER BY created_at DESC", [projectId]).catch(() => []),
  ]);
  const t = today();
  return {
    active, prev, goal, actions, prevActions, learnings, tests, funnels, adTests,
    collisions: collisions(tests),
    /** testy, których termin minął i czekają na rozstrzygnięcie (z każdej pętli) */
    due: tests.filter((x) => x.phase !== "zamknięty" && x.end_date && x.end_date <= t),
  };
}
export type LoopState = Awaited<ReturnType<typeof loopState>>;

export async function startLoop(projectId: string) {
  const open = await one<{ id: string }>("SELECT id FROM loops WHERE project_id = $1 AND finished_at IS NULL", [projectId]);
  if (open) return open.id;
  const id = newId();
  await q("INSERT INTO loops (id, project_id) VALUES ($1, $2)", [id, projectId]);
  return id;
}

async function loopProject(lid: string) {
  const r = await one<{ project_id: string; step: number; data: unknown; finished_at: string | null }>("SELECT project_id, step, data, finished_at FROM loops WHERE id = $1", [lid]);
  if (!r) throw new Error("Brak pętli");
  if (r.finished_at) throw new Error("Ta pętla jest zakończona");
  return { projectId: r.project_id, step: r.step, data: j<LoopRow["data"]>(r.data, {}) };
}

/** Sprawdza, czy krok jest wykonany (zapis = warunek przejścia). Zwraca listę braków. */
async function missing(lid: string, projectId: string, step: number, data: LoopRow["data"]): Promise<string[]> {
  const st = await loopState(projectId);
  const key = STEPS[step].key;
  const d = data[key] ?? {};
  const out: string[] = [];
  const mine = st.tests.filter((x) => x.loop_id === lid);
  if (key === "cel") {
    if (!st.goal) out.push("Ustal cel profitu i okres.");
    const ratings = (d.ratings ?? {}) as Record<string, { effect?: string }>;
    for (const a of st.prevActions) if (!ratings[a.id]?.effect) out.push(`Rozlicz działanie z poprzedniej pętli: „${a.title}”.`);
  }
  if (key === "rzeczywistosc" && d.reliable !== true) out.push("Potwierdź, że dane są wiarygodne. Jeśli nie są – najpierw napraw pomiar (SOP stoi).");
  if (key === "luka") {
    if (!Array.isArray(d.levers) || !d.levers.length) out.push("Wybierz dźwignie, które ruszasz.");
    if (!String(d.why ?? "").trim()) out.push("Wpisz krótkie uzasadnienie.");
  }
  if (key === "lejek") {
    if (!d.funnelId) out.push("Wybierz lejek.");
    if (!String(d.stage ?? "").trim()) out.push("Wskaż wąskie gardło (etap).");
  }
  if (key === "test" && !mine.length && !String(d.skip ?? "").trim()) out.push("Zaplanuj test albo wpisz, dlaczego w tej pętli nie ma nowego testu.");
  if (key === "kalendarz")
    for (const x of mine) if (!x.start_date || !x.end_date || x.budget == null || !x.end_condition.trim()) out.push(`Ustaw daty, budżet i warunek zakończenia: „${x.hypothesis}”.`);
  if (key === "checklista")
    for (const x of mine) if (!x.checklist.some((c) => !c.required)) out.push(`Dodaj zadania wdrożenia: „${x.hypothesis}”.`);
  if (key === "rozstrzygniecie") for (const x of st.due) if (!x.result.decision || x.result.decision === "przedłużyć" && x.end_date! <= today()) out.push(`Rozstrzygnij albo przedłuż: „${x.hypothesis}”.`);
  if (key === "wnioski") {
    const decided = st.tests.filter((x) => x.result.loop_id === lid && x.result.decision && x.result.decision !== "przedłużyć");
    for (const x of decided) if (!st.learnings.some((l) => l.test_id === x.id)) out.push(`Zapisz wniosek z testu: „${x.hypothesis}”.`);
    if (!String(d.summary ?? "").trim()) out.push("Zapisz, czy cel się ruszył i co dalej.");
  }
  return out;
}

export async function saveStep(lid: string, step: number, patch: Record<string, unknown>, advance: boolean) {
  const { projectId, step: cur, data } = await loopProject(lid);
  if (!Number.isInteger(step) || step < 0 || step >= STEPS.length) throw new Error("Zły krok");
  if (step > cur) throw new Error("Najpierw zakończ wcześniejsze kroki");
  const key = STEPS[step].key;
  const merged = { ...data, [key]: { ...(data[key] ?? {}), ...patch } };
  if (key === "rzeczywistosc" && patch.reliable === true) {
    const r = await reality(projectId);
    merged[key].snapshot = { date: r.today, wide: r.wide, widePrev: r.widePrev, gaps: r.gaps };
  }
  await q("UPDATE loops SET data = $2 WHERE id = $1", [lid, JSON.stringify(merged)]);
  if (!advance) return { missing: [] as string[] };
  const miss = await missing(lid, projectId, step, merged);
  if (miss.length) return { missing: miss };
  if (step === STEPS.length - 1) {
    await finish(lid, projectId, merged);
    return { missing: [], finished: true };
  }
  await q("UPDATE loops SET step = GREATEST(step, $2) WHERE id = $1", [lid, step + 1]);
  return { missing: [] };
}

/** Rozliczenie działania z poprzedniej pętli; „przenieś” tworzy to samo zadanie w bieżącej pętli. */
export async function rateAction(lid: string, taskId: string, effect: string, carry: boolean, due?: string) {
  const { projectId, data } = await loopProject(lid);
  const t = await one<{ title: string; project_id: string }>("SELECT title, project_id FROM tasks WHERE id = $1", [taskId]);
  if (!t || t.project_id !== projectId) throw new Error("Brak zadania");
  const cel = { ...(data.cel ?? {}) } as Record<string, unknown>;
  const ratings = { ...((cel.ratings as Record<string, unknown>) ?? {}) };
  ratings[taskId] = { effect, carry };
  cel.ratings = ratings;
  await q("UPDATE loops SET data = $2 WHERE id = $1", [lid, JSON.stringify({ ...data, cel })]);
  if (carry) await q("INSERT INTO tasks (id, project_id, title, due, review_id, level) VALUES ($1,$2,$3,$4,$5,'przeniesione')", [newId(), projectId, t.title, due && /^\d{4}-\d{2}-\d{2}$/.test(due) ? due : today(), lid]);
}

export async function addLoopAction(lid: string, title: string, due: string, level: string) {
  const { projectId } = await loopProject(lid);
  if (!title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error("Wpisz działanie i termin");
  await q("INSERT INTO tasks (id, project_id, title, due, review_id, level) VALUES ($1,$2,$3,$4,$5,$6)", [newId(), projectId, title.trim().slice(0, 300), due, lid, level]);
}

async function finish(lid: string, projectId: string, data: LoopRow["data"]) {
  const actions = await actionsOf(lid);
  const st = await loopState(projectId);
  const snap = data.rzeczywistosc?.snapshot as { wide?: { profit: number } } | undefined;
  const lines = [
    st.goal ? `Cel: ${Math.round(st.goal.profit_target)} zł profitu (${st.goal.date_from} – ${st.goal.date_to})` : "",
    snap?.wide ? `Profit 60 dni w dniu analizy: ${Math.round(snap.wide.profit)} zł` : "",
    data.luka?.why ? `Luka – dźwignie: ${(data.luka.levers as string[] | undefined)?.join(", ") ?? ""}. ${data.luka.why}` : "",
    data.lejek?.stage ? `Wąskie gardło: ${data.lejek.stage}` : "",
    data.wnioski?.summary ? `Wnioski: ${data.wnioski.summary}` : "",
    ...(actions.length ? ["Działania:", ...actions.map((a) => `• ${a.title} – do ${a.due}`)] : []),
  ].filter(Boolean);
  await q(
    "INSERT INTO timeline_events (id, project_id, day, type, title, description, source, confidence) VALUES ($1,$2,$3,'analiza',$4,$5,'Pętla SOP','memory')",
    [newId(), projectId, today(), `Analiza SOP: ${actions.length} ${actions.length === 1 ? "działanie" : "działań"}`, lines.join("\n")],
  );
  await q("UPDATE loops SET finished_at = now(), step = $2 WHERE id = $1", [lid, STEPS.length]);
}

/* ---------- Karta testu ---------- */

export async function createTest(projectId: string, lid: string | null, b: Partial<SopTest>) {
  if (!b.hypothesis?.trim()) throw new Error("Wpisz hipotezę");
  const variants = (b.variants ?? []).filter((v) => v.desc?.trim());
  if (variants.length < 2) throw new Error("Test ma co najmniej 2 warianty (A = kontrola).");
  const id = newId();
  await q(
    `INSERT INTO sop_tests (id, project_id, loop_id, hypothesis, element, stage, metric, gain_estimate, cost_budget, cost_hours, override_reason, variants, ad_test_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [id, projectId, lid, b.hypothesis.trim(), b.element ?? "reklama", b.stage ?? "", b.metric ?? "", b.gain_estimate ?? null, b.cost_budget ?? null, b.cost_hours ?? null,
      b.override_reason ?? "", JSON.stringify(variants), b.ad_test_id || null],
  );
  return id;
}

export async function updateTest(tid: string, b: Partial<SopTest> & { decision?: string; winner?: string; loop_id_decided?: string }) {
  const cur = await one<{ project_id: string; result: unknown; variants: unknown; end_date: string | null }>(
    "SELECT project_id, result, variants, to_char(end_date, 'YYYY-MM-DD') AS end_date FROM sop_tests WHERE id = $1",
    [tid],
  );
  if (!cur) throw new Error("Brak testu");
  const sets: string[] = [];
  const vals: unknown[] = [tid];
  const set = (col: string, v: unknown) => {
    vals.push(v);
    sets.push(`${col} = $${vals.length}`);
  };
  for (const k of ["hypothesis", "element", "stage", "metric", "override_reason", "end_condition"] as const) if (typeof b[k] === "string") set(k, b[k]);
  for (const k of ["gain_estimate", "cost_budget", "cost_hours", "budget"] as const) if (k in b) set(k, b[k] == null || b[k] === ("" as never) ? null : Number(b[k]));
  for (const k of ["start_date", "end_date"] as const) if (typeof b[k] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b[k]!)) set(k, b[k]);
  if ("ad_test_id" in b) set("ad_test_id", b.ad_test_id || null);
  if (Array.isArray(b.variants)) set("variants", JSON.stringify(b.variants));
  if (b.decision) {
    if (!(DECISIONS as readonly string[]).includes(b.decision)) throw new Error("Zła decyzja");
    if (b.decision !== "przedłużyć" && cur.end_date && cur.end_date > today()) throw new Error("Warunek zakończenia niespełniony (termin) – za mało danych. Możesz przedłużyć.");
    const result = { ...j<SopTest["result"]>(cur.result, {}), decision: b.decision, winner: b.winner ?? undefined, loop_id: b.loop_id_decided };
    set("result", JSON.stringify(result));
    if (b.decision !== "przedłużyć") sets.push("decided_at = now()");
  }
  if (!sets.length) return;
  await q(`UPDATE sop_tests SET ${sets.join(", ")} WHERE id = $1`, vals);
  if (b.start_date || b.end_date) await syncTestCalendar(tid);
}

/** Wpis testu na osi czasu (start) – pokaże się na wykresach. Pasek w kalendarzu pochodzi z dat testu. */
async function syncTestCalendar(tid: string) {
  const t = await one<{ project_id: string; hypothesis: string; start_date: string | null; end_date: string | null }>(
    "SELECT project_id, hypothesis, to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(end_date, 'YYYY-MM-DD') AS end_date FROM sop_tests WHERE id = $1",
    [tid],
  );
  if (!t?.start_date) return;
  await q("DELETE FROM timeline_events WHERE project_id = $1 AND source = 'Pętla SOP' AND link = $2", [t.project_id, `test:${tid}`]);
  await q(
    "INSERT INTO timeline_events (id, project_id, day, type, title, description, source, link, confidence) VALUES ($1,$2,$3,'test',$4,$5,'Pętla SOP',$6,'data')",
    [newId(), t.project_id, t.start_date, `Start testu: ${t.hypothesis}`, t.end_date ? `Koniec: ${t.end_date}` : "", `test:${tid}`],
  );
  // obowiązkowy ostatni punkt checklisty
  const has = await one("SELECT id FROM tasks WHERE test_id = $1 AND required", [tid]);
  if (!has)
    await q("INSERT INTO tasks (id, project_id, title, due, test_id, required, who) VALUES ($1,$2,$3,$4,$5,true,'Paweł')", [
      newId(), t.project_id, `${MEASURE_TASK}: ${t.hypothesis}`.slice(0, 300), t.start_date, tid,
    ]);
}

export async function addChecklistItem(tid: string, title: string, who: string, due: string) {
  const t = await one<{ project_id: string }>("SELECT project_id FROM sop_tests WHERE id = $1", [tid]);
  if (!t) throw new Error("Brak testu");
  if (!title.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(due)) throw new Error("Wpisz zadanie i termin");
  await q("INSERT INTO tasks (id, project_id, title, due, test_id, who) VALUES ($1,$2,$3,$4,$5,$6)", [newId(), t.project_id, title.trim().slice(0, 300), due, tid, who.slice(0, 80)]);
}

/** Wyniki wariantów: z modułu testów reklam (gdy podpięty) albo wpisane ręcznie. Profit wariantu = przychód − koszt. */
export async function testResults(projectId: string, x: SopTest) {
  let auto: Record<string, { spend: number; revenue: number }> = {};
  if (x.ad_test_id) {
    const r = await loadTests(projectId, x.ad_test_id).catch(() => null);
    const round = r?.tests[0]?.current;
    if (round) for (const v of round.variants) auto[v.letter] = { spend: v.totals.spend, revenue: v.totals.revenue };
  }
  if (!Object.keys(auto).length) auto = {};
  return x.variants.map((v) => {
    const a = auto[v.letter];
    const spend = a ? a.spend : v.spend ?? null;
    const revenue = a ? a.revenue : v.revenue ?? null;
    return { letter: v.letter, desc: v.desc, spend, revenue, profit: spend != null && revenue != null ? revenue - spend : null, source: a ? "Testy reklam (UTM)" : v.spend != null ? "wpisane ręcznie" : null };
  });
}

export async function addLearning(lid: string, b: { test_id?: string; stage?: string; element?: string; text: string; profit_delta?: number | null }) {
  const { projectId } = await loopProject(lid);
  if (!b.text?.trim()) throw new Error("Wpisz wniosek");
  await q("INSERT INTO learnings (id, project_id, loop_id, test_id, stage, element, text, profit_delta) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [
    newId(), projectId, lid, b.test_id ?? null, b.stage ?? "", b.element ?? "", b.text.trim().slice(0, 1000), b.profit_delta ?? null,
  ]);
}
