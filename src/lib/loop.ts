// Sesja analityczna → decyzja w złotówkach. Zawsze te same kroki, zawsze od początku do końca.
// Dane per projekt (klient) – nic tu nie zależy od konkretnego klienta.
import { newId, one, q } from "./db";
import { loadSettings } from "./project-data";
import { addDays, engine, measure, predictionActuals, today, type EngineResult, type GoalRow } from "./loop-data";
import { hypothesisValue, METRICS, verdictImpact, type Econ, type MetricKey, type Metrics } from "./levers";
import { MEASURE_TASK, NO_CHANGE, STEPS, VERDICTS } from "./loop-def";

export * from "./loop-def";

const j = <T>(v: unknown, d: T): T => (v == null ? d : typeof v === "string" ? (JSON.parse(v) as T) : (v as T));
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const VERSION = 2;

/* ---------- Cel ---------- */

const GSEL = `SELECT id, period, to_char(date_from, 'YYYY-MM-DD') AS date_from, to_char(date_to, 'YYYY-MM-DD') AS date_to, profit_target, diag, approved_by FROM goals`;
const asGoal = (g: (GoalRow & { diag: unknown }) | null): GoalRow | null => (g ? { ...g, profit_target: Number(g.profit_target), diag: j(g.diag, {}) } : null);

export async function activeGoal(projectId: string): Promise<GoalRow | null> {
  const t = today();
  return asGoal(await one(`${GSEL} WHERE project_id = $1 AND date_to >= $2::date ORDER BY date_from <= $2::date DESC, created_at DESC LIMIT 1`, [projectId, t]));
}

/** Ostatni cel (także wygasły) – do auto-uzupełnienia, gdy nic się nie zmieniło. */
export async function lastGoal(projectId: string): Promise<GoalRow | null> {
  return asGoal(await one(`${GSEL} WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1`, [projectId]));
}

export async function saveGoal(projectId: string, b: { period: string; date_from: string; date_to: string; profit_target: number; diag?: Record<string, number>; approved_by?: string }) {
  if (!DAY.test(b.date_from) || !DAY.test(b.date_to) || b.date_from > b.date_to) throw new Error("Podaj okres celu");
  if (!Number.isFinite(b.profit_target)) throw new Error("Podaj cel profitu w zł");
  const id = newId();
  await q("INSERT INTO goals (id, project_id, period, date_from, date_to, profit_target, diag, approved_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [
    id, projectId, b.period, b.date_from, b.date_to, b.profit_target, JSON.stringify(b.diag ?? {}), (b.approved_by ?? "").slice(0, 200),
  ]);
  return id;
}

/* ---------- Decyzje ---------- */

export interface Baseline { budget: number; base: Metrics; econ: Econ; th: { minClicks: number; minOrders: number } }
export interface Decision {
  id: string;
  loop_id: string | null;
  kind: "zmiana" | typeof NO_CHANGE;
  what: string;
  who: string;
  why: string;
  element: string;
  metric: MetricKey | null;
  from_value: number | null;
  to_value: number | null;
  hypothesis: string;
  expected_month: number | null;
  baseline: Baseline | null;
  start_date: string;
  check_date: string;
  ad_test_id: string | null;
  verdict: string | null;
  actual_value: number | null;
  impact_month: number | null;
  impact_low: number | null;
  impact_high: number | null;
  low_confidence: boolean | null;
  learning: string;
  verdict_loop_id: string | null;
  verdict_at: string | null;
  created_at: string;
  checklist: { id: string; title: string; who: string | null; due: string; done: boolean; required: boolean }[];
}

const nOrNull = (v: unknown) => (v == null ? null : Number(v));

export async function listDecisions(projectId: string): Promise<Decision[]> {
  const [rows, checks] = await Promise.all([
    q<Record<string, unknown>>(
      `SELECT id, loop_id, kind, what, who, why, element, metric, from_value, to_value, hypothesis, expected_month, baseline,
              to_char(start_date, 'YYYY-MM-DD') AS start_date, to_char(check_date, 'YYYY-MM-DD') AS check_date, ad_test_id, verdict,
              actual_value, impact_month, impact_low, impact_high, low_confidence, learning, verdict_loop_id,
              to_char(verdict_at, 'YYYY-MM-DD') AS verdict_at, to_char(created_at, 'YYYY-MM-DD') AS created_at
       FROM decisions WHERE project_id = $1 ORDER BY created_at DESC`,
      [projectId],
    ),
    q<{ id: string; decision_id: string; title: string; who: string | null; due: string; done: boolean; required: boolean }>(
      "SELECT id, decision_id, title, who, to_char(due, 'YYYY-MM-DD') AS due, done, required FROM tasks WHERE project_id = $1 AND decision_id IS NOT NULL ORDER BY required DESC, due, created_at",
      [projectId],
    ),
  ]);
  return rows.map((r) => ({
    ...(r as unknown as Decision),
    from_value: nOrNull(r.from_value), to_value: nOrNull(r.to_value), expected_month: nOrNull(r.expected_month),
    actual_value: nOrNull(r.actual_value), impact_month: nOrNull(r.impact_month), impact_low: nOrNull(r.impact_low), impact_high: nOrNull(r.impact_high),
    baseline: j<Baseline | null>(r.baseline, null),
    checklist: checks.filter((c) => c.decision_id === r.id).map(({ decision_id: _x, ...c }) => c),
  }));
}

