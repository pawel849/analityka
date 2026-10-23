// Sesja analityczna → decyzja w złotówkach. Zawsze te same kroki, zawsze od początku do końca.
// Dane per projekt (klient) – nic tu nie zależy od konkretnego klienta.
import { newId, one, q } from "./db";
import { loadSettings } from "./project-data";
import { addDays, defaultRange, engine, gap, measure, predictionActuals, reality, today, type EngineResult, type GoalRow, type Range } from "./loop-data";
import { enoughFor, hypothesisValue, METRICS, metricsOf, modelProfit, verdictImpact, type Econ, type MetricKey, type Metrics } from "./levers";
import { EMAIL_METRICS, emailHypothesisValue, emailVerdictImpact, type EmailKey, type EmailMetrics } from "./email-levers";
import { allLevers, categoryValue, topLever } from "./money-map";
import { CAT, catByKey, catOfLever, fmtMetric, isCat, isEmailLever, LEVER_NAMES, MEASURE_TASK, NO_CHANGE, phraseOk, STEPS, targetName, VERDICTS, type CatKey } from "./loop-def";
import { ClaudeError, claudeAnalysis, claudeQuestions } from "./claude";

export * from "./loop-def";

const j = <T>(v: unknown, d: T): T => (v == null ? d : typeof v === "string" ? (JSON.parse(v) as T) : (v as T));
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const VERSION = 3;

/* ---------- Okres sesji ---------- */

/** Okres, z którego sesja liczy (wybierany w kroku 1; domyślnie ostatnie 30 pełnych dni). */
export function rangeOfData(data: Record<string, Record<string, unknown>>): Range {
  const r = data.cel?.range as Range | undefined;
  const ok = r && DAY.test(r.from) && DAY.test(r.to) && r.from <= r.to && r.to < today();
  return ok ? { from: r.from, to: r.to } : defaultRange();
}

export async function sessionRange(projectId: string): Promise<Range> {
  const r = await one<{ data: unknown }>("SELECT data FROM loops WHERE project_id = $1 AND finished_at IS NULL", [projectId]);
  return r ? rangeOfData(j(r.data, {})) : defaultRange();
}

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

export interface Baseline { budget: number; base: Metrics; econ: Econ; th: { minClicks: number; minOrders: number }; email?: EmailMetrics }
export interface Decision {
  id: string;
  loop_id: string | null;
  kind: "zmiana" | typeof NO_CHANGE;
  what: string;
  who: string;
  why: string;
  element: string;
  /** dźwignia (cpm, e_open…) albo cała kategoria (cat:email…) */
  metric: string | null;
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
    range: active ? rangeOfData(active.data) : defaultRange(),
    scope: settings.analysisScope ?? null,
    economicsScope: settings.economicsScope,
    /** decyzje, których dzień sprawdzenia nadszedł, a nie ma rozstrzygnięcia (z każdej sesji) */
    due: decisions.filter((d) => !d.verdict && d.check_date <= t),
  };
}
export type LoopState = Awaited<ReturnType<typeof loopState>>;

