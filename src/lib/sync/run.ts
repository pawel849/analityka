// Synchronizacja integracji API. Każde uruchomienie ma limit czasu – duże historie pobierają się
// w kilku uruchomieniach (stan „cursor” w integrations.state), dalej codziennie tylko ostatnie dni.
import { one, q } from "../db";
import { insertEvents, visitorForEmail } from "../collect";
import { upsertAdRows, upsertOrders, type OrderIn } from "../import-store";
import { unseal } from "../secret-box";
import { META_DEFAULT_VERSION, fetchMetaInsights, metaInsightToAdRow } from "./meta";
import { WOO_DEFAULT_PAID, fetchWooPage, wooOrderRef, wooOrderToRow, type WooOrder } from "./woo";

export type Provider = "meta" | "woocommerce";

export interface IntegrationRow {
  id: string;
  project_id: string;
  provider: Provider;
  name: string;
  config: Record<string, unknown>;
  secret: string;
  /** ev2 = zakupy na mapie mają już nazwy produktów (jednorazowe ponowne pobranie starszych zamówień). */
  state: { cursor?: string; done?: boolean; lastOkStart?: string; ev2?: boolean };
  last_sync_at: string | null;
}

export interface SyncResult {
  complete: boolean;
  range?: { from: string; to: string };
  rows?: number;
  removed?: number;
  events?: number;
  warnings: string[];
  actionTypes?: string[];
}

const BUDGET_MS = 25_000;
const day = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, k: number) => day(new Date(Date.parse(`${s}T00:00:00Z`) + k * 86400_000));
const parse = (v: unknown) => (typeof v === "string" ? JSON.parse(v) : v ?? {});

export async function loadIntegration(id: string): Promise<IntegrationRow | null> {
  const r = await one<IntegrationRow>("SELECT id, project_id, provider, name, config, secret, state, last_sync_at FROM integrations WHERE id = $1", [id]);
  return r ? { ...r, config: parse(r.config), state: parse(r.state) } : null;
}

/** Wpis importu, do którego trafiają dane z tej integracji (widoczny w zakładce Dane). */
async function ensureImport(it: IntegrationRow, kind: "ads" | "orders"): Promise<string> {
  const importId = `api-${it.id}`;
  await q(
    `INSERT INTO imports (id, project_id, kind, source, filename) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET filename = EXCLUDED.filename`,
    [importId, it.project_id, kind, it.provider === "meta" ? "meta_api" : "woocommerce", `API: ${it.name}`.slice(0, 200)],
  );
  return importId;
}

async function refreshImportCount(importId: string, table: "ad_rows" | "orders") {
  await q(`UPDATE imports SET rows = (SELECT count(*) FROM ${table} WHERE import_id = $1) WHERE id = $1`, [importId]);
}

export async function runSync(id: string, budgetMs = BUDGET_MS): Promise<SyncResult> {
  const it = await loadIntegration(id);
  if (!it) throw new Error("Nie znaleziono integracji");
  const startedAt = new Date().toISOString();
  await q("UPDATE integrations SET status = 'running' WHERE id = $1", [id]);
  try {
    const result = it.provider === "meta" ? await syncMeta(it, startedAt, budgetMs) : await syncWoo(it, startedAt, budgetMs);
    await q(
      `UPDATE integrations SET status = $2, last_sync_at = now(), last_error = '', last_result = $3::jsonb, state = $4::jsonb WHERE id = $1`,
      [id, result.complete ? "ok" : "partial", JSON.stringify(result), JSON.stringify(it.state)],
    );
    return result;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await q("UPDATE integrations SET status = 'error', last_sync_at = now(), last_error = $2, state = $3::jsonb WHERE id = $1", [id, msg.slice(0, 1000), JSON.stringify(it.state)]);
    throw e;
  }
}

/** Zakres do pobrania: pierwsza synchronizacja = ostatnie N dni (kawałkami), potem ostatnie 7 dni (Meta poprawia dane wstecz). */
function startDate(it: IntegrationRow, today: string, refreshDays: number): string {
  const days = Math.min(Math.max(Number(it.config.days) || 90, 1), 1095);
  if (!it.state.done) return it.state.cursor ?? addDays(today, -(days - 1));
  const last = it.state.lastOkStart ? it.state.lastOkStart.slice(0, 10) : today;
  const a = addDays(last, -3);
  const b = addDays(today, -refreshDays);
  return a < b ? a : b;
}