/* ---------- Licznik efektów ---------- */

export async function counter(projectId: string) {
  const [dec, pred] = await Promise.all([
    q<{ verdict: string; impact_month: number | null }>("SELECT verdict, impact_month FROM decisions WHERE project_id = $1 AND verdict IS NOT NULL", [projectId]),
    q<{ profit_guess: number; profit_actual: number | null; stage_guess: string; stage_actual: string | null; lever_guess: string | null; lever_actual: string | null }>(
      "SELECT profit_guess, profit_actual, stage_guess, stage_actual, lever_guess, lever_actual FROM predictions WHERE project_id = $1 AND profit_actual IS NOT NULL ORDER BY created_at",
      [projectId],
    ),
  ]);
  const verified = dec.filter((d) => d.verdict !== "za mało danych" && d.impact_month != null);
  const plus = verified.reduce((a, d) => a + Math.max(0, Number(d.impact_month)), 0);
  const minus = verified.reduce((a, d) => a + Math.min(0, Number(d.impact_month)), 0);
  const judged = dec.filter((d) => d.verdict === "tak" || d.verdict === "nie");
  const errs = pred.map((p) => Math.abs(Number(p.profit_guess) - Number(p.profit_actual)));
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const stageKnown = pred.filter((p) => p.stage_actual);
  const leverKnown = pred.filter((p) => p.lever_guess && p.lever_actual);
  return {
    plus, minus, verifiedCount: verified.length,
    hitRate: judged.length ? judged.filter((d) => d.verdict === "tak").length / judged.length : null,
    judged: judged.length,
    predictions: pred.length,
    meanError: mean(errs),
    lastError: errs.length ? errs[errs.length - 1] : null,
    earlierError: mean(errs.slice(0, -1)),
    stageHit: stageKnown.length ? stageKnown.filter((p) => p.stage_guess === p.stage_actual).length / stageKnown.length : null,
    leverHit: leverKnown.length ? leverKnown.filter((p) => p.lever_guess === p.lever_actual).length / leverKnown.length : null,
  };
}

/* ---------- Stan sesji ---------- */

export interface LoopRow { id: string; step: number; data: Record<string, Record<string, unknown>>; started_at: string; finished_at: string | null }
const LSEL = "SELECT id, step, data, to_char(started_at, 'YYYY-MM-DD') AS started_at, to_char(finished_at, 'YYYY-MM-DD') AS finished_at FROM loops";
const asLoop = (r: (Omit<LoopRow, "data"> & { data: unknown }) | null): LoopRow | null => (r ? { ...r, data: j(r.data, {}) } : null);

type Action = { id: string; title: string; due: string; done: boolean; level: string | null };
const actionsOf = (lid: string) =>
  q<Action>("SELECT id, title, to_char(due, 'YYYY-MM-DD') AS due, done, level FROM tasks WHERE review_id = $1 AND test_id IS NULL AND decision_id IS NULL ORDER BY due, created_at", [lid]);

export interface Prediction { profit_guess: number; stage_guess: string; lever_guess: string | null; window_from: string | null; window_to: string | null; profit_actual: number | null; stage_actual: string | null; lever_actual: string | null }

async function predictionOf(lid: string): Promise<Prediction | null> {
  const p = await one<Record<string, unknown>>(
    `SELECT profit_guess, stage_guess, lever_guess, to_char(window_from, 'YYYY-MM-DD') AS window_from, to_char(window_to, 'YYYY-MM-DD') AS window_to,
            profit_actual, stage_actual, lever_actual FROM predictions WHERE loop_id = $1`,
    [lid],
  );
  return p ? { ...(p as unknown as Prediction), profit_guess: Number(p.profit_guess), profit_actual: nOrNull(p.profit_actual) } : null;
}

