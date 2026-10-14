// Serwer MCP aplikacji: narzędzia, którymi asystent AI (np. Claude) czyta i uzupełnia dane – klienci, projekty,
// przewodnik „Zbuduj ze mną”, mapy lejków, metryki, dane ręczne, ustawienia, oś czasu, integracje i import danych.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { newId, newKey, one, q } from "../db";
import { CATALOG, MANUAL_METRICS, type Category } from "../catalog";
import { matchesPage, TOTAL_LABELS } from "../analysis";
import { evaluate } from "../formula";
import { runFunnelAnalysis, defaultRange } from "../funnel-analysis";
import { STRATEGY_TEMPLATES } from "../templates";
import {
  BUILDERS, METRIC_PRESETS, MODELS, ROLES, SALES, SOURCES, STEPS, hostOf, pathOf, scriptTag, utmLink, type PageRole, type SetupState,
} from "../setup";
import { setupCheck } from "../setup-check";
import { buildFunnelFromSetup } from "../setup-funnel";
import { applyGraphEdits, describeGraph, type Graph } from "../graph-edit";
import { loadSettings } from "../project-data";
import { mergeSettings } from "../settings";
import { economicsReport } from "../economics-report";
import { runSync } from "../sync/run";
import { upsertAdRows, upsertOrders } from "../import-store";
import { hashEmailSync } from "../sync/woo";
import type { AdRow } from "../importing";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const parse = <T,>(v: unknown, fallback: T): T => (typeof v === "string" ? JSON.parse(v) : (v as T) ?? fallback);