async function syncMeta(it: IntegrationRow, startedAt: string, budgetMs: number): Promise<SyncResult> {
  const t0 = Date.now();
  const token = unseal(it.secret);
  const accountId = String(it.config.accountId ?? "");
  const version = String(it.config.version || META_DEFAULT_VERSION);
  const today = day(new Date());
  const from = startDate(it, today, 7);
  const importId = await ensureImport(it, "ads");
  const warnings: string[] = [];
  const types = new Set<string>();
  let rows = 0;
  let cursor = from;
  let complete = true;
  // Okna po 15 dni – mniejsze odpowiedzi Meta i postęp zapisywany po każdym oknie.
  while (cursor <= today) {
    if (Date.now() - t0 > budgetMs) {
      complete = false;
      break;
    }
    const until = addDays(cursor, 14) < today ? addDays(cursor, 14) : today;
    const res = await fetchMetaInsights({ accountId, token, version, since: cursor, until });
    const adRows = res.rows.map(metaInsightToAdRow);
    await upsertAdRows(it.project_id, importId, adRows);
    rows += adRows.length;
    res.actionTypes.forEach((t) => types.add(t));
    cursor = addDays(until, 1);
    if (!it.state.done) it.state.cursor = cursor;
  }
  if (complete) {
    it.state = { done: true, lastOkStart: startedAt };
  }
  await refreshImportCount(importId, "ad_rows");

  // Ostrzeżenie o podwójnym liczeniu: dane Meta z CSV w tym samym okresie.
  const overlap = await one<{ n: string }>(
    `SELECT count(*) AS n FROM ad_rows a JOIN imports i ON i.id = a.import_id
     WHERE a.project_id = $1 AND i.source = 'meta' AND a.period_end >= $2::date AND a.period_start <= $3::date`,
    [it.project_id, from, today],
  );
  if (Number(overlap?.n ?? 0) > 0)
    warnings.push(`W tym okresie są też dane Meta z importu CSV (${overlap!.n} wierszy) – wydatki policzą się podwójnie. Usuń stary import CSV Meta w zakładce Dane.`);
  if (!complete) warnings.push(`Pobrano dane do ${addDays(cursor, -1)}. Reszta pobierze się przy kolejnej synchronizacji (kliknij ponownie lub poczekaj na automat).`);
  return { complete, range: { from, to: complete ? today : addDays(cursor, -1) }, rows, warnings, actionTypes: [...types].sort() };
}

async function syncWoo(it: IntegrationRow, startedAt: string, budgetMs: number): Promise<SyncResult> {
  const t0 = Date.now();
  const [key, secret] = unseal(it.secret).split("\n");
  const site = String(it.config.site ?? "");
  const paid = String(it.config.paidStatuses || WOO_DEFAULT_PAID)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const pushEvents = it.config.events !== false;
  const today = day(new Date());
  const importId = await ensureImport(it, "orders");
  const warnings: string[] = [];

  // Pierwsza synchronizacja: zamówienia utworzone od N dni (after); potem: zmienione od ostatniej synchronizacji (modified_after).
  // Pełne pobranie: pierwsza synchronizacja albo jednorazowo, żeby dopisać nazwy produktów do zakupów na mapie.
  const backfill = !it.state.done || (pushEvents && !it.state.ev2);
  const days = Math.min(Math.max(Number(it.config.days) || 90, 1), 1095);
  const from = backfill
    ? it.state.cursor ?? `${addDays(today, -(days - 1))}T00:00:00`
    : `${addDays((it.state.lastOkStart ?? startedAt).slice(0, 10), -1)}T00:00:00`;
  let rows = 0;
  let removed = 0;
  let events = 0;
  let complete = true;
  let lastCreated = "";
  for (let page = 1; page <= 500; page++) {
    if (Date.now() - t0 > budgetMs) {
      complete = false;
      break;
    }
    const { orders, totalPages } = await fetchWooPage({ site, key, secret, page, ...(backfill ? { after: from } : { modifiedAfter: from }) });
    const keep: OrderIn[] = [];
    const drop: string[] = [];
    for (const o of orders) {
      const row = wooOrderToRow(o, paid);
      if (row) keep.push(row);
      else drop.push(wooOrderRef(o));
      if (o.date_created_gmt) lastCreated = o.date_created_gmt;
    }
    if (keep.length) await upsertOrders(it.project_id, importId, "woocommerce", keep);
    if (drop.length) {
      const del = await q<{ order_ref: string }>(
        "DELETE FROM orders WHERE project_id = $1 AND source = 'woocommerce' AND order_ref = ANY($2) RETURNING order_ref",
        [it.project_id, drop],
      );
      removed += del.length;
    }
    if (pushEvents) events += await syncPurchaseEvents(it.project_id, orders, keep, drop);
    rows += keep.length;
    if (orders.length < 100 || (totalPages != null && page >= totalPages)) break;
  }
  if (complete) it.state = { done: true, lastOkStart: startedAt, ev2: true };
  else if (backfill && lastCreated) it.state.cursor = lastCreated.replace(/Z$/, "");
  else if (!complete) warnings.push("Nie wszystkie zmienione zamówienia zostały pobrane w tym uruchomieniu – kliknij „Synchronizuj teraz” ponownie.");
  await refreshImportCount(importId, "orders");
  if (!complete && backfill) warnings.push(`Pobrano zamówienia do ${lastCreated.slice(0, 10)}. Reszta pobierze się przy kolejnej synchronizacji.`);
  return { complete, range: { from: from.slice(0, 10), to: today }, rows, removed, events, warnings };
}

