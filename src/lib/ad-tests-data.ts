// Testy reklam – dane: zapis testów/rund/wariantów i wyliczanie wyników z Meta (nazwa reklamy),
// skryptu (wejścia z utm_content) i zakupów (przypisane po utm_content w oknie atrybucji).
import { newId, one, q } from "./db";
import { loadSettings } from "./project-data";
import { matchesProducts } from "./analysis";
import {
  EMPTY_TOTALS, LETTERS, adName, attribute, budgetPerVariant, derive, fatigue, mergeTestSettings, normName, roundHints, scaling, suggestVariant,
  verdictDate, type DayPoint, type Decision, type Derived, type Suggestion, type TestSettings, type VariantTotals,
} from "./ad-tests";

const DAY = 86400_000;
const today = () => new Date().toISOString().slice(0, 10);
const day = (t: number) => new Date(t).toISOString().slice(0, 10);
const dstr = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").slice(0, 10));

export async function getTestSettings(projectId: string): Promise<TestSettings> {
  return mergeTestSettings((await loadSettings(projectId)).adTests);
}

interface TestRow { id: string; project_id: string; angle: string; status: string; notes: string; created_at: string }
interface RoundRow { id: string; test_id: string; number: number; element: string; base_variant_id: string | null; start_date: string; verdict_date: string | null; status: string; winner_variant_id: string | null; page_url: string }
interface VariantRow { id: string; round_id: string; letter: string; change_to: string; idea_source: string; hypothesis: string; meta_ad_name: string; daily_budget: number; decision: Decision; decision_note: string; decided_at: string | null }

export interface VariantResult extends VariantRow {
  totals: VariantTotals;
  d: Derived;
  suggestion: Suggestion;
  sources: { meta: "api" | "manual" | null; shop: "tracked" | "manual" | null; lastMeta: string | null };
  daily: DayPoint[];
}

export interface RoundResult extends RoundRow {
  variants: VariantResult[];
  hints: string[];
  daysRunning: number;
  daysToVerdict: number | null;
  bestCac: number | null;
}

/** Surowe dane projektu potrzebne do wyliczeń (jedno pobranie na test/listę). */
async function loadRaw(projectId: string, from: string, attributionDays: number) {
  const touchFrom = day(Date.parse(`${from}T00:00:00Z`) - attributionDays * DAY);
  const [ads, touches, purchases] = await Promise.all([
    q<{ day: string; ad: string; spend: number; impressions: number; clicks: number; video_3s: number; thruplay: number; purchases: number; purchase_value: number }>(
      `SELECT to_char(period_start, 'YYYY-MM-DD') AS day, ad, spend, impressions, clicks, video_3s, thruplay, purchases, purchase_value
       FROM ad_rows WHERE project_id = $1 AND period_start >= $2::date`,
      [projectId, from],
    ),
    q<{ visitor_id: string; ts: string; utm_content: string }>(
      `SELECT visitor_id, ts, utm_content FROM events
       WHERE project_id = $1 AND NOT is_test AND type = 'pageview' AND utm_content <> '' AND ts >= $2::date`,
      [projectId, touchFrom],
    ),
    q<{ id: string; visitor_id: string; ts: string; value: number | null; name: string; element: string; utm_content: string }>(
      `SELECT id, visitor_id, ts, value, name, element, utm_content FROM events
       WHERE project_id = $1 AND NOT is_test AND type = 'purchase' AND ts >= $2::date`,
      [projectId, from],
    ),
  ]);
  const byVisitor = new Map<string, { ts: number; content: string }[]>();
  for (const t of touches) {
    const arr = byVisitor.get(t.visitor_id) ?? [];
    arr.push({ ts: new Date(t.ts).getTime(), content: t.utm_content });
    byVisitor.set(t.visitor_id, arr);
  }
  return { ads, touches, purchases, byVisitor };
}

type Raw = Awaited<ReturnType<typeof loadRaw>>;