type Result = { content: { type: "text"; text: string }[]; isError?: boolean };
const ok = (data: unknown): Result => ({ content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 1) }] });
const fail = (msg: string): Result => ({ content: [{ type: "text", text: msg }], isError: true });
function safe<A>(fn: (a: A) => Promise<Result>) {
  return async (a: A): Promise<Result> => {
    try {
      return await fn(a);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  };
}

async function project(id: string) {
  const p = await one<{ id: string; name: string; domain: string; tracking_key: string; client_id: string; setup: unknown; webhook_secret: string | null }>(
    "SELECT id, name, domain, tracking_key, client_id, setup, webhook_secret FROM projects WHERE id = $1",
    [id],
  );
  if (!p) throw new Error(`Nie znaleziono projektu ${id}`);
  return { ...p, setup: parse<SetupState>(p.setup, {}) };
}

async function funnel(id: string) {
  const f = await one<{ id: string; project_id: string; name: string; graph: unknown }>("SELECT id, project_id, name, graph FROM funnels WHERE id = $1", [id]);
  if (!f) throw new Error(`Nie znaleziono lejka ${id}`);
  const g = parse<Graph>(f.graph, { nodes: [], edges: [] });
  return { ...f, graph: { nodes: g.nodes ?? [], edges: g.edges ?? [], meta: g.meta ?? {} } as Graph };
}

const INSTRUCTIONS = `Aplikacja „Analityka” – mapy i analityka lejków marketingowych. Struktura: klient → projekt (jeden skrypt śledzący) → lejki (mapy).
Zasady:
- Zanim coś zmienisz, odczytaj stan (list_clients, get_project, get_funnel). Nie zgaduj identyfikatorów.
- Konfigurację nowego projektu najlepiej robić przewodnikiem: get_setup_options → update_setup → check_setup → build_funnel_from_setup.
- Adresy stron wpisuj prawdziwe, podane przez użytkownika – nie wymyślaj ich.
- Rzeczy poza aplikacją (wklejenie skryptu na stronę, token Meta, klucze WooCommerce) robi użytkownik – podaj mu dokładne instrukcje (są w get_project / check_setup).
- Jeśli użytkownik ma otwartą mapę w przeglądarce podczas edit_funnel, poproś o odświeżenie strony – inaczej jego edytor może nadpisać zmiany.
- Kwoty w złotych; daty RRRR-MM-DD.`;

export function buildMcpServer(origin: string): McpServer {
  const server = new McpServer({ name: "analityka", version: "1.0.0" }, { instructions: INSTRUCTIONS });
  const RO = { readOnlyHint: true, openWorldHint: false } as const;
  const WR = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

  /* ---------- Klienci i projekty ---------- */
  server.registerTool(
    "list_clients",
    { title: "Lista klientów i projektów", description: "Wszyscy klienci z projektami (id, nazwa, domena, liczba lejków).", annotations: RO },
    safe(async () => {
      const clients = await q<{ id: string; name: string }>("SELECT id, name FROM clients ORDER BY created_at");
      const projects = await q<{ id: string; client_id: string; name: string; domain: string; funnels: string; setup: unknown }>(
        `SELECT p.id, p.client_id, p.name, p.domain, p.setup, (SELECT count(*) FROM funnels f WHERE f.project_id = p.id) AS funnels
         FROM projects p ORDER BY p.created_at`,
      );
      return ok(
        clients.map((c) => ({
          ...c,
          projects: projects
            .filter((p) => p.client_id === c.id)
            .map((p) => {
              const s = parse<SetupState>(p.setup, {});
              return { id: p.id, name: p.name, domain: p.domain, funnels: Number(p.funnels), guide: s.mode ?? "nie wybrano", guide_step: s.step ?? null, guide_done: !!s.done };
            }),
        })),
      );
    }),
  );

  server.registerTool(
    "create_client",
    { title: "Nowy klient", description: "Tworzy klienta (firmę).", inputSchema: { name: z.string().min(1), notes: z.string().optional() }, annotations: WR },
    safe(async ({ name, notes }) => ok(await one("INSERT INTO clients (id, name, notes) VALUES ($1, $2, $3) RETURNING id, name", [newId(), name.trim(), notes ?? ""]))),
  );

  server.registerTool(
    "create_project",
    {
      title: "Nowy projekt",
      description: "Tworzy projekt klienta (jedno miejsce zbierania danych, zwykle domena/oferta). Zwraca skrypt śledzący do wklejenia na strony.",
      inputSchema: { client_id: z.string(), name: z.string().min(1), domain: z.string().optional() },
      annotations: WR,
    },
    safe(async ({ client_id, name, domain }) => {
      const c = await one("SELECT id FROM clients WHERE id = $1", [client_id]);
      if (!c) return fail("Nie ma takiego klienta – sprawdź list_clients.");
      const p = await one<{ id: string; tracking_key: string }>(
        "INSERT INTO projects (id, client_id, name, domain, tracking_key) VALUES ($1, $2, $3, $4, $5) RETURNING id, tracking_key",
        [newId(), client_id, name.trim(), (domain ?? "").trim(), newKey()],
      );
      return ok({ project_id: p!.id, script: scriptTag(origin, p!.tracking_key, []), app_url: `${origin}/projects/${p!.id}` });
    }),
  );

  server.registerTool(
    "get_project",
    {
      title: "Szczegóły projektu",
      description: "Projekt: skrypt śledzący, adres webhooka, stan przewodnika, lejki i połączenia API (bez kluczy).",
      inputSchema: { project_id: z.string() },
      annotations: RO,
    },
    safe(async ({ project_id }) => {
      const p = await project(project_id);
      const funnels = await q("SELECT id, name, updated_at FROM funnels WHERE project_id = $1 ORDER BY created_at", [project_id]);
      const integrations = await q(
        "SELECT id, provider, name, status, last_sync_at, last_error, enabled FROM integrations WHERE project_id = $1 ORDER BY created_at",
        [project_id],
      );
      const hosts = [...new Set((p.setup.pages ?? []).map((x) => hostOf(x.url)).filter(Boolean))];
      return ok({
        id: p.id,
        name: p.name,
        domain: p.domain,
        app_url: `${origin}/projects/${p.id}`,
        script: scriptTag(origin, p.tracking_key, hosts),
        webhook_url: p.webhook_secret ? `${origin}/api/hooks/${p.webhook_secret}` : "nie wygenerowano – zakładka „Skrypt i integracje” w aplikacji",
        guide: p.setup,
        funnels,
        integrations,
      });
    }),
  );

  /* ---------- Przewodnik „Zbuduj ze mną” ---------- */
  server.registerTool(
    "get_setup_options",
    {
      title: "Opcje przewodnika",
      description: "Dozwolone wartości dla update_setup: modele sprzedaży (z sugerowanymi stronami), rodzaje stron, źródła ruchu, narzędzia do stron, płatności, kroki i proponowane metryki.",
      annotations: RO,
    },
    safe(async () =>
      ok({
        steps: STEPS.map((s) => s.key),
        models: MODELS.map((m) => ({ id: m.id, label: m.label, suggested_pages: m.pages.map(([name, role, example]) => ({ name, role, example_path: example })) })),
        page_roles: ROLES.map((r) => ({ value: r.value, label: r.label, help: r.help })),
        sources: SOURCES.map((s) => ({ id: s.id, label: s.label, paid: s.paid, utm_source: s.utmSource ?? null })),
        builders: BUILDERS.map((b) => ({ id: b.id, label: b.label })),
        sales: SALES,
        metric_presets: METRIC_PRESETS.map((m) => ({ id: m.id, name: m.name, formula: m.formula, format: m.format })),
      }),
    ),
  );

  server.registerTool(
    "update_setup",
    {
      title: "Uzupełnij przewodnik",
      description:
        "Zapisuje odpowiedzi przewodnika „Zbuduj ze mną” w projekcie (użytkownik zobaczy je w aplikacji). Pola pominięte zostają bez zmian. pages zastępuje całą listę stron (kolejność = kolejność w lejku).",
      inputSchema: {
        project_id: z.string(),
        offer: z.string().optional().describe("Co sprzedaje klient"),
        model: z.string().optional().describe("id modelu z get_setup_options"),
        builder: z.string().optional(),
        sales: z.string().optional(),
        sources: z.array(z.string()).optional(),
        pages: z
          .array(z.object({ name: z.string(), url: z.string().describe("Pełny adres strony lub ścieżka; * na końcu = wszystko, co się tak zaczyna"), role: z.string() }))
          .optional(),
        campaign_hint: z.string().optional().describe("Fragment nazwy kampanii Meta/Google tego lejka (puste = wszystkie)"),
        step: z.string().optional().describe("Krok, na którym użytkownik ma otworzyć przewodnik"),
      },
      annotations: WR,
    },
    safe(async (a) => {
      await project(a.project_id);
      const patch: SetupState = { mode: "guided", hidden: false };
      const check = (v: string | undefined, list: { id?: string; value?: string }[], what: string) => {
        if (v !== undefined && !list.some((x) => (x.id ?? x.value) === v)) throw new Error(`Nieznana wartość ${what}: „${v}” – sprawdź get_setup_options`);
      };
      check(a.model, MODELS, "model");
      check(a.builder, BUILDERS, "builder");
      check(a.sales, SALES, "sales");
      check(a.step, STEPS.map((s) => ({ id: s.key })), "step");
      for (const s of a.sources ?? []) check(s, SOURCES, "sources");
      for (const p of a.pages ?? []) check(p.role, ROLES, "role");
      if (a.offer !== undefined) patch.offer = a.offer;
      if (a.model !== undefined) patch.model = a.model;
      if (a.builder !== undefined) patch.builder = a.builder;
      if (a.sales !== undefined) patch.sales = a.sales;
      if (a.sources !== undefined) patch.sources = a.sources;
      if (a.campaign_hint !== undefined) patch.campaignHint = a.campaign_hint;
      if (a.step !== undefined) patch.step = a.step;
      if (a.pages !== undefined)
        patch.pages = a.pages.map((p) => ({ id: Math.random().toString(36).slice(2, 9), name: p.name, url: p.url, role: p.role as PageRole }));
      const row = await one<{ setup: unknown }>("UPDATE projects SET setup = setup || $2::jsonb WHERE id = $1 RETURNING setup", [a.project_id, JSON.stringify(patch)]);
      return ok({ saved: parse<SetupState>(row!.setup, {}), open_in_app: `${origin}/projects/${a.project_id}?tab=start` });
    }),
  );

  server.registerTool(
    "check_setup",
    {
      title: "Sprawdź, co działa",
      description:
        "Stan na żywo: na których stronach działa skrypt, które źródła (linki UTM) już dają wejścia, czy docierają zapisy, zakupy i koszty reklam, czy jest mapa. Zawiera gotowe linki UTM dla wybranych źródeł.",
      inputSchema: { project_id: z.string() },
      annotations: RO,
    },
    safe(async ({ project_id }) => {
      const p = await project(project_id);
      const c = await setupCheck(project_id);
      const pages = p.setup.pages ?? [];
      const firstFull = pages.find((x) => /^https?:\/\//i.test(x.url) && !x.url.includes("*"))?.url ?? "";
      const sources = (p.setup.sources ?? []).map((id) => SOURCES.find((s) => s.id === id)).filter((s): s is NonNullable<typeof s> => !!s);
      return ok({
        events_total: c.events,
        last_event: c.lastEvent,
        pages: pages.map((pg) => {
          const pat = pathOf(pg.url);
          const seen = c.paths.find((x) => matchesPage(pat, { url: x.url, path: x.path }));
          const forms = pg.role === "lead" ? c.forms.find((x) => matchesPage(pat, { url: "", path: x.path })) : undefined;
          return { name: pg.name, url: pg.url, role: pg.role, script_works: !!seen, last_visit: seen?.last ?? null, ...(pg.role === "lead" ? { form_submits: forms?.n ?? 0 } : {}) };
        }),
        unmatched_paths_seen: c.paths.filter((x) => !pages.some((pg) => matchesPage(pathOf(pg.url), { url: x.url, path: x.path }))).slice(0, 20).map((x) => x.url),
        sources: sources.map((s) => {
          const seen = s.utmSource ? c.utm.find((u) => u.source === s.utmSource) : undefined;
          return {
            id: s.id,
            label: s.label,
            people_seen: seen?.n ?? 0,
            where_to_paste: s.where,
            ...(s.adParams ? { ad_url_parameters: s.adParams } : s.utmSource && firstFull ? { link: utmLink(firstFull, s) } : {}),
          };
        }),
        purchases: c.purchases,
        orders: c.orders,
        ad_rows: c.ads,
        integrations: c.integrations,
        funnel_id: p.setup.funnelId ?? null,
      });
    }),
  );

  server.registerTool(
    "build_funnel_from_setup",
    {
      title: "Zbuduj mapę z przewodnika",
      description: "Tworzy mapę lejka z odpowiedzi przewodnika (źródła → strony → zapis/zakup). Jeśli przewodnik już zbudował mapę, NADPISUJE ją.",
      inputSchema: { project_id: z.string(), name: z.string().optional() },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    safe(async ({ project_id, name }) => {
      const r = await buildFunnelFromSetup(project_id, name);
      return ok({ ...r, map_url: `${origin}/funnels/${r.funnelId}` });
    }),
  );

  /* ---------- Mapy lejków ---------- */
  server.registerTool(
    "get_catalog",
    {
      title: "Katalog elementów mapy",
      description: "Rodzaje elementów do edit_funnel (kind): źródła, strony, akcje, offline. Filtr po kategorii lub tekście.",
      inputSchema: { category: z.enum(["source", "page", "action", "offline"]).optional(), query: z.string().optional() },
      annotations: RO,
    },
    safe(async ({ category, query }) => {
      const qx = (query ?? "").toLowerCase();
      return ok(
        CATALOG.filter((c) => (!category || c.category === category) && (!qx || c.label.toLowerCase().includes(qx) || c.kind.includes(qx) || c.group.toLowerCase().includes(qx))).map(
          (c) => ({ kind: c.kind, label: c.label, category: c.category, group: c.group, ...(c.defaults ?? {}) }),
        ),
      );
    }),
  );

  server.registerTool(
    "create_funnel",
    {
      title: "Nowy lejek",
      description: `Tworzy pusty lejek albo z szablonu. Szablony: ${STRATEGY_TEMPLATES.map((t) => `${t.key} (${t.name})`).join(", ")}.`,
      inputSchema: { project_id: z.string(), name: z.string().min(1), template: z.string().optional() },
      annotations: WR,
    },
    safe(async ({ project_id, name, template }) => {
      await project(project_id);
      const t = template ? STRATEGY_TEMPLATES.find((x) => x.key === template) : undefined;
      if (template && !t) return fail(`Nie ma szablonu „${template}”.`);
      const graph = t ? { ...t.build(), meta: {} } : { nodes: [], edges: [], meta: {} };
      const id = newId();
      await one("INSERT INTO funnels (id, project_id, name, graph) VALUES ($1, $2, $3, $4::jsonb) RETURNING id", [id, project_id, name.trim(), JSON.stringify(graph)]);
      return ok({ funnel_id: id, nodes: graph.nodes.length, map_url: `${origin}/funnels/${id}` });
    }),
  );

  server.registerTool(
    "get_funnel",
    {
      title: "Mapa lejka",
      description: "Węzły (id, rodzaj, nazwa, adres, dopasowania, cele, notatki), strzałki, notatki i checklista lejka oraz własne metryki.",
      inputSchema: { funnel_id: z.string() },
      annotations: RO,
    },
    safe(async ({ funnel_id }) => {
      const f = await funnel(funnel_id);
      const metrics = await q("SELECT id, name, formula, format FROM custom_metrics WHERE funnel_id = $1 ORDER BY created_at", [funnel_id]);
      return ok({ id: f.id, name: f.name, project_id: f.project_id, map_url: `${origin}/funnels/${f.id}`, ...describeGraph(f.graph), meta: f.graph.meta, metrics });
    }),
  );

  const nodeFields = {
    label: z.string().optional(),
    url: z.string().optional().describe("Strona: ścieżka „/zapis” (dokładnie), „/blog/*” (prefiks) lub fragment adresu"),
    urls: z.array(z.string()).optional(),
    source_match: z.string().optional().describe("Źródło: wartości utm_source/domeny po przecinku, * = wszystko, (direct) = bezpośrednie"),
    ads_match: z.string().optional().describe("Źródło: koszty z importu reklam, np. meta:*, google:webinar"),
    event_type: z.string().optional().describe("Akcja: lead, form_submit, purchase, click, link_click, button_click, scroll, video_play, custom…"),
    event_name: z.string().optional(),
    page_url: z.string().optional().describe("Akcja: tylko na tej stronie"),
    filters: z.array(z.object({ key: z.string(), op: z.enum(["eq", "neq", "contains", "not_contains", "empty", "not_empty"]), value: z.string() })).optional(),
    goal: z.boolean().optional(),
    goal_name: z.string().optional(),
    goal_value: z.number().optional(),
    notes: z.string().optional(),
    checklist: z.array(z.string()).optional(),
    x: z.number().optional(),
    y: z.number().optional(),
  };

  server.registerTool(
    "edit_funnel",
    {
      title: "Edytuj mapę lejka",
      description:
        "Zmienia mapę operacjami: add_nodes (kind z get_catalog, opcjonalny ref do użycia w add_edges), update_nodes, remove_nodes, add_edges (source/target = id lub ref), remove_edges, notes (notatki lejka). Wszystko albo nic. Poproś użytkownika o odświeżenie otwartej mapy.",
      inputSchema: {
        funnel_id: z.string(),
        add_nodes: z.array(z.object({ ref: z.string().optional(), kind: z.string(), ...nodeFields })).optional(),
        update_nodes: z.array(z.object({ id: z.string(), ...nodeFields })).optional(),
        remove_nodes: z.array(z.string()).optional(),
        add_edges: z.array(z.object({ source: z.string(), target: z.string(), connection: z.enum(["direct", "indirect", "none"]).optional() })).optional(),
        remove_edges: z.array(z.string()).optional(),
        notes: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
    },
    safe(async ({ funnel_id, notes, ...edits }) => {
      const f = await funnel(funnel_id);
      const { graph, ids, summary } = applyGraphEdits(f.graph, edits);
      if (notes !== undefined) graph.meta = { ...(graph.meta ?? {}), notes };
      await one("UPDATE funnels SET graph = $2::jsonb, updated_at = now() WHERE id = $1 RETURNING id", [funnel_id, JSON.stringify(graph)]);
      return ok({ summary, new_node_ids: ids, map_url: `${origin}/funnels/${funnel_id}` });
    }),
  );

  server.registerTool(
    "get_funnel_analysis",
    {
      title: "Liczby lejka",
      description: "Analiza za okres: sumy (przychód, wydatki, ROAS, CPL…), osoby na każdym węźle, przejścia na strzałkach, własne metryki. Domyślnie ostatnie 30 dni, tryb „traffic”.",
      inputSchema: { funnel_id: z.string(), from: z.string().optional(), to: z.string().optional(), mode: z.enum(["traffic", "funnel"]).optional() },
      annotations: RO,
    },
    safe(async ({ funnel_id, from, to, mode }) => {
      const r0 = defaultRange();
      const f0 = from ?? r0.from;
      const t0 = to ?? r0.to;
      if (!DAY.test(f0) || !DAY.test(t0)) return fail("Daty w formacie RRRR-MM-DD");
      const f = await funnel(funnel_id);
      const r = await runFunnelAnalysis(funnel_id, f0, t0, mode ?? "traffic");
      if (!r) return fail("Nie znaleziono lejka");
      const label = new Map(f.graph.nodes.map((n) => [n.id, n.data?.label ?? n.id]));
      return ok({
        range: { from: f0, to: t0 },
        mode: r.mode,
        events: r.eventCount,
        truncated: r.truncated,
        totals: Object.fromEntries(Object.entries(r.totals).map(([k, v]) => [TOTAL_LABELS[k as keyof typeof TOTAL_LABELS]?.label ?? k, v])),
        nodes: Object.entries(r.nodes).map(([id, s]) => ({ id, label: label.get(id), ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== null && v !== undefined)) })),
        edges: Object.entries(r.edges).map(([id, s]) => {
          const e = f.graph.edges.find((x) => x.id === id);
          return { from: e ? label.get(e.source) : null, to: e ? label.get(e.target) : null, ...s };
        }),
        custom_metrics: r.custom.map((m) => ({ name: m.name, value: m.value, error: m.error })),
        top_countries: r.countries,
      });
    }),
  );

  server.registerTool(
    "add_metric",
    {
      title: "Dodaj metrykę",
      description: `Własna metryka lejka ze wzoru. Zmienne: ${Object.keys(TOTAL_LABELS).join(", ")}; funkcje node("Nazwa węzła","people"), edge("A","B"), min, max, round.`,
      inputSchema: { funnel_id: z.string(), name: z.string().min(1), formula: z.string().min(1), format: z.enum(["number", "percent", "money", "ratio"]).optional() },
      annotations: WR,
    },
    safe(async ({ funnel_id, name, formula, format }) => {
      await funnel(funnel_id);
      const vars = Object.fromEntries(Object.keys(TOTAL_LABELS).map((k) => [k, 1]));
      try {
        evaluate(formula, { vars, node: () => 1, edge: () => 1 });
      } catch (e) {
        return fail(`Błąd we wzorze: ${e instanceof Error ? e.message : e}`);
      }
      return ok(
        await one("INSERT INTO custom_metrics (id, funnel_id, name, formula, format) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, formula, format", [
          newId(), funnel_id, name.trim(), formula.trim(), format ?? "number",
        ]),
      );
    }),
  );

  server.registerTool(
    "add_manual_data",
    {
      title: "Dane ręczne na węźle",
      description: "Wpisuje dane spoza skryptu na węzeł za dany dzień (np. wydatki, wyświetlenia, kliknięcia reklamy, odtworzenia 3 s, nadpisanie liczby osób). Metryki zależą od kategorii węzła.",
      inputSchema: { funnel_id: z.string(), node_id: z.string(), day: z.string(), metric: z.string(), value: z.number() },
      annotations: WR,
    },
    safe(async ({ funnel_id, node_id, day, metric, value }) => {
      const f = await funnel(funnel_id);
      const n = f.graph.nodes.find((x) => x.id === node_id);
      if (!n) return fail("Nie ma takiego węzła – sprawdź get_funnel.");
      const allowed = MANUAL_METRICS[n.data.category as Category] ?? [];
      if (!allowed.some((m) => m.key === metric)) return fail(`Dla tego węzła dozwolone: ${allowed.map((m) => `${m.key} (${m.label})`).join(", ")}`);
      if (!DAY.test(day)) return fail("Data w formacie RRRR-MM-DD");
      return ok(await one("INSERT INTO manual_data (id, funnel_id, node_id, day, metric, value) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id", [newId(), funnel_id, node_id, day, metric, value]));
    }),
  );

  /* ---------- Ustawienia, oś czasu, ekonomia ---------- */
  server.registerTool(
    "get_settings",
    { title: "Ustawienia klienta", description: "Waluta, VAT, produkt główny, reguły kategorii/kampanii/kątów, okresy, koszty.", inputSchema: { project_id: z.string() }, annotations: RO },
    safe(async ({ project_id }) => ok(await loadSettings(project_id))),
  );

  server.registerTool(
    "update_settings",
    {
      title: "Zmień ustawienia klienta",
      description: "Scalanie z obecnymi ustawieniami (podaj tylko zmieniane pola, np. {\"vat\": 8} albo {\"periods\": [{\"name\":\"Q1\",\"from\":\"2026-01-01\",\"to\":\"2026-03-31\"}]}). Tablice zastępują całe listy.",
      inputSchema: { project_id: z.string(), settings: z.record(z.string(), z.unknown()) },
      annotations: WR,
    },
    safe(async ({ project_id, settings }) => {
      await project(project_id);
      const merged = mergeSettings({ ...(await loadSettings(project_id)), ...settings });
      await one(
        `INSERT INTO project_settings (project_id, settings, updated_at) VALUES ($1, $2::jsonb, now())
         ON CONFLICT (project_id) DO UPDATE SET settings = EXCLUDED.settings, updated_at = now() RETURNING project_id`,
        [project_id, JSON.stringify(merged)],
      );
      return ok(merged);
    }),
  );

  server.registerTool(
    "add_timeline_event",
    {
      title: "Wpis na osi czasu",
      description: "Zdarzenie na osi czasu projektu (zmiana ceny, start kampanii, nowa strona, decyzja). confidence: data (z danych), email, memory (z pamięci), gap (luka).",
      inputSchema: {
        project_id: z.string(),
        day: z.string(),
        title: z.string().min(1),
        type: z.string().optional(),
        description: z.string().optional(),
        link: z.string().optional(),
        confidence: z.enum(["data", "email", "memory", "gap"]).optional(),
      },
      annotations: WR,
    },
    safe(async (a) => {
      await project(a.project_id);
      if (!DAY.test(a.day)) return fail("Data w formacie RRRR-MM-DD");
      return ok(
        await one(
          `INSERT INTO timeline_events (id, project_id, day, type, title, description, source, link, confidence)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
          [newId(), a.project_id, a.day, (a.type ?? "decyzja").slice(0, 40), a.title.slice(0, 300), (a.description ?? "").slice(0, 4000), "asystent AI", (a.link ?? "").slice(0, 1000), a.confidence ?? "memory"],
        ),
      );
    }),
  );

  server.registerTool(
    "get_economics",
    {
      title: "Ekonomia projektu",
      description: "Przychód vs wydatki miesięcznie i okresy: CAC, LTV 30/90/365, LTV/CAC, powroty, zysk – z importu zamówień i reklam.",
      inputSchema: { project_id: z.string(), from: z.string().optional(), to: z.string().optional() },
      annotations: RO,
    },
    safe(async ({ project_id, from, to }) => ok(await economicsReport(project_id, from, to))),
  );

  /* ---------- Integracje i import ---------- */
  server.registerTool(
    "sync_integrations",
    {
      title: "Synchronizuj Meta / WooCommerce",
      description: "Uruchamia synchronizację połączeń API projektu (wszystkich albo jednego). Połączenia (tokeny/klucze) zakłada użytkownik w aplikacji.",
      inputSchema: { project_id: z.string(), integration_id: z.string().optional() },
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    safe(async ({ project_id, integration_id }) => {
      const list = await q<{ id: string; name: string }>(
        `SELECT id, name FROM integrations WHERE project_id = $1 ${integration_id ? "AND id = $2" : ""} ORDER BY created_at`,
        integration_id ? [project_id, integration_id] : [project_id],
      );
      if (!list.length) return fail("Brak połączeń – użytkownik dodaje je w aplikacji: projekt → Skrypt i integracje → Połączenia API.");
      const out = [];
      for (const it of list) {
        try {
          out.push({ name: it.name, ...(await runSync(it.id)) });
        } catch (e) {
          out.push({ name: it.name, error: e instanceof Error ? e.message : String(e) });
        }
      }
      return ok(out);
    }),
  );

  server.registerTool(
    "import_ad_rows",
    {
      title: "Import danych reklam",
      description: "Zapisuje wiersze reklam (np. z pliku od użytkownika). Ten sam okres + kampania + zestaw + reklama = nadpisanie. source: meta, google_ads albo ads_other.",
      inputSchema: {
        project_id: z.string(),
        source: z.enum(["meta", "google_ads", "ads_other"]),
        label: z.string().optional().describe("Nazwa importu widoczna w zakładce Dane"),
        rows: z
          .array(
            z.object({
              period_start: z.string(),
              period_end: z.string().optional(),
              campaign: z.string().optional(),
              adset: z.string().optional(),
              ad: z.string().optional(),
              spend: z.number(),
              impressions: z.number().optional(),
              reach: z.number().optional(),
              clicks: z.number().optional(),
              video_3s: z.number().optional(),
              thruplay: z.number().optional(),
              landing_views: z.number().optional(),
              registrations: z.number().optional(),
              purchases: z.number().optional(),
              purchase_value: z.number().optional(),
            }),
          )
          .min(1)
          .max(5000),
      },
      annotations: WR,
    },
    safe(async ({ project_id, source, label, rows }) => {
      await project(project_id);
      for (const r of rows) if (!DAY.test(r.period_start) || (r.period_end && !DAY.test(r.period_end))) return fail(`Zła data w wierszu: ${r.period_start}`);
      const importId = newId();
      await one("INSERT INTO imports (id, project_id, kind, source, filename) VALUES ($1, $2, 'ads', $3, $4) RETURNING id", [importId, project_id, source, (label ?? "Import od asystenta AI").slice(0, 200)]);
      const ad: AdRow[] = rows.map((r) => ({
        period_start: r.period_start, period_end: r.period_end ?? r.period_start, campaign: r.campaign ?? "", adset: r.adset ?? "", ad: r.ad ?? "",
        spend: r.spend, impressions: r.impressions ?? 0, reach: r.reach ?? 0, clicks: r.clicks ?? 0, video_3s: r.video_3s ?? 0, thruplay: r.thruplay ?? 0,
        landing_views: r.landing_views ?? 0, registrations: r.registrations ?? 0, add_to_cart: 0, checkouts: 0, purchases: r.purchases ?? 0,
        purchase_value: r.purchase_value ?? 0, title: "", body: "",
      }));
      await upsertAdRows(project_id, importId, ad);
      await q("UPDATE imports SET rows = (SELECT count(*) FROM ad_rows WHERE import_id = $1) WHERE id = $1", [importId]);
      return ok({ import_id: importId, rows: ad.length });
    }),
  );

  server.registerTool(
    "import_orders",
    {
      title: "Import zamówień",
      description: "Zapisuje opłacone zamówienia (do Ekonomii). E-mail zamieniany na skrót – nie jest zapisywany. Ten sam sklep (source) + numer = nadpisanie.",
      inputSchema: {
        project_id: z.string(),
        source: z.string().min(1).describe("Nazwa sklepu/systemu, np. woocommerce, publigo, stripe"),
        label: z.string().optional(),
        rows: z
          .array(
            z.object({
              order_ref: z.string(),
              ts: z.string().describe("Data lub data z godziną (ISO)"),
              email: z.string().optional(),
              gross: z.number().describe("Kwota brutto zamówienia"),
              products: z.array(z.object({ name: z.string(), price: z.number().nullable().optional() })).optional(),
              coupon: z.string().optional(),
            }),
          )
          .min(1)
          .max(5000),
      },
      annotations: WR,
    },
    safe(async ({ project_id, source, label, rows }) => {
      await project(project_id);
      for (const r of rows) if (Number.isNaN(Date.parse(r.ts))) return fail(`Zła data zamówienia ${r.order_ref}: ${r.ts}`);
      const importId = newId();
      await one("INSERT INTO imports (id, project_id, kind, source, filename) VALUES ($1, $2, 'orders', $3, $4) RETURNING id", [importId, project_id, source.slice(0, 100), (label ?? "Import od asystenta AI").slice(0, 200)]);
      await upsertOrders(
        project_id,
        importId,
        source,
        rows.map((r) => ({
          order_ref: r.order_ref, ts: new Date(r.ts).toISOString(), customer: hashEmailSync(r.email ?? ""), gross: r.gross,
          products: (r.products ?? []).map((p) => ({ name: p.name, price: p.price ?? null })), coupon: r.coupon ?? "",
        })),
      );
      await q("UPDATE imports SET rows = (SELECT count(*) FROM orders WHERE import_id = $1) WHERE id = $1", [importId]);
      return ok({ import_id: importId, rows: rows.length });
    }),
  );

  return server;
}