/** Nowa sesja. Gdy jest poprzedni raport – trzeba wpisać „przejrzałem poprzedni raport”. */
export async function startLoop(projectId: string, phrase = "") {
  const open = await one<{ id: string }>("SELECT id FROM loops WHERE project_id = $1 AND finished_at IS NULL", [projectId]);
  if (open) return open.id;
  const last = await one("SELECT id FROM loops WHERE project_id = $1 AND finished_at IS NOT NULL AND data ? 'report'", [projectId]);
  if (last && !phraseOk(phrase)) throw new Error("Najpierw przejrzyj poprzedni raport i wpisz: przejrzałem poprzedni raport");
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
    if (!st.goal) out.push("Ustal cel profitu i kliknij „Zapisz cel”.");
    const ratings = (d.ratings ?? {}) as Record<string, { effect?: string }>;
    for (const a of st.prevActions) if (!ratings[a.id]?.effect) out.push(`Rozlicz działanie z poprzedniej sesji: „${a.title}”.`);
  }
  if (key === "predykcja" && !st.prediction) out.push("Ustaw profit z ostatniego tygodnia i wybierz etap.");
  if (key === "kwota" && !st.prediction?.lever_guess) out.push("Wskaż, gdzie Twoim zdaniem jest największa dźwignia.");
  if (key === "pytania") {
    const qs = (d.questions ?? []) as string[];
    const ans = (d.answers ?? {}) as Record<string, string>;
    if (!qs.length) out.push("Brak pytań – odśwież stronę.");
    qs.forEach((qq, i) => {
      if (!String(ans[i] ?? "").trim()) out.push(`Odpowiedz na pytanie ${i + 1}.`);
    });
  }
  if (key === "analiza" && !String(d.text ?? "").trim() && d.skipped !== true) out.push("Analiza Claude jeszcze nie powstała – spróbuj ponownie albo ją pomiń.");
  if (key === "decyzja" && !st.decisions.some((x) => x.loop_id === lid)) out.push("Zapisz decyzję (albo „nic nie zmieniam” z uzasadnieniem i datą).");
  if (key === "rozstrzygniecie") for (const x of st.due) out.push(`Rozstrzygnij: „${x.what}”.`);
  if (key === "raport" && !String(d.summary ?? "").trim()) out.push("Wpisz jedno zdanie: czego się nauczyłeś.");
  return out;
}

const PROTECTED: Record<string, string[]> = { kwota: ["snapshot", "focus"], pytania: ["questions", "source", "error", "focus"], analiza: ["text", "at"] };