function computeRound(r: RoundRow, vs: VariantRow[], raw: Raw, manual: Map<string, ManualRow[]>, s: TestSettings, accountCtr: number | null): RoundResult {
  const start = dstr(r.start_date);
  const startTs = Date.parse(`${start}T00:00:00Z`);
  const now = today();
  const productSet = s.productMatch.length > 0;
  // Zakupy z okresu rundy przypisane do nazw reklam
  const attributed = new Map<string, { ts: number; value: number; main: boolean }[]>();
  let mainTotal = 0;
  let mainUnattributed = 0;
  for (const p of raw.purchases) {
    const ts = new Date(p.ts).getTime();
    if (ts < startTs) continue;
    const main = productSet ? matchesProducts(s.productMatch, p) : true;
    const content = attribute(ts, p.utm_content, raw.byVisitor.get(p.visitor_id), s.attributionDays);
    if (main) {
      mainTotal++;
      if (!content) mainUnattributed++;
    }
    if (!content) continue;
    const key = normName(content);
    const arr = attributed.get(key) ?? [];
    arr.push({ ts, value: Number(p.value ?? 0), main });
    attributed.set(key, arr);
  }

  const variants: VariantResult[] = vs.map((v) => {
    const key = normName(v.meta_ad_name);
    const t: VariantTotals = { ...EMPTY_TOTALS };
    const daily = new Map<string, DayPoint>();
    const dp = (d: string) => {
      let x = daily.get(d);
      if (!x) daily.set(d, (x = { day: d, spend: 0, impressions: 0, linkClicks: 0, mainOrders: 0 }));
      return x;
    };
    let lastMeta: string | null = null;
    const metaRows = raw.ads.filter((a) => a.day >= start && normName(a.ad) === key);
    for (const a of metaRows) {
      t.spend += Number(a.spend);
      t.impressions += Number(a.impressions);
      t.linkClicks += Number(a.clicks);
      t.video3s += Number(a.video_3s);
      t.thruplay += Number(a.thruplay);
      t.metaPurchases += Number(a.purchases);
      t.metaValue += Number(a.purchase_value);
      const x = dp(a.day);
      x.spend += Number(a.spend);
      x.impressions += Number(a.impressions);
      x.linkClicks += Number(a.clicks);
      if (!lastMeta || a.day > lastMeta) lastMeta = a.day;
    }
    t.visits = new Set(raw.touches.filter((x) => normName(x.utm_content) === key && new Date(x.ts).getTime() >= startTs).map((x) => x.visitor_id)).size;
    const orders = attributed.get(key) ?? [];
    t.orders = orders.length;
    t.mainOrders = orders.filter((o) => o.main).length;
    t.revenue = orders.reduce((a, o) => a + o.value, 0);
    for (const o of orders) if (o.main) dp(day(o.ts)).mainOrders++;

    // Tryb ręczny: używany, gdy brak danych automatycznych (wartości automatyczne go zastępują).
    const man = manual.get(v.id) ?? [];
    let metaSource: "api" | "manual" | null = metaRows.length ? "api" : null;
    let shopSource: "tracked" | "manual" | null = orders.length ? "tracked" : null;
    if (!metaRows.length && man.length) {
      metaSource = "manual";
      for (const m of man) {
        t.spend += m.spend;
        t.impressions += m.impressions;
        t.linkClicks += m.link_clicks;
        t.video3s += m.video_3s;
        t.thruplay += m.thruplay;
        const x = dp(dstr(m.day));
        x.spend += m.spend;
        x.impressions += m.impressions;
        x.linkClicks += m.link_clicks;
      }
    }
    if (!orders.length && man.some((m) => m.orders > 0)) {
      shopSource = "manual";
      for (const m of man) {
        t.orders += m.orders;
        t.mainOrders += m.orders;
        t.revenue += m.revenue;
        dp(dstr(m.day)).mainOrders += m.orders;
      }
    }
    const d = derive(t, s);
    return {
      ...v,
      daily_budget: Number(v.daily_budget),
      totals: t,
      d,
      suggestion: { code: "w_toku", label: "", decision: "w toku", diffToBest: null },
      sources: { meta: metaSource, shop: shopSource, lastMeta },
      daily: [...daily.values()].sort((a, b) => a.day.localeCompare(b.day)),
    };
  });
  for (const v of variants) v.suggestion = suggestVariant(v, variants, s);
  const daysRunning = Math.max(0, Math.floor((Date.parse(`${now}T00:00:00Z`) - startTs) / DAY));
  const hints = roundHints(
    variants.map((v) => ({ letter: v.letter, totals: v.totals, d: v.d, metaSource: v.sources.meta })),
    s,
    { accountCtr, daysRunning, unattributedShare: mainTotal ? mainUnattributed / mainTotal : null, productMatchSet: productSet },
  );
  const cacs = variants.map((v) => v.d.cac).filter((c): c is number => c != null && c > 0);
  const vd = r.verdict_date ? dstr(r.verdict_date) : null;
  return {
    ...r,
    start_date: start,
    verdict_date: vd,
    variants,
    hints,
    daysRunning,
    daysToVerdict: vd ? Math.ceil((Date.parse(`${vd}T00:00:00Z`) - Date.parse(`${now}T00:00:00Z`)) / DAY) : null,
    bestCac: cacs.length ? Math.min(...cacs) : null,
  };
}