export async function loopState(projectId: string) {
  let active = asLoop((await one(`${LSEL} WHERE project_id = $1 AND finished_at IS NULL ORDER BY started_at DESC LIMIT 1`, [projectId])) as never);
  // Pętla zaczęta w starej wersji kroków – zaczyna od początku (stare dane zostają w „legacy”).
  if (active && active.data.meta?.v !== VERSION) {
    const data = { meta: { v: VERSION }, legacy: active.data as unknown as Record<string, unknown> };
    await q("UPDATE loops SET step = 0, data = $2 WHERE id = $1", [active.id, JSON.stringify(data)]);
    active = { ...active, step: 0, data };
  }
  const [prev, goal, last, decisions, settings] = await Promise.all([
    one(`${LSEL} WHERE project_id = $1 AND finished_at IS NOT NULL ORDER BY finished_at DESC, started_at DESC LIMIT 1`, [projectId]).then((r) => asLoop(r as never)),
    activeGoal(projectId),
    lastGoal(projectId),
    listDecisions(projectId),
    loadSettings(projectId),
  ]);
  const [prevActions, prediction, learnings, adTests, cnt] = await Promise.all([
    prev ? actionsOf(prev.id) : [],
    active ? predictionOf(active.id) : null,
    q<{ id: string; stage: string; element: string; text: string; profit_delta: number | null; created_at: string }>(
      "SELECT id, stage, element, text, profit_delta, to_char(created_at, 'YYYY-MM-DD') AS created_at FROM learnings WHERE project_id = $1 ORDER BY created_at DESC LIMIT 200",
      [projectId],
    ),
    q<{ id: string; angle: string }>("SELECT id, angle FROM ad_tests WHERE project_id = $1 ORDER BY created_at DESC", [projectId]).catch(() => []),
    counter(projectId),
  ]);
  const t = today();
  return {
    active, prev, goal, lastGoal: last, prevActions, prediction, learnings, adTests, decisions, counter: cnt,
    scope: settings.analysisScope ?? null,
    economicsScope: settings.economicsScope,
    /** decyzje, których dzień sprawdzenia nadszedł, a nie ma rozstrzygnięcia (z każdej sesji) */
    due: decisions.filter((d) => !d.verdict && d.check_date <= t),
  };
}
export type LoopState = Awaited<ReturnType<typeof loopState>>;

export async function startLoop(projectId: string) {
  const open = await one<{ id: string }>("SELECT id FROM loops WHERE project_id = $1 AND finished_at IS NULL", [projectId]);
  if (open) return open.id;
  const id = newId();
  await q("INSERT INTO loops (id, project_id, data) VALUES ($1, $2, $3)", [id, projectId, JSON.stringify({ meta: { v: VERSION } })]);
  return id;
}

async function loopProject(lid: string) {
  const r = await one<{ project_id: string; step: number; data: unknown; finished_at: string | null }>("SELECT project_id, step, data, finished_at FROM loops WHERE id = $1", [lid]);
  if (!r) throw new Error("Brak sesji");
  if (r.finished_at) throw new Error("Ta sesja jest zakończona");
  return { projectId: r.project_id, step: r.step, data: j<LoopRow["data"]>(r.data, {}) };
}

/** Sprawdza, czy krok jest wykonany (zapis = warunek przejścia). Zwraca listę braków. */
async function missing(lid: string, projectId: string, step: number, data: LoopRow["data"]): Promise<string[]> {
  const st = await loopState(projectId);
  const key = STEPS[step].key;
  const d = data[key] ?? {};
  const out: string[] = [];
  if (key === "cel") {
    if (!st.goal) out.push("Ustal cel profitu i okres.");
    if (!st.scope) out.push("Zatwierdź zakres: kampanie i produkty, z których liczymy.");
    const ratings = (d.ratings ?? {}) as Record<string, { effect?: string }>;
    for (const a of st.prevActions) if (!ratings[a.id]?.effect) out.push(`Rozlicz działanie z poprzedniej sesji: „${a.title}”.`);
  }
  if (key === "predykcja" && !st.prediction) out.push("Wpisz predykcję: profit z ostatniego tygodnia i etap, który się pogorszył.");
  if (key === "rzeczywistosc" && d.reliable !== true) out.push("Potwierdź, że dane są wiarygodne. Jeśli nie są – najpierw napraw pomiar.");
  if (key === "kwota" && !st.prediction?.lever_guess) out.push("Wskaż, gdzie Twoim zdaniem jest największa dźwignia.");
  if (key === "pytania") {
    const qs = (d.questions ?? []) as string[];
    const ans = (d.answers ?? {}) as Record<string, string>;
    if (!qs.length) out.push("Brak pytań – odśwież krok.");
    qs.forEach((qq, i) => {
      if (!String(ans[i] ?? "").trim()) out.push(`Odpowiedz: „${qq.slice(0, 80)}${qq.length > 80 ? "…" : ""}”`);
    });
  }
  if (key === "decyzja" && !st.decisions.some((x) => x.loop_id === lid)) out.push("Zapisz decyzję. Dopuszczalne „nic nie zmieniam” – z uzasadnieniem i datą sprawdzenia.");
  if (key === "rozstrzygniecie") for (const x of st.due) out.push(`Rozstrzygnij: „${x.what}” (sprawdzenie ${x.check_date}).`);
  if (key === "wnioski" && !String(d.summary ?? "").trim()) out.push("Wpisz jedno zdanie: czego się nauczyłeś.");
  return out;
}