export async function saveStep(lid: string, step: number, patch: Record<string, unknown>, advance: boolean) {
  const { projectId, step: cur, data } = await loopProject(lid);
  if (!Number.isInteger(step) || step < 0 || step >= STEPS.length) throw new Error("Zły krok");
  if (step > cur) throw new Error("Najpierw zakończ wcześniejsze kroki");
  const key = STEPS[step].key;
  if (key === "predykcja" && (patch.profit_guess != null || patch.stage_guess)) {
    const cur = await predictionOf(lid);
    const profit = patch.profit_guess ?? cur?.profit_guess;
    const stage = patch.stage_guess ?? cur?.stage_guess;
    if (profit != null && stage) await savePrediction(lid, Number(profit), String(stage));
  }
  // pól liczonych przez serwer (ranking, pytania, analiza Claude) nie da się nadpisać z przeglądarki
  const own = Object.fromEntries(Object.entries(patch).filter(([k]) => !(PROTECTED[key] ?? []).includes(k)));
  if (key === "decyzja" && own.form && typeof own.form === "object") {
    // decyzja zapisuje się przy „Dalej” (bez osobnego przycisku)
    const exists = await one("SELECT id FROM decisions WHERE loop_id = $1", [lid]);
    await createDecision(lid, { ...(own.form as Record<string, unknown>), replace: !!exists } as Parameters<typeof createDecision>[1]);
    delete own.form;
  }
  const merged = { ...data, [key]: { ...(data[key] ?? {}), ...own } };
  await q("UPDATE loops SET data = $2 WHERE id = $1", [lid, JSON.stringify(merged)]);
  if (key === "cel" && own.range) await refreshAfterScope(projectId);
  if (!advance) return { missing: [] as string[] };
  const miss = await missing(lid, projectId, step, merged);
  if (miss.length) return { missing: miss };
  if (step === STEPS.length - 1) {
    await finish(lid, projectId, merged);
    return { missing: [], finished: true, reportId: lid };
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

/** Po zmianie zakresu w trakcie sesji: przelicz ranking i dane predykcji (typy zostają). */
export async function refreshAfterScope(projectId: string) {
  const open = await one<{ id: string; data: unknown }>("SELECT id, data FROM loops WHERE project_id = $1 AND finished_at IS NULL", [projectId]);
  if (!open) return;
  const data = j<LoopRow["data"]>(open.data, {});
  const range = rangeOfData(data);
  const p = await predictionOf(open.id);
  if (p) {
    const a = await predictionActuals(projectId, range);
    await q("UPDATE predictions SET window_from = $2, window_to = $3, profit_actual = $4, stage_actual = $5 WHERE loop_id = $1", [open.id, a.from, a.to, a.profit, a.stage]);
  }
  if (data.kwota?.snapshot) {
    const eng = await engine(projectId, range);
    if (p) await q("UPDATE predictions SET lever_actual = $2 WHERE loop_id = $1", [open.id, actualOf(topLever(eng), p.lever_guess)]);
    await q("UPDATE loops SET data = $2 WHERE id = $1", [open.id, JSON.stringify({ ...data, kwota: { ...data.kwota, snapshot: eng } })]);
  }
}

/** Predykcja – zapisywana przed odsłonięciem danych; po przejściu dalej nie da się jej zmienić. */
export async function savePrediction(lid: string, profitGuess: number, stageGuess: string) {
  const { projectId, data } = await loopProject(lid);
  if (!Number.isFinite(profitGuess)) throw new Error("Wpisz profit w zł");
  if (!stageGuess) throw new Error("Wybierz etap");
  const a = await predictionActuals(projectId, rangeOfData(data));
  const old = await predictionOf(lid);
  await q("DELETE FROM predictions WHERE loop_id = $1", [lid]);
  await q(
    `INSERT INTO predictions (id, project_id, loop_id, profit_guess, stage_guess, window_from, window_to, profit_actual, stage_actual)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [newId(), projectId, lid, profitGuess, stageGuess.slice(0, 40), a.from, a.to, a.profit, a.stage],
  );
  if (old?.lever_guess) await q("UPDATE predictions SET lever_guess = $2, lever_actual = $3 WHERE loop_id = $1", [lid, old.lever_guess, old.lever_actual]);
}

/** Trafienie typu: typ kategorii porównujemy z kategorią dźwigni nr 1, typ dźwigni – z dźwignią nr 1. */
function actualOf(top: { key: string } | null, guess: string | null): string | null {
  if (!top) return null;
  return guess && isCat(guess) ? `${CAT}${catOfLever(top.key)!.key}` : top.key;
}

/** Zgadywanie dźwigni → dopiero potem ranking. Ranking zamrażany w sesji (te same liczby do decyzji). */
export async function guessLever(lid: string, guess: string) {
  const { projectId, data } = await loopProject(lid);
  if (!isCat(guess) && !LEVER_NAMES[guess]) throw new Error("Wybierz, gdzie leżą pieniądze");
  const p = await predictionOf(lid);
  if (!p) throw new Error("Najpierw predykcja");
  // zmiana typu – ranking zostaje ten sam
  if (p.lever_guess && data.kwota?.snapshot) {
    await q("UPDATE predictions SET lever_guess = $2 WHERE loop_id = $1", [lid, guess]);
    return;
  }
  const eng = await engine(projectId, rangeOfData(data));
  const top = topLever(eng);
  await q("UPDATE predictions SET lever_guess = $2, lever_actual = $3 WHERE loop_id = $1", [lid, guess, actualOf(top, guess)]);
  // pogłębiamy dźwignię nr 1; gdy żadna nie ma danych – pierwszą ze wskazanej kategorii
  const kwota = { ...(data.kwota ?? {}), snapshot: eng, focus: top?.key ?? (isCat(guess) ? catByKey(guess)!.levers[0] : guess) };
  await q("UPDATE loops SET data = $2 WHERE id = $1", [lid, JSON.stringify({ ...data, kwota })]);
}

const fmtM = fmtMetric;
const zl = (v: number | null | undefined) => (v == null ? "brak danych" : `${v < 0 ? "−" : ""}${String(Math.abs(Math.round(v))).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} zł`);
const moved = (a: number | null, b: number | null, what: string) =>
  a == null || b == null || !b ? "" : Math.abs(a / b - 1) < 0.03 ? `${what} prawie się nie zmienił.` : `${what} ${a > b ? "wzrósł" : "spadł"} o ${Math.abs(Math.round((a / b - 1) * 100))}% względem poprzednich 30 dni.`;

/** Pytania zapasowe (gdy Claude niedostępny) – z danych, ludzkim językiem. */
export function socratic(eng: EngineResult, focus: string): string[] {
  const L = allLevers(eng).find((l) => l.key === focus)!;
  const base = eng.ranking.base;
  const P = eng.metricsPrev;
  const name = LEVER_NAMES[focus].short;
  const goal = L.benchmark != null ? ` W najlepszym okresie było ${fmtM(focus, L.benchmark)} – do tego dążymy.` : "";
  const now = `Twój ${name} wynosi teraz ${fmtM(focus, L.current)}.${goal}`;
  const u = eng.units;
  const qs: string[] = [];
  if (focus === "cpm") {
    qs.push(`${now} ${moved(base.ctr, P.ctr, "Odsetek kliknięć (CTR)")} Co zmieniło się w tym, komu i jak często pokazujesz reklamy?`);
    qs.push(`Każde 1000 wyświetleń daje dziś ${zl(u.perMille)} profitu. Która kampania płaci najwięcej za wyświetlenia – i czy jej wyniki to uzasadniają?`);
  }
  if (focus === "ctr") {
    qs.push(`${now} ${moved(base.cpm, P.cpm, "Koszt wyświetleń (CPM)")} Co było w reklamach w najlepszym tygodniu, czego teraz nie ma?`);
    qs.push(`Jedno kliknięcie jest dziś warte ${zl(u.perClick)} profitu. Czy najwięcej budżetu dostają reklamy, w które ludzie klikają najchętniej?`);
  }
  if (focus === "cr") {
    qs.push(`${now} ${moved(base.ctr, P.ctr, "Odsetek kliknięć w reklamę (CTR)")} Co zmieniło się po kliknięciu – na stronie, w cenie, ofercie albo płatności?`);
    qs.push(`Jedno zamówienie to ${zl(u.perOrder)} profitu. Czy ludzie z reklam trafiają na tę samą stronę i ofertę co w najlepszym tygodniu?`);
  }
  if (isEmailLever(focus)) {
    const e = eng.email!;
    qs.push(`${now} Co było w mailach z najlepszego okresu (temat, oferta, dzień wysyłki), czego teraz nie ma?`);
    qs.push(`Z maili w tym okresie było ${e.window.orders} zamówień z ${Math.round(e.window.clicks).toLocaleString("pl-PL")} kliknięć. Które maile sprzedają, a które tylko dostają otwarcia?`);
  }
  if (focus === "aov") {
    qs.push(`Średnia wartość zamówienia (AOV) to teraz ${fmtM("aov", L.current)}.${goal} Co zmieniło się w koszyku: dodatki, cena, rabaty?`);
    qs.push(eng.ltv.value != null
      ? `Kupujący dokupują średnio ${zl(eng.ltv.value)} w ciągu 30 dni. Co to jest i czy proponujesz to już przy pierwszym zakupie?`
      : "Nie mamy danych o dokupieniach w 30 dni. Co kupujący mogliby dobrać od razu przy zakupie?");
  }
  return qs;
}

/** Pytania – układa Claude (z liczb sesji); gdy niedostępny, pytania zapasowe z danych. Generowane raz na dźwignię. */
export async function ensureQuestions(lid: string) {
  const { data } = await loopProject(lid);
  const eng = data.kwota?.snapshot as EngineResult | undefined;
  if (!eng) throw new Error("Najpierw krok „Gdzie leżą pieniądze”");
  const focus = (data.pytania?.focus ?? data.kwota?.focus) as string | null;
  if (!focus) return { questions: [] as string[], focus: null, source: null as string | null, error: null as string | null };
  if (Array.isArray(data.pytania?.questions) && data.pytania.focus === focus)
    return { questions: data.pytania.questions as string[], focus, source: (data.pytania.source as string) ?? null, error: (data.pytania.error as string) ?? null };
  let questions: string[];
  let source = "claude";
  let error: string | null = null;
  try {
    questions = await claudeQuestions(eng, focus);
  } catch (e) {
    if (!(e instanceof ClaudeError) && !(e instanceof SyntaxError)) throw e;
    questions = socratic(eng, focus);
    source = "dane";
    error = (e as Error).message;
  }
  await q("UPDATE loops SET data = $2 WHERE id = $1", [lid, JSON.stringify({ ...data, pytania: { ...(data.pytania ?? {}), focus, questions, source, error, answers: {} } })]);
  return { questions, focus, source, error };
}

/** Analiza Claude po odpowiedziach – obowiązkowa, bez niej sesja nie idzie dalej. */
export async function runAnalysis(lid: string) {
  const { data } = await loopProject(lid);
  const eng = data.kwota?.snapshot as EngineResult | undefined;
  const qs = (data.pytania?.questions ?? []) as string[];
  const ans = (data.pytania?.answers ?? {}) as Record<string, string>;
  if (!eng || !qs.length || qs.some((_, i) => !String(ans[i] ?? "").trim())) throw new Error("Najpierw odpowiedz na wszystkie pytania.");
  const text = await claudeAnalysis(eng, (data.pytania?.focus as string) ?? null, qs.map((qq, i) => ({ q: qq, a: String(ans[i]) })));
  await q("UPDATE loops SET data = $2 WHERE id = $1", [lid, JSON.stringify({ ...data, analiza: { text, at: new Date().toISOString() } })]);
  return text;
}

/** Zmiana dźwigni do pogłębienia (np. nr 2 zamiast nr 1) – nowe pytania. */
export async function setFocus(lid: string, focus: string) {
  const { data } = await loopProject(lid);
  if (!LEVER_NAMES[focus]) throw new Error("Zła dźwignia");
  await q("UPDATE loops SET data = $2 WHERE id = $1", [lid, JSON.stringify({ ...data, pytania: { focus } })]);
  return ensureQuestions(lid);
}

export function baselineOf(eng: EngineResult): Baseline {
  return { budget: eng.ranking.budget, base: eng.ranking.base, econ: eng.econ, th: eng.th, email: eng.email?.ranking.base };
}

export async function createDecision(lid: string, b: {
  kind?: string; what?: string; who?: string; why?: string; element?: string; metric?: string; to_value?: number | null; check_date?: string; ad_test_id?: string | null; replace?: boolean;
}) {
  const { projectId, data } = await loopProject(lid);
  const prev = await one<{ id: string }>("SELECT id FROM decisions WHERE loop_id = $1", [lid]);
  if (prev && !b.replace) throw new Error("Decyzja tej sesji jest już zapisana.");
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
    const key = String(b.metric ?? "");
    const cat = isCat(key) ? catByKey(key)! : null;
    const ad = METRICS.find((x) => x.key === key);
    const em = EMAIL_METRICS.find((x) => x.key === key);
    const to = Number(b.to_value);
    const miss = [
      !what && "Co (jedna konkretna zmiana)", !who && "Kto", !why && "Dlaczego", !cat && !ad && !em && "Czego dotyczy (kategoria albo dźwignia)",
      !cat && !Number.isFinite(to) && "Wartość docelowa metryki (B)",
    ].filter(Boolean);
    if (miss.length) throw new Error(`Uzupełnij: ${miss.join(", ")}.`);
    let from: number | null = null;
    let expected: number | null;
    let hyp: string;
    if (cat) {
      expected = categoryValue(eng, cat.key);
      hyp = `Jeśli ${what}, to kategoria „${cat.name}” da ${expected == null ? "więcej (brak danych do kwoty)" : `${zl(expected)}/mies. więcej`} – wszystkie wskaźniki kategorii do najlepszego okresu.`;
    } else if (em) {
      if (!base.email) throw new Error("Brak danych maili w tej sesji – przejdź jeszcze raz krok „Gdzie leżą pieniądze”.");
      from = base.email[em.key];
      expected = emailHypothesisValue(base.email, base.econ, { [em.key]: to });
      hyp = `Jeśli ${what}, to ${em.label} z ${fmtM(em.key, from)} do ${fmtM(em.key, to)}.`;
    } else {
      from = base.base[ad!.key];
      expected = hypothesisValue(base.budget, base.base, base.econ, ad!.key, to);
      hyp = `Jeśli ${what}, to ${ad!.label} z ${fmtM(ad!.key, from)} do ${fmtM(ad!.key, to)}.`;
    }
    const element = String(b.element ?? "").slice(0, 40) || (cat ?? catOfLever(key))?.element || "";
    await q(
      `INSERT INTO decisions (id, project_id, loop_id, kind, what, who, why, element, metric, from_value, to_value, hypothesis, expected_month, baseline, start_date, check_date, ad_test_id)
       VALUES ($1,$2,$3,'zmiana',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [id, projectId, lid, what.slice(0, 500), who, why.slice(0, 2000), element, key, from, cat ? null : to, hyp, expected, JSON.stringify(base), t, check, b.ad_test_id || null],
    );
    await q("INSERT INTO tasks (id, project_id, title, due, decision_id, required, who) VALUES ($1,$2,$3,$4,$5,true,$6)", [
      newId(), projectId, `${MEASURE_TASK}: ${what}`.slice(0, 300), addDays(t, 1), id, who,
    ]);
  }
  if (prev) {
    // edycja: dopisane zadania przechodzą do nowej wersji decyzji
    await q("UPDATE tasks SET decision_id = $2 WHERE decision_id = $1 AND NOT required", [prev.id, id]);
    await deleteDecision(prev.id);
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

/** Rozstrzygnięcie dźwigni (reklamy/maile) albo całej kategorii: wpływ w zł/mies. względem stanu z dnia decyzji. */
function verdictOf(b: Baseline, metric: string, totals: Awaited<ReturnType<typeof measure>>["totals"], email: Awaited<ReturnType<typeof measure>>["email"]) {
  const keys: string[] = isCat(metric) ? [...catByKey(metric)!.levers] : [metric];
  if (keys.some(isEmailLever)) {
    if (!b.email) return { actual: null, impact: null, range: null as [number, number] | null, lowConfidence: true };
    return emailVerdictImpact(b.email, b.econ, keys as EmailKey[], email, b.th);
  }
  if (keys.length === 1) return verdictImpact(b.budget, b.base, b.econ, keys[0] as MetricKey, totals, b.th);
  const m = metricsOf(totals);
  const over: Partial<Record<MetricKey, number>> = {};
  for (const k of keys as MetricKey[]) {
    if (m[k] == null) return { actual: null, impact: null, range: null as [number, number] | null, lowConfidence: true };
    over[k] = m[k]!;
  }
  const now = modelProfit(b.budget, b.base, b.econ);
  const then = modelProfit(b.budget, b.base, b.econ, over);
  return { actual: null, impact: now == null || then == null ? null : then - now, range: null as [number, number] | null, lowConfidence: (keys as MetricKey[]).some((k) => !enoughFor(k, totals, b.th)) };
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
  const v = verdictOf(b, x.metric, now.totals, now.email);
  const A = x.from_value;
  const B = x.to_value;
  const moved = v.actual != null && A != null && B != null && B !== A ? (v.actual - A) / (B - A) : null;
  // cała kategoria: „tak”, gdy zł z kategorii wzrosły
  const suggestion = v.lowConfidence ? "za mało danych" : isCat(x.metric) ? (v.impact == null ? null : v.impact > 0 ? "tak" : "nie") : moved == null ? null : moved >= 0.5 ? "tak" : "nie";
  return { projectId, decision: x, from, to: end, actual: v.actual, impact: v.impact, range: v.range, lowConfidence: v.lowConfidence, profit: now.money.profit, profitBefore: before.money.profit, suggestion };
}

const stageOf = (k: string) => (isCat(k) ? catByKey(k)!.name : [...METRICS, ...EMAIL_METRICS].find((m) => m.key === k)?.stage ?? k);

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
    newId(), pid, active?.id ?? x.loop_id, x.metric ? stageOf(x.metric) : "", x.element, learning.trim().slice(0, 1000), r.impact,
  ]);
  if (verdict === "tak" && x.kind !== NO_CHANGE && (r.impact ?? 0) > 0) {
    await q(
      `INSERT INTO winning_elements (id, project_id, stage, element, change_to, idea_source, decision_id, profit_month) VALUES ($1,$2,$3,$4,$5,'sesja analityczna',$6,$7)`,
      [newId(), pid, x.element || "inne", x.metric ? targetName(x.metric) : "", x.what, did, r.impact],
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

/* ---------- Raport (zamrożone liczby z sesji) ---------- */

export interface ReportData {
  createdAt: string;
  /** tytuł raportu (edytowalny) */
  title: string;
  range: Range;
  client: string;
  project: string;
  scope: { campaigns: string[]; products: string[] };
  goal: GoalRow | null;
  gap: Awaited<ReturnType<typeof gap>> | null;
  reality: Pick<Awaited<ReturnType<typeof reality>>, "wide" | "widePrev" | "weeks" | "days" | "daily60" | "gaps" | "events" | "period" | "periodPrev" | "periodDays">;
  prediction: Prediction | null;
  engine: EngineResult | null;
  focus: string | null;
  questions: { q: string; a: string }[];
  questionsSource: string | null;
  analysis: string | null;
  /** powód pominięcia analizy Claude (gdy pominięta) */
  analysisSkipped: string | null;
  decision: Decision | null;
  verdicts: Decision[];
  summary: string;
  counter: Awaited<ReturnType<typeof counter>>;
}

async function buildReport(lid: string, projectId: string, data: LoopRow["data"]): Promise<ReportData> {
  const [st, r, settings, names] = await Promise.all([
    loopState(projectId),
    reality(projectId, rangeOfData(data).to, rangeOfData(data)),
    loadSettings(projectId),
    one<{ project: string; client: string }>("SELECT p.name AS project, c.name AS client FROM projects p JOIN clients c ON c.id = p.client_id WHERE p.id = $1", [projectId]),
  ]);
  const g = st.goal ? await gap(projectId, st.goal) : null;
  const qs = (data.pytania?.questions ?? []) as string[];
  const ans = (data.pytania?.answers ?? {}) as Record<string, string>;
  return {
    createdAt: new Date().toISOString(),
    title: `Raport – ${names?.client ?? ""} – ${new Date().toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" })}`,
    range: rangeOfData(data),
    client: names?.client ?? "",
    project: names?.project ?? "",
    scope: settings.analysisScope ?? settings.economicsScope,
    goal: st.goal,
    gap: g,
    reality: { wide: r.wide, widePrev: r.widePrev, weeks: r.weeks, days: r.days, daily60: r.daily60, gaps: r.gaps, events: r.events, period: r.period, periodPrev: r.periodPrev, periodDays: r.periodDays },
    prediction: st.prediction,
    engine: (data.kwota?.snapshot as EngineResult | undefined) ?? null,
    focus: (data.pytania?.focus as string | undefined) ?? null,
    questions: qs.map((qq, i) => ({ q: qq, a: String(ans[i] ?? "") })),
    questionsSource: (data.pytania?.source as string | undefined) ?? null,
    analysis: (data.analiza?.text as string | undefined) ?? null,
    analysisSkipped: data.analiza?.skipped === true && !data.analiza?.text ? String(data.analiza.skipReason || "Claude niedostępny") : null,
    decision: st.decisions.find((d) => d.loop_id === lid) ?? null,
    verdicts: st.decisions.filter((d) => d.verdict_loop_id === lid),
    summary: String(data.raport?.summary ?? ""),
    counter: st.counter,
  };
}

/** Podgląd raportu przed zamknięciem sesji (te same dane, które zostaną zapisane). */
export async function previewReport(lid: string) {
  const { projectId, data } = await loopProject(lid);
  return buildReport(lid, projectId, data);
}

async function finish(lid: string, projectId: string, data: LoopRow["data"]) {
  const report = await buildReport(lid, projectId, data);
  const dec = report.decision;
  const top = report.engine ? topLever(report.engine) : null;
  const lines = [
    report.goal ? `Cel: ${Math.round(report.goal.profit_target)} zł profitu (${report.goal.date_from} – ${report.goal.date_to})` : "",
    top ? `Największa dźwignia: ${LEVER_NAMES[top.key].name} – ${Math.round(top.value!)} zł/mies.${top.lowConfidence ? " (niska pewność)" : ""}` : "",
    dec ? `Decyzja: ${dec.what}${dec.expected_month != null ? ` (oczekiwane ${Math.round(dec.expected_month)} zł/mies.)` : ""}, sprawdzenie ${dec.check_date}` : "",
    report.summary ? `Wniosek: ${report.summary}` : "",
  ].filter(Boolean);
  await q(
    "INSERT INTO timeline_events (id, project_id, day, type, title, description, source, link, confidence) VALUES ($1,$2,$3,'analiza',$4,$5,'Sesja analityczna',$6,'memory')",
    [newId(), projectId, today(), "Sesja analityczna – raport", lines.join("\n"), `report:${lid}`],
  );
  await q("UPDATE loops SET finished_at = now(), step = $2, data = $3 WHERE id = $1", [lid, STEPS.length, JSON.stringify({ ...data, report })]);
}

export async function listReports(projectId: string) {
  const rows = await q<{ id: string; finished_at: string; report: unknown }>(
    "SELECT id, to_char(finished_at, 'YYYY-MM-DD') AS finished_at, data->'report' AS report FROM loops WHERE project_id = $1 AND finished_at IS NOT NULL AND data ? 'report' ORDER BY finished_at DESC",
    [projectId],
  );
  return rows.map((r) => {
    const rep = j<ReportData>(r.report, {} as ReportData);
    const top = rep.engine ? topLever(rep.engine) : null;
    return {
      id: r.id, date: r.finished_at, title: rep.title ?? null,
      profit: rep.gap?.achieved ?? null, target: rep.goal?.profit_target ?? null,
      decision: rep.decision?.what ?? null, expected: rep.decision?.expected_month ?? null,
      lever: top ? { key: top.key, value: top.value } : null,
    };
  });
}

export async function getReport(lid: string) {
  const r = await one<{ project_id: string; report: unknown; share_token: string | null }>(
    "SELECT project_id, data->'report' AS report, share_token FROM loops WHERE id = $1 AND finished_at IS NOT NULL",
    [lid],
  );
  return r?.report ? { projectId: r.project_id, report: j<ReportData>(r.report, {} as ReportData), shareToken: r.share_token } : null;
}

/** Usunięcie raportu. Decyzje i predykcje z tej sesji zostają (sprawdzenia i licznik efektów). */
export async function deleteReport(lid: string) {
  const r = await one<{ project_id: string }>("SELECT project_id FROM loops WHERE id = $1 AND finished_at IS NOT NULL", [lid]);
  if (!r) throw new Error("Brak raportu");
  await q("UPDATE loops SET data = data - 'report', share_token = NULL WHERE id = $1", [lid]);
  await q("DELETE FROM timeline_events WHERE project_id = $1 AND link = $2", [r.project_id, `report:${lid}`]);
}

/** Zmiana tytułu raportu. */
export async function renameReport(lid: string, title: string) {
  const t = title.trim().slice(0, 200);
  if (!t) throw new Error("Wpisz tytuł");
  await q("UPDATE loops SET data = jsonb_set(data, '{report,title}', to_jsonb($2::text)) WHERE id = $1 AND finished_at IS NOT NULL", [lid, t]);
}

/** Link tylko do odczytu dla klienta (tworzony na żądanie). */
export async function shareReport(lid: string) {
  const r = await getReport(lid);
  if (!r) throw new Error("Brak raportu");
  // mapy lejków projektu też dostają link tylko do odczytu – klient otworzy je z raportu
  const funnels = await q<{ id: string }>("SELECT id FROM funnels WHERE project_id = $1 AND share_token IS NULL", [r.projectId]);
  for (const f of funnels) await q("UPDATE funnels SET share_token = $2 WHERE id = $1", [f.id, crypto.randomUUID().replace(/-/g, "")]);
  if (r.shareToken) return r.shareToken;
  const token = crypto.randomUUID().replace(/-/g, "");
  await q("UPDATE loops SET share_token = $2 WHERE id = $1", [lid, token]);
  return token;
}

export async function reportByToken(token: string) {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  const r = await one<{ report: unknown; project_id: string }>("SELECT data->'report' AS report, project_id FROM loops WHERE share_token = $1", [token]);
  if (!r?.report) return null;
  const maps = await q<{ name: string; share_token: string }>("SELECT name, share_token FROM funnels WHERE project_id = $1 AND share_token IS NOT NULL ORDER BY updated_at DESC", [r.project_id]);
  return { report: j<ReportData>(r.report, {} as ReportData), maps: maps.map((m) => ({ name: m.name, href: `/share/${m.share_token}` })) };
}

/** Mapy lejków projektu (do raportu wewnętrznego). */
export async function projectMaps(projectId: string) {
  const rows = await q<{ id: string; name: string }>("SELECT id, name FROM funnels WHERE project_id = $1 ORDER BY updated_at DESC", [projectId]);
  return rows.map((m) => ({ name: m.name, href: `/mapa/${m.id}` }));
}