interface ManualRow { variant_id: string; day: string; spend: number; impressions: number; link_clicks: number; video_3s: number; thruplay: number; orders: number; revenue: number }

async function loadManual(variantIds: string[]): Promise<Map<string, ManualRow[]>> {
  const m = new Map<string, ManualRow[]>();
  if (!variantIds.length) return m;
  const rows = await q<ManualRow>(
    `SELECT variant_id, to_char(day, 'YYYY-MM-DD') AS day, spend, impressions, link_clicks, video_3s, thruplay, orders, revenue
     FROM ad_test_manual WHERE variant_id = ANY($1)`,
    [variantIds],
  );
  for (const r of rows) {
    const x = { ...r, spend: Number(r.spend), impressions: Number(r.impressions), link_clicks: Number(r.link_clicks), video_3s: Number(r.video_3s), thruplay: Number(r.thruplay), orders: Number(r.orders), revenue: Number(r.revenue) };
    m.set(r.variant_id, [...(m.get(r.variant_id) ?? []), x]);
  }
  return m;
}

/** Wszystkie testy projektu z wynikami (lista i widok testu korzystają z tego samego wyliczenia). */
export async function loadTests(projectId: string, testId?: string) {
  const s = await getTestSettings(projectId);
  const tests = await q<TestRow>(
    `SELECT id, project_id, angle, status, notes, created_at FROM ad_tests WHERE project_id = $1 ${testId ? "AND id = $2" : ""} ORDER BY created_at DESC`,
    testId ? [projectId, testId] : [projectId],
  );
  if (!tests.length) return { settings: s, tests: [] as TestResult[] };
  const rounds = await q<RoundRow>(
    `SELECT id, test_id, number, element, base_variant_id, start_date, verdict_date, status, winner_variant_id, page_url
     FROM ad_test_rounds WHERE test_id = ANY($1) ORDER BY number`,
    [tests.map((t) => t.id)],
  );
  const variants = rounds.length
    ? await q<VariantRow>(
        `SELECT id, round_id, letter, change_to, idea_source, hypothesis, meta_ad_name, daily_budget, decision, decision_note, decided_at
         FROM ad_test_variants WHERE round_id = ANY($1) ORDER BY letter`,
        [rounds.map((r) => r.id)],
      )
    : [];
  const from = rounds.length ? rounds.map((r) => dstr(r.start_date)).sort()[0] : today();
  const raw = await loadRaw(projectId, from, s.attributionDays);
  const manual = await loadManual(variants.map((v) => v.id));
  const accImp = raw.ads.reduce((a, x) => a + Number(x.impressions), 0);
  const accCtr = accImp ? raw.ads.reduce((a, x) => a + Number(x.clicks), 0) / accImp : null;

  const out: TestResult[] = tests.map((t) => {
    const rs = rounds
      .filter((r) => r.test_id === t.id)
      .map((r) => computeRound(r, variants.filter((v) => v.round_id === r.id), raw, manual, s, accCtr));
    const current = rs[rs.length - 1] ?? null;
    // Zmęczenie i skalowanie zwycięzców (warianty z decyzją „wygrał”).
    const winners = rs.flatMap((r) => r.variants.filter((v) => v.decision === "wygrał").map((v) => ({ round: r.number, v })));
    const watch = winners.map(({ round, v }) => {
      const f = fatigue(v.daily, s);
      return { round, variantId: v.id, letter: v.letter, name: v.meta_ad_name, weeks: f.weeks, fatigue: f.alarm, scaling: scaling(v.daily, s, today()) };
    });
    const alarms = [...(current?.hints ?? []), ...watch.map((w) => w.fatigue).filter((x): x is string => !!x)];
    return { ...t, rounds: rs, current, watch, alarms };
  });
  return { settings: s, tests: out };
}