export async function saveStep(lid: string, step: number, patch: Record<string, unknown>, advance: boolean) {
  const { projectId, step: cur, data } = await loopProject(lid);
  if (!Number.isInteger(step) || step < 0 || step >= STEPS.length) throw new Error("Zły krok");
  if (step > cur) throw new Error("Najpierw zakończ wcześniejsze kroki");
  const key = STEPS[step].key;
  const merged = { ...data, [key]: { ...(data[key] ?? {}), ...patch } };
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

/** Zakres liczenia (kampanie, produkty) – zapisywany w ustawieniach projektu, pamiętany do następnej sesji. */
export async function saveScope(projectId: string, campaigns: string[], products: string[]) {
  const s = await loadSettings(projectId);
  const clean = (xs: unknown) => (Array.isArray(xs) ? [...new Set(xs.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean))].slice(0, 500) : []);
  const next = { ...s, analysisScope: { campaigns: clean(campaigns), products: clean(products) } };
  await q(
    `INSERT INTO project_settings (project_id, settings, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (project_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = now()`,
    [projectId, JSON.stringify(next)],
  );
}

/** Predykcja – zapisywana przed odsłonięciem danych; po przejściu dalej nie da się jej zmienić. */
export async function savePrediction(lid: string, profitGuess: number, stageGuess: string) {
  const { projectId, step } = await loopProject(lid);
  if (step > 1) throw new Error("Predykcja jest już porównana z danymi – nie można jej zmienić.");
  if (!Number.isFinite(profitGuess)) throw new Error("Wpisz profit w zł");
  if (!stageGuess) throw new Error("Wybierz etap");
  const a = await predictionActuals(projectId);
  await q("DELETE FROM predictions WHERE loop_id = $1", [lid]);
  await q(
    `INSERT INTO predictions (id, project_id, loop_id, profit_guess, stage_guess, window_from, window_to, profit_actual, stage_actual)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [newId(), projectId, lid, profitGuess, stageGuess.slice(0, 40), a.from, a.to, a.profit, a.stage],
  );
}

/** Zgadywanie dźwigni → dopiero potem ranking. Ranking zamrażany w sesji (te same liczby do decyzji). */
export async function guessLever(lid: string, guess: string) {
  const { projectId, data } = await loopProject(lid);
  if (!METRICS.some((m) => m.key === guess)) throw new Error("Wybierz dźwignię");
  const p = await predictionOf(lid);
  if (!p) throw new Error("Najpierw predykcja");
  if (p.lever_guess) throw new Error("Odpowiedź już zapisana");
  const eng = await engine(projectId);
  const top = eng.ranking.levers.find((l) => l.value != null)?.key ?? null;
  await q("UPDATE predictions SET lever_guess = $2, lever_actual = $3 WHERE loop_id = $1", [lid, guess, top]);
  const kwota = { ...(data.kwota ?? {}), snapshot: eng, focus: top };
  await q("UPDATE loops SET data = $2 WHERE id = $1", [lid, JSON.stringify({ ...data, kwota })]);
}

const fmtM = (key: MetricKey, v: number | null | undefined) =>
  v == null ? "brak danych" : key === "ctr" || key === "cr" ? `${(v * 100).toLocaleString("pl-PL", { maximumFractionDigits: 2 })}%` : `${v.toLocaleString("pl-PL", { maximumFractionDigits: 2 })} zł`;
const zl = (v: number | null | undefined) => (v == null ? "brak danych" : `${Math.round(v).toLocaleString("pl-PL")} zł`);
const chg = (a: number | null, b: number | null) => (a == null || b == null || !b ? "bez danych do porównania" : `${a >= b ? "+" : "−"}${Math.abs(Math.round((a / b - 1) * 100))}% vs poprzednie 30 dni`);

/** 2–3 pytania z danych dla wybranej dźwigni (reguły, nie AI). */
export function socratic(eng: EngineResult, focus: MetricKey): string[] {
  const L = eng.ranking.levers.find((l) => l.key === focus)!;
  const base = eng.ranking.base;
  const P = eng.metricsPrev;
  const win = eng.benchWindows[focus];
  const where = win ? ` (${win.from} – ${win.to})` : eng.benchmarkMode === "targets" ? " (cel z ustawień)" : "";
  const vs = `${L.label}: teraz ${fmtM(focus, L.current)}, benchmark ${fmtM(focus, L.benchmark)}${where}`;
  const u = eng.units;
  const qs: string[] = [];
  if (focus === "cpm") {
    qs.push(`${vs}. CTR ${chg(base.ctr, P.ctr)}. Co zmieniło się w aukcji: grupa odbiorców, sezon, konkurencja czy częstotliwość?`);
    qs.push(`1000 wyświetleń jest dziś warte ${zl(u.perMille)} profitu. Która kampania w zakresie płaci najwięcej za wyświetlenia i czy jej wynik to uzasadnia?`);
  }
  if (focus === "ctr") {
    qs.push(`${vs}. CPM ${chg(base.cpm, P.cpm)}. Co było w reklamach w najlepszym tygodniu, czego teraz nie ma?`);
    qs.push(`1 kliknięcie jest dziś warte ${zl(u.perClick)}. Czy największy budżet dostają reklamy z najwyższym CTR?`);
  }
  if (focus === "cr") {
    qs.push(`${vs}. CTR ${chg(base.ctr, P.ctr)}, CPM ${chg(base.cpm, P.cpm)}. Co zmieniło się po kliknięciu: strona, cena, oferta, płatność?`);
    qs.push(`1 zamówienie jest warte ${zl(u.perOrder)}. Czy ludzie z reklam trafiają na tę samą stronę i ofertę co w najlepszym tygodniu?`);
  }
  if (focus === "aov") {
    qs.push(`${vs}. Co zmieniło się w koszyku: dodatki (order bump), cena, rabaty, mix produktów?`);
    qs.push(eng.ltv.value != null
      ? `Kupujący dokupują średnio ${zl(eng.ltv.value)} w 30 dni. Co to jest i czy proponujesz to już przy pierwszym zakupie?`
      : "Brak danych o dokupieniach w 30 dni. Co kupujący mogliby dobrać od razu przy zakupie?");
  }
  const evWin = win ? eng.events.filter((e) => e.day >= win.from && e.day <= win.to) : [];
  const evRecent = eng.events.filter((e) => e.day >= eng.window.from);
  if (evWin.length) qs.push(`W najlepszym tygodniu na osi czasu: ${evWin.slice(0, 3).map((e) => `${e.day} „${e.title}”`).join(", ")}. Czy to wyjaśnia wynik?`);
  else if (evRecent.length) qs.push(`Ostatnie 30 dni na osi czasu: ${evRecent.slice(-3).map((e) => `${e.day} „${e.title}”`).join(", ")}. Która z tych zmian mogła ruszyć ${L.label}?`);
  return qs.slice(0, 3);
}

/** Pytania do kroku 6 – generowane raz z zamrożonego rankingu. */
export async function ensureQuestions(lid: string) {
  const { data } = await loopProject(lid);
  const eng = data.kwota?.snapshot as EngineResult | undefined;
  if (!eng) throw new Error("Najpierw krok „Kwota na stole”");
  const focus = (data.pytania?.focus ?? data.kwota?.focus) as MetricKey | null;
  if (!focus) return { questions: [] as string[], focus: null };
  if (Array.isArray(data.pytania?.questions) && data.pytania.focus === focus) return { questions: data.pytania.questions as string[], focus };
  const questions = socratic(eng, focus);
  await q("UPDATE loops SET data = $2 WHERE id = $1", [lid, JSON.stringify({ ...data, pytania: { ...(data.pytania ?? {}), focus, questions, answers: {} } })]);
  return { questions, focus };
}

/** Zmiana dźwigni do pogłębienia (np. nr 2 zamiast nr 1) – nowe pytania. */
export async function setFocus(lid: string, focus: string) {
  const { data } = await loopProject(lid);
  if (!METRICS.some((m) => m.key === focus)) throw new Error("Zła dźwignia");
  await q("UPDATE loops SET data = $2 WHERE id = $1", [lid, JSON.stringify({ ...data, pytania: { focus } })]);
  return ensureQuestions(lid);
}

export function baselineOf(eng: EngineResult): Baseline {
  return { budget: eng.ranking.budget, base: eng.ranking.base, econ: eng.econ, th: eng.th };
}

export async function createDecision(lid: string, b: {
  kind?: string; what?: string; who?: string; why?: string; element?: string; metric?: string; to_value?: number | null; check_date?: string; ad_test_id?: string | null;
}) {
  const { projectId, data } = await loopProject(lid);
  if (await one("SELECT id FROM decisions WHERE loop_id = $1", [lid])) throw new Error("Decyzja tej sesji jest już zapisana. Usuń ją, żeby zapisać inną.");
  const eng = data.kwota?.snapshot as EngineResult | undefined;
  if (!eng) throw new Error("Najpierw krok „Kwota na stole”");
  const check = String(b.check_date ?? "");
  if (!DAY.test(check) || check <= today()) throw new Error("Data sprawdzenia musi być w przyszłości.");
  const why = String(b.why ?? "").trim();
  const who = String(b.who ?? "").trim().slice(0, 120);
  const id = newId();
  const t = today();
  const base = baselineOf(eng);
  if (b.kind === NO_CHANGE) {
    if (!why) throw new Error("Uzasadnij, dlaczego nic nie zmieniasz.");
    await q(
      `INSERT INTO decisions (id, project_id, loop_id, kind, what, who, why, baseline, start_date, check_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [id, projectId, lid, NO_CHANGE, NO_CHANGE, who, why.slice(0, 2000), JSON.stringify(base), t, check],
    );
  } else {
    const what = String(b.what ?? "").trim();
    const m = METRICS.find((x) => x.key === b.metric);
    const to = Number(b.to_value);
    const miss = [!what && "Co (jedna konkretna zmiana)", !who && "Kto", !why && "Dlaczego", !m && "Metryka hipotezy", !Number.isFinite(to) && "Wartość docelowa metryki (B)"].filter(Boolean);
    if (miss.length) throw new Error(`Uzupełnij: ${miss.join(", ")}.`);
    const from = base.base[m!.key];
    const expected = hypothesisValue(base.budget, base.base, base.econ, m!.key, to);
    const hyp = `Jeśli ${what}, to ${m!.label} z ${fmtM(m!.key, from)} do ${fmtM(m!.key, to)}.`;
    await q(
      `INSERT INTO decisions (id, project_id, loop_id, kind, what, who, why, element, metric, from_value, to_value, hypothesis, expected_month, baseline, start_date, check_date, ad_test_id)
       VALUES ($1,$2,$3,'zmiana',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [id, projectId, lid, what.slice(0, 500), who, why.slice(0, 2000), String(b.element ?? "").slice(0, 40), m!.key, from, to, hyp, expected, JSON.stringify(base), t, check, b.ad_test_id || null],
    );
    await q("INSERT INTO tasks (id, project_id, title, due, decision_id, required, who) VALUES ($1,$2,$3,$4,$5,true,$6)", [
      newId(), projectId, `${MEASURE_TASK}: ${what}`.slice(0, 300), addDays(t, 1), id, who,
    ]);
  }
  const d = (await listDecisions(projectId)).find((x) => x.id === id)!;
  await q(
    "INSERT INTO timeline_events (id, project_id, day, type, title, description, source, link, confidence) VALUES ($1,$2,$3,'decyzja',$4,$5,'Sesja analityczna',$6,'memory')",
    [newId(), projectId, t, `Decyzja: ${d.what}`, brief(d), `decision:${id}`],
  );
  return id;
}

export async function deleteDecision(did: string) {
  const d = await one<{ loop_id: string | null; verdict: string | null; project_id: string }>("SELECT loop_id, verdict, project_id FROM decisions WHERE id = $1", [did]);
  if (!d) throw new Error("Brak decyzji");
  if (d.verdict) throw new Error("Decyzja jest rozstrzygnięta – zostaje w historii.");
  const open = d.loop_id ? await one("SELECT id FROM loops WHERE id = $1 AND finished_at IS NULL", [d.loop_id]) : null;
  if (!open) throw new Error("Decyzja z zakończonej sesji – zostaje w historii. Rozstrzygnij ją w dniu sprawdzenia.");
  await q("DELETE FROM tasks WHERE decision_id = $1", [did]);
  await q("DELETE FROM timeline_events WHERE project_id = $1 AND link = $2", [d.project_id, `decision:${did}`]);
  await q("DELETE FROM decisions WHERE id = $1", [did]);
}

export async function addDecisionTask(did: string, title: string, who: string, due: string) {
  const d = await one<{ project_id: string }>("SELECT project_id FROM decisions WHERE id = $1", [did]);
  if (!d) throw new Error("Brak decyzji");
  if (!title.trim() || !DAY.test(due)) throw new Error("Wpisz zadanie i termin");
  await q("INSERT INTO tasks (id, project_id, title, due, decision_id, who) VALUES ($1,$2,$3,$4,$5,$6)", [newId(), d.project_id, title.trim().slice(0, 300), due, did, who.slice(0, 120)]);
}

/** Brief do skopiowania i wysłania wykonawcy. */
export function brief(d: Pick<Decision, "kind" | "what" | "who" | "why" | "hypothesis" | "expected_month" | "check_date" | "checklist">): string {
  const lines = d.kind === NO_CHANGE
    ? [`Decyzja: nic nie zmieniam`, `Dlaczego: ${d.why}`, `Sprawdzenie: ${d.check_date}`]
    : [
        `Co: ${d.what}`,
        `Kto: ${d.who}`,
        `Dlaczego: ${d.why}`,
        `Hipoteza: ${d.hypothesis}`,
        `Wartość oczekiwana: ${d.expected_month == null ? "brak danych" : `${d.expected_month >= 0 ? "+" : "−"}${Math.abs(Math.round(d.expected_month)).toLocaleString("pl-PL")} zł/mies.`}`,
        `Data sprawdzenia: ${d.check_date}`,
      ];
  if (d.checklist?.length) lines.push("", "Do zrobienia:", ...d.checklist.map((c) => `- ${c.title} – ${c.due}${c.who ? ` (${c.who})` : ""}`));
  return lines.join("\n");
}

/** Wynik decyzji w oknie od wdrożenia do dnia sprawdzenia (bez dnia dzisiejszego – niepełny). */
export async function decisionResult(did: string) {
  const d = await one<{ project_id: string }>("SELECT project_id FROM decisions WHERE id = $1", [did]);
  if (!d) throw new Error("Brak decyzji");
  const projectId = d.project_id;
  const x = (await listDecisions(projectId)).find((y) => y.id === did)!;
  const end = [x.check_date, addDays(today(), -1)].sort()[0];
  const from = x.start_date;
  if (end < from) return { projectId, decision: x, from, to: end, actual: null, impact: null, range: null, lowConfidence: true, profit: null, profitBefore: null, suggestion: "za mało danych" as string | null };
  const len = Math.round((Date.parse(end) - Date.parse(from)) / 864e5) + 1;
  const now = await measure(projectId, from, end);
  const before = await measure(projectId, addDays(from, -len), addDays(from, -1));
  if (x.kind === NO_CHANGE || !x.metric || !x.baseline) {
    return { projectId, decision: x, from, to: end, actual: null, impact: null, range: null, lowConfidence: false, profit: now.money.profit, profitBefore: before.money.profit, suggestion: null };
  }
  const b = x.baseline;
  const v = verdictImpact(b.budget, b.base, b.econ, x.metric, now.totals, b.th);
  const A = x.from_value;
  const B = x.to_value;
  const moved = v.actual != null && A != null && B != null && B !== A ? (v.actual - A) / (B - A) : null;
  const suggestion = v.lowConfidence ? "za mało danych" : moved == null ? null : moved >= 0.5 ? "tak" : "nie";
  return { projectId, decision: x, from, to: end, actual: v.actual, impact: v.impact, range: v.range, lowConfidence: v.lowConfidence, profit: now.money.profit, profitBefore: before.money.profit, suggestion };
}

/** „Miałeś rację?” – zapis rozstrzygnięcia, wniosku, wpisu na osi czasu i (dla trafionej zmiany z zyskiem) zwycięskiego elementu. */
export async function saveVerdict(did: string, verdict: string, learning: string) {
  if (!(VERDICTS as readonly string[]).includes(verdict)) throw new Error("Wybierz odpowiedź");
  if (!learning.trim()) throw new Error("Wpisz jedno zdanie: czego się nauczyłeś.");
  const r = await decisionResult(did);
  const x = r.decision;
  if (x.verdict) throw new Error("Decyzja jest już rozstrzygnięta.");
  if (x.check_date > today()) throw new Error(`Za wcześnie – sprawdzenie ${x.check_date}.`);
  const pid = r.projectId;
  const active = await one<{ id: string }>("SELECT id FROM loops WHERE project_id = $1 AND finished_at IS NULL", [pid]);
  await q(
    `UPDATE decisions SET verdict = $2, learning = $3, actual_value = $4, impact_month = $5, impact_low = $6, impact_high = $7, low_confidence = $8,
            verdict_loop_id = $9, verdict_at = now() WHERE id = $1`,
    [did, verdict, learning.trim().slice(0, 1000), r.actual, r.impact, r.range?.[0] ?? null, r.range?.[1] ?? null, r.lowConfidence, active?.id ?? null],
  );
  await q("INSERT INTO learnings (id, project_id, loop_id, stage, element, text, profit_delta) VALUES ($1,$2,$3,$4,$5,$6,$7)", [
    newId(), pid, active?.id ?? x.loop_id, x.metric ? METRICS.find((m) => m.key === x.metric)!.stage : "", x.element, learning.trim().slice(0, 1000), r.impact,
  ]);
  if (verdict === "tak" && x.kind !== NO_CHANGE && (r.impact ?? 0) > 0) {
    await q(
      `INSERT INTO winning_elements (id, project_id, stage, element, change_to, idea_source, decision_id, profit_month) VALUES ($1,$2,$3,$4,$5,'sesja analityczna',$6,$7)`,
      [newId(), pid, x.element || "inne", x.metric ? METRICS.find((m) => m.key === x.metric)!.label : "", x.what, did, r.impact],
    );
  }
  const impact = r.impact == null ? "" : ` · wpływ ${r.impact >= 0 ? "+" : "−"}${Math.abs(Math.round(r.impact)).toLocaleString("pl-PL")} zł/mies.${r.lowConfidence ? " (niska pewność)" : ""}`;
  await q(
    "INSERT INTO timeline_events (id, project_id, day, type, title, description, source, link, confidence) VALUES ($1,$2,$3,'rozstrzygniecie',$4,$5,'Sesja analityczna',$6,'data')",
    [newId(), pid, today(), `Rozstrzygnięcie: ${x.what} – ${verdict}${impact}`, `${x.hypothesis}\nWniosek: ${learning.trim()}`, `verdict:${did}`],
  );
}

/* ---------- Rozliczenie działań ze starych pętli ---------- */

export async function rateAction(lid: string, taskId: string, effect: string, carry: boolean, due?: string) {
  const { projectId, data } = await loopProject(lid);
  const t = await one<{ title: string; project_id: string }>("SELECT title, project_id FROM tasks WHERE id = $1", [taskId]);
  if (!t || t.project_id !== projectId) throw new Error("Brak zadania");
  const cel = { ...(data.cel ?? {}) } as Record<string, unknown>;
  const ratings = { ...((cel.ratings as Record<string, unknown>) ?? {}) };
  ratings[taskId] = { effect, carry };
  cel.ratings = ratings;
  await q("UPDATE loops SET data = $2 WHERE id = $1", [lid, JSON.stringify({ ...data, cel })]);
  if (carry) await q("INSERT INTO tasks (id, project_id, title, due, review_id, level) VALUES ($1,$2,$3,$4,$5,'przeniesione')", [newId(), projectId, t.title, due && DAY.test(due) ? due : today(), lid]);
}

async function finish(lid: string, projectId: string, data: LoopRow["data"]) {
  const st = await loopState(projectId);
  const dec = st.decisions.find((d) => d.loop_id === lid);
  const eng = data.kwota?.snapshot as EngineResult | undefined;
  const top = eng?.ranking.levers.find((l) => l.value != null);
  const lines = [
    st.goal ? `Cel: ${Math.round(st.goal.profit_target)} zł profitu (${st.goal.date_from} – ${st.goal.date_to})` : "",
    top ? `Największa dźwignia: ${top.label} – ${Math.round(top.value!)} zł/mies.${top.lowConfidence ? " (niska pewność)" : ""}` : "",
    dec ? `Decyzja: ${dec.what}${dec.expected_month != null ? ` (oczekiwane ${Math.round(dec.expected_month)} zł/mies.)` : ""}, sprawdzenie ${dec.check_date}` : "",
    data.wnioski?.summary ? `Wniosek: ${data.wnioski.summary}` : "",
  ].filter(Boolean);
  await q(
    "INSERT INTO timeline_events (id, project_id, day, type, title, description, source, confidence) VALUES ($1,$2,$3,'analiza',$4,$5,'Sesja analityczna','memory')",
    [newId(), projectId, today(), "Sesja analityczna", lines.join("\n")],
  );
  await q("UPDATE loops SET finished_at = now(), step = $2 WHERE id = $1", [lid, STEPS.length]);
}