const eventName = (ref: string) => `Zamówienie WooCommerce #${ref}`;

/** Zakupy na mapie lejka: jedno zdarzenie „purchase” na opłacone zamówienie (bez duplikatów), usuwane po anulowaniu/zwrocie. */
async function syncPurchaseEvents(projectId: string, orders: WooOrder[], keep: OrderIn[], drop: string[]): Promise<number> {
  if (drop.length) {
    await q("DELETE FROM events WHERE project_id = $1 AND origin = 'woocommerce' AND name = ANY($2)", [projectId, drop.map(eventName)]);
  }
  if (!keep.length) return 0;
  const names = keep.map((k) => eventName(k.order_ref));
  const existing = new Set(
    (await q<{ name: string }>("SELECT name FROM events WHERE project_id = $1 AND origin = 'woocommerce' AND name = ANY($2)", [projectId, names])).map((r) => r.name),
  );
  const byRef = new Map(orders.map((o) => [wooOrderRef(o), o]));
  // Nazwy produktów w polu element – węzeł „Zakup” może liczyć tylko wybrane produkty.
  const productsOf = (k: OrderIn) => k.products.map((p) => p.name).join(" | ").slice(0, 1000);
  const old = keep.filter((k) => existing.has(eventName(k.order_ref)));
  if (old.length) {
    await q(
      `UPDATE events e SET element = v.el, value = v.val FROM (SELECT unnest($2::text[]) AS name, unnest($3::text[]) AS el, unnest($4::float8[]) AS val) v
       WHERE e.project_id = $1 AND e.origin = 'woocommerce' AND e.name = v.name`,
      [projectId, old.map((k) => eventName(k.order_ref)), old.map(productsOf), old.map((k) => k.gross)],
    );
  }
  const fresh = [];
  for (const k of keep) {
    const name = eventName(k.order_ref);
    if (existing.has(name)) continue;
    const email = (byRef.get(k.order_ref)?.billing?.email ?? "").trim().toLowerCase();
    const visitor = (email && (await visitorForEmail(projectId, email))) || (email ? `mail:${email}` : `woo:${k.order_ref}`);
    fresh.push({
      type: "purchase",
      name,
      visitor_id: visitor,
      session_id: "",
      url: "",
      path: "",
      referrer: "",
      utm_source: "",
      utm_medium: "",
      utm_campaign: "",
      utm_content: "",
      utm_term: "",
      element: productsOf(k),
      value: k.gross,
      scroll: null,
      email,
      origin: "woocommerce",
      ts: new Date(k.ts),
    });
  }
  await insertEvents(projectId, fresh);
  return fresh.length;
}

/**
 * Wszystkie włączone integracje (dla automatu), w limicie czasu funkcji. Najdawniej synchronizowane idą pierwsze,
 * więc te, które się nie zmieściły, będą pierwsze przy następnym uruchomieniu.
 */
export async function runAllSyncs(totalMs = 55_000): Promise<{ id: string; ok: boolean; error?: string; skipped?: boolean }[]> {
  const t0 = Date.now();
  const list = await q<{ id: string }>("SELECT id FROM integrations WHERE enabled = true ORDER BY last_sync_at NULLS FIRST");
  const out: { id: string; ok: boolean; error?: string; skipped?: boolean }[] = [];
  for (const { id } of list) {
    // Zostawiamy zapas na ostatnie zapytanie i zapis (pojedyncze zapytanie do API ma limit 25 s).
    const left = totalMs - (Date.now() - t0) - 30_000;
    if (left < 3_000) {
      out.push({ id, ok: false, skipped: true });
      continue;
    }
    try {
      await runSync(id, Math.min(BUDGET_MS, left));
      out.push({ id, ok: true });
    } catch (e) {
      out.push({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