export type TestResult = TestRow & {
  rounds: RoundResult[];
  current: RoundResult | null;
  watch: { round: number; variantId: string; letter: string; name: string; weeks: ReturnType<typeof fatigue>["weeks"]; fatigue: string | null; scaling: string | null }[];
  alarms: string[];
};

export async function createTest(projectId: string, angle: string, notes = "") {
  const id = newId();
  await one("INSERT INTO ad_tests (id, project_id, angle, notes) VALUES ($1, $2, $3, $4) RETURNING id", [id, projectId, angle.trim().slice(0, 200), notes.slice(0, 4000)]);
  return id;
}

export interface RoundInput {
  element: string;
  startDate?: string;
  pageUrl?: string;
  variants: { changeTo: string; ideaSource?: string; hypothesis?: string; dailyBudget?: number }[];
}

export async function createRound(testId: string, input: RoundInput) {
  const t = await one<{ id: string; project_id: string; angle: string }>("SELECT id, project_id, angle FROM ad_tests WHERE id = $1", [testId]);
  if (!t) throw new Error("Nie znaleziono testu");
  if (input.variants.length < 1 || input.variants.length > 4) throw new Error("Runda ma 1–4 warianty (zwykle 2–4).");
  const s = await getTestSettings(t.project_id);
  const prev = await one<{ number: number; winner_variant_id: string | null }>(
    "SELECT number, winner_variant_id FROM ad_test_rounds WHERE test_id = $1 ORDER BY number DESC LIMIT 1",
    [testId],
  );
  const number = (prev?.number ?? 0) + 1;
  const start = input.startDate && /^\d{4}-\d{2}-\d{2}$/.test(input.startDate) ? input.startDate : today();
  const budgets = input.variants.map((v) => Number(v.dailyBudget) || 0).filter((x) => x > 0);
  const vd = budgets.length ? verdictDate(start, Math.min(...budgets), s) : null;
  const roundId = newId();
  await one(
    `INSERT INTO ad_test_rounds (id, test_id, number, element, base_variant_id, start_date, verdict_date, page_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [roundId, testId, number, input.element.slice(0, 60), prev?.winner_variant_id ?? null, start, vd, (input.pageUrl ?? "").slice(0, 1000)],
  );
  const created: { letter: string; name: string }[] = [];
  for (const [i, v] of input.variants.entries()) {
    const letter = LETTERS[i];
    const name = adName(s.namingPattern, t.angle, number, letter);
    await one(
      `INSERT INTO ad_test_variants (id, round_id, letter, change_to, idea_source, hypothesis, meta_ad_name, daily_budget)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [newId(), roundId, letter, v.changeTo.slice(0, 1000), (v.ideaSource ?? "").slice(0, 500), (v.hypothesis ?? "").slice(0, 1000), name, Number(v.dailyBudget) || 0],
    );
    created.push({ letter, name });
  }
  await q("UPDATE ad_tests SET status = 'w toku' WHERE id = $1", [testId]);
  await timeline(t.project_id, start, `Test „${t.angle}”: start rundy ${number} (${input.element})`, created.map((c) => c.name).join(", "));
  return { roundId, number, verdictDate: vd, variants: created };
}

async function timeline(projectId: string, dayStr: string, title: string, description = "") {
  await one(
    `INSERT INTO timeline_events (id, project_id, day, type, title, description, source, confidence) VALUES ($1,$2,$3,'test reklam',$4,$5,'Testy reklam','data') RETURNING id`,
    [newId(), projectId, dayStr, title.slice(0, 300), description.slice(0, 4000)],
  );
}

/** Zatwierdzona decyzja. „Wygrał” = zwycięzca rundy (baza następnej) + wpis do biblioteki. */
export async function setDecision(variantId: string, decision: Decision, note = "") {
  const v = await one<{ id: string; round_id: string; letter: string; change_to: string; idea_source: string; meta_ad_name: string }>(
    "SELECT id, round_id, letter, change_to, idea_source, meta_ad_name FROM ad_test_variants WHERE id = $1",
    [variantId],
  );
  if (!v) throw new Error("Nie znaleziono wariantu");
  const r = await one<{ id: string; test_id: string; number: number; element: string; base_variant_id: string | null }>(
    "SELECT id, test_id, number, element, base_variant_id FROM ad_test_rounds WHERE id = $1",
    [v.round_id],
  );
  const t = await one<{ id: string; project_id: string; angle: string }>("SELECT id, project_id, angle FROM ad_tests WHERE id = $1", [r!.test_id]);
  await q("UPDATE ad_test_variants SET decision = $2, decision_note = $3, decided_at = now() WHERE id = $1", [variantId, decision, note.slice(0, 1000)]);
  if (decision === "wygrał") {
    await q("UPDATE ad_test_rounds SET winner_variant_id = $2, status = 'zamknięta' WHERE id = $1", [r!.id, variantId]);
    const { tests } = await loadTests(t!.project_id, t!.id);
    const vr = tests[0]?.rounds.flatMap((x) => x.variants).find((x) => x.id === variantId);
    const base = r!.base_variant_id ? tests[0]?.rounds.flatMap((x) => x.variants).find((x) => x.id === r!.base_variant_id) : undefined;
    await q("DELETE FROM winning_elements WHERE variant_id = $1", [variantId]);
    await one(
      `INSERT INTO winning_elements (id, project_id, angle, element, change_to, idea_source, variant_id, round_id, test_id, cac, ctr, diff_vs_base)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
      [newId(), t!.project_id, t!.angle, r!.element, v.change_to, v.idea_source, variantId, r!.id, t!.id, vr?.d.cac ?? null, vr?.d.ctr ?? null,
        vr?.d.cac != null && base?.d.cac ? vr.d.cac / base.d.cac - 1 : null],
    );
  }
  await timeline(t!.project_id, today(), `Test „${t!.angle}” R${r!.number}: wariant ${v.letter} – ${decision}`, [v.meta_ad_name, note].filter(Boolean).join(" · "));
}

export async function addManual(variantId: string, m: { day: string; spend?: number; impressions?: number; linkClicks?: number; video3s?: number; thruplay?: number; orders?: number; revenue?: number }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.day)) throw new Error("Data w formacie RRRR-MM-DD");
  const ok = await one("SELECT id FROM ad_test_variants WHERE id = $1", [variantId]);
  if (!ok) throw new Error("Nie znaleziono wariantu");
  await one(
    `INSERT INTO ad_test_manual (id, variant_id, day, spend, impressions, link_clicks, video_3s, thruplay, orders, revenue)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [newId(), variantId, m.day, m.spend ?? 0, m.impressions ?? 0, m.linkClicks ?? 0, m.video3s ?? 0, m.thruplay ?? 0, m.orders ?? 0, m.revenue ?? 0],
  );
}

export async function winningElements(projectId: string) {
  return q<{ id: string; angle: string; element: string; change_to: string; idea_source: string; cac: number | null; ctr: number | null; diff_vs_base: number | null; won_at: string; test_id: string | null }>(
    `SELECT id, angle, element, change_to, idea_source, cac, ctr, diff_vs_base, won_at, test_id FROM winning_elements WHERE project_id = $1 ORDER BY won_at DESC`,
    [projectId],
  );
}

/** Projekt testu / wariantu (do sprawdzania dostępu w trasach API). */
export async function projectOfTest(testId: string) {
  return (await one<{ project_id: string }>("SELECT project_id FROM ad_tests WHERE id = $1", [testId]))?.project_id ?? null;
}
export async function testOfVariant(variantId: string) {
  return one<{ test_id: string; project_id: string }>(
    `SELECT r.test_id, t.project_id FROM ad_test_variants v JOIN ad_test_rounds r ON r.id = v.round_id JOIN ad_tests t ON t.id = r.test_id WHERE v.id = $1`,
    [variantId],
  );
}

export { budgetPerVariant };
