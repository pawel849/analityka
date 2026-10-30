// Prospecting w jednym kroku: Ad Library → wykluczenia → dedupe z bazy → kwalifikacja stron → sortowanie przez model.
// Model sortuje (pasuje / wątpliwe / nie), wszystkie koszyki wracają do asystenta – decyzję podejmuje człowiek.
import { askClaude } from "./claude";
import { one, q } from "./db";
import { groupByPage, pagesHistory, searchAdsLibrary, type AdRecord } from "./meta-ads-library";
import { cseEnabled, findInstagramByName, findSiteByName } from "./google-cse";
import { DEFAULT_EXCLUDE, ICP_SYSTEM, REVIEW_SYSTEM, VERDICT_ORDER, decisionsBlock, matchesExclusion, parseReviews, parseVerdicts, pickDomain, toCandidate, type Candidate, type DecisionExample, type PageGroup } from "./prospects-core";
import { qualifyDomains, type PageQualification } from "./qualify-pages";

export const PROSPECT_STATUSES = ["seen", "queued", "contacted", "replied", "rejected", "pool"] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

const SCORE_MODEL = "claude-sonnet-5-5";
const SCORE_TIMEOUT_MS = 20_000;
const SCORE_SKIP_AFTER_MS = 30_000; // budżet funkcji na Vercelu to 60 s
const REVIEW_SKIP_AFTER_MS = 42_000;
const REVIEW_MAX = 12;

export type FindOptions = {
  terms: string[];
  countries?: string[];
  limit_per_term?: number;
  exclude_terms?: string[]; // zamiast domyślnego słownika
  extra_exclude?: string[]; // dodatkowo do słownika
  min_reach?: number;
  max_qualify?: number;
  score?: boolean;
  review?: boolean; // etap 2: model czyta tekst stron finalistów (domyślnie true)
  include_seen?: boolean;
  source?: string;
};

type Known = { key: string; page_id: string | null; domain: string | null; status: string; return_after: string | null; page_name: string };

const keyFor = (page_id: string | null, domain: string | null) => (page_id ? `page:${page_id}` : `domain:${domain}`);

/** Wpisy z bazy, które blokują ponowne pokazanie strony (po page_id albo domenie). */
async function knownBlockers(pageIds: string[], domains: string[], includeSeen: boolean): Promise<Map<string, Known>> {
  if (!pageIds.length && !domains.length) return new Map();
  const rows = await q<Known>(
    `SELECT key, page_id, domain, status, return_after, page_name FROM prospects
     WHERE (page_id = ANY($1::text[]) OR domain = ANY($2::text[]))`,
    [pageIds, domains],
  );
  const out = new Map<string, Known>();
  const now = Date.now();
  for (const r of rows) {
    if (r.status === "seen" && includeSeen) continue;
    if (r.status === "pool" && r.return_after && new Date(r.return_after).getTime() <= now) continue; // wrócił do puli
    if (r.page_id) out.set(`page:${r.page_id}`, r);
    if (r.domain) out.set(`domain:${r.domain}`, r);
  }
  return out;
}

async function upsertSeen(cands: Candidate[], source: string) {
  await Promise.all(cands.map((c) => {
    const key = keyFor(c.page_id, c.domain);
    return q(
      `INSERT INTO prospects (key, page_id, domain, page_name, status, source, verdict, verdict_why, data)
       VALUES ($1, $2, $3, $4, 'seen', $5, $6, $7, $8::jsonb)
       ON CONFLICT (key) DO UPDATE SET
         domain = COALESCE(EXCLUDED.domain, prospects.domain),
         page_name = CASE WHEN EXCLUDED.page_name <> '' THEN EXCLUDED.page_name ELSE prospects.page_name END,
         verdict = COALESCE(EXCLUDED.verdict, prospects.verdict),
         verdict_why = COALESCE(EXCLUDED.verdict_why, prospects.verdict_why),
         data = EXCLUDED.data,
         updated_at = now()`,
      [key, c.page_id || null, c.domain, c.page_name, source, c.verdict ?? null, c.why ?? null, JSON.stringify(c).replace(/\\u0000/g, "")],
    );
  }));
}

/** Ostatnie decyzje Pawła z bazy – wzięci (queued/contacted/replied) i odrzuceni (rejected). */
async function recentDecisions(): Promise<{ accepted: DecisionExample[]; rejected: DecisionExample[] }> {
  const rows = await q<DecisionExample & { updated_at: string }>(
    `SELECT page_name, domain, status, reason, verdict_why AS why, updated_at FROM prospects
     WHERE status IN ('queued','contacted','replied','rejected') AND page_name <> '' AND source NOT LIKE 'gmail%'
     ORDER BY updated_at DESC LIMIT 120`,
  );
  const accepted = rows.filter((r) => r.status !== "rejected").slice(0, 20);
  const rejected = rows.filter((r) => r.status === "rejected").slice(0, 20);
  return { accepted, rejected };
}

async function scoreCandidates(cands: Candidate[], decisions: string): Promise<{ scored: boolean; note?: string }> {
  if (!cands.length) return { scored: false, note: "brak kandydatów" };
  const payload = cands.map((c) => ({
    page_id: c.page_id,
    nazwa: c.page_name,
    reklam: c.ads,
    reklamy_od: c.first_start,
    zasieg_ue: c.eu_reach,
    tekst_reklamy: c.sample_body.slice(0, 240),
    domena: c.domain,
    strona: c.site
      ? {
          ok: c.site.ok, ...(c.site.error ? { blad: c.site.error } : {}), tytul: c.site.title, opis: c.site.description?.slice(0, 200) ?? null,
          ceny_zl: c.site.prices_pln, sygnaly_wielkosci: c.site.size_signals.slice(0, 5), kto: c.site.person_hints.slice(0, 3),
          markery_firmy: c.site.company_markers, newsletter: c.site.newsletter, ma_mail: c.site.emails.length > 0, ma_ig: c.site.instagram.length > 0,
        }
      : null,
  }));
  try {
    const text = await askClaude(ICP_SYSTEM + decisions, JSON.stringify(payload), "low", { model: SCORE_MODEL, max_tokens: 3000, timeout_ms: SCORE_TIMEOUT_MS });
    const v = parseVerdicts(text);
    if (!v.size) return { scored: false, note: "model nie zwrócił poprawnego JSON" };
    for (const c of cands) {
      const r = v.get(c.page_id);
      if (r) {
        c.verdict = r.verdict;
        c.why = r.why;
      }
    }
    return { scored: true };
  } catch (e) {
    return { scored: false, note: e instanceof Error ? e.message : String(e) };
  }
}

async function reviewFinalists(finalists: Candidate[], excerpts: Map<string, string>, decisions: string): Promise<{ reviewed: boolean; note?: string }> {
  if (!finalists.length) return { reviewed: false, note: "brak finalistów" };
  const payload = finalists.map((c) => ({
    page_id: c.page_id,
    nazwa: c.page_name,
    tekst_reklamy: c.sample_body.slice(0, 300),
    historia_reklam: c.ads_history ?? null,
    domena: c.domain,
    sygnaly: c.site ? { ceny_zl: c.site.prices_pln, liczniki: c.site.size_signals.slice(0, 5), kto: c.site.person_hints.slice(0, 3), markery_firmy: c.site.company_markers, newsletter: c.site.newsletter } : null,
    tekst_strony: (c.domain && excerpts.get(c.domain)) || "(strona nieosiągalna)",
  }));
  try {
    const text = await askClaude(REVIEW_SYSTEM + decisions, JSON.stringify(payload), "low", { model: SCORE_MODEL, max_tokens: 3500, timeout_ms: SCORE_TIMEOUT_MS });
    const r = parseReviews(text);
    if (!r.size) return { reviewed: false, note: "model nie zwrócił poprawnego JSON" };
    for (const c of finalists) {
      const v = r.get(c.page_id);
      if (v) {
        c.review = v;
        c.verdict = v.verdict;
        c.why = v.why;
      }
    }
    return { reviewed: true };
  } catch (e) {
    return { reviewed: false, note: e instanceof Error ? e.message : String(e) };
  }
}

async function recordTerms(terms: string[], perTerm: Map<string, { ads: number; pageIds: Set<string> }>, newIds: Set<string>, cands: Candidate[], source: string) {
  const byId = new Map(cands.map((c) => [c.page_id, c]));
  await Promise.all(
    terms.map((t) => {
      const info = perTerm.get(t) ?? { ads: 0, pageIds: new Set<string>() };
      const ids = [...info.pageIds];
      const qualified = ids.filter((id) => byId.has(id));
      const pasuje = qualified.filter((id) => byId.get(id)?.verdict === "pasuje").length;
      const watpliwe = qualified.filter((id) => (byId.get(id)?.verdict ?? "watpliwe") === "watpliwe").length;
      return q(
        `INSERT INTO prospect_terms (term, source, ads, pages, pages_new, qualified, pasuje, watpliwe) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [t, source, info.ads, ids.length, ids.filter((id) => newIds.has(id)).length, qualified.length, pasuje, watpliwe],
      );
    }),
  );
}

export async function findProspects(o: FindOptions) {
  const t0 = Date.now();
  const lap = () => Math.round((Date.now() - t0) / 100) / 10;
  const timing: Record<string, number> = {};
  const terms = o.terms.map((t) => t.trim()).filter(Boolean).slice(0, 6);
  if (!terms.length) throw new Error("Podaj przynajmniej jedną frazę (terms).");
  const source = o.source ?? `find_prospects ${new Date().toISOString().slice(0, 10)}`;

  // 1. Ad Library – wszystkie frazy równolegle.
  const [results, decisionsRaw] = await Promise.all([
    Promise.allSettled(terms.map((t) => searchAdsLibrary({ search_terms: t, countries: o.countries, limit: o.limit_per_term ?? 100 }))),
    recentDecisions().catch(() => ({ accepted: [], rejected: [] })),
  ]);
  const decisions = decisionsBlock(decisionsRaw.accepted, decisionsRaw.rejected);
  const ads = new Map<string, AdRecord>();
  const perTerm = new Map<string, { ads: number; pageIds: Set<string> }>();
  const errors: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      perTerm.set(terms[i], { ads: r.value.ads.length, pageIds: new Set(r.value.ads.map((a) => a.page_id)) });
      for (const a of r.value.ads) ads.set(a.id, a);
    } else errors.push(`${terms[i]}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
  });
  timing.ad_library_s = lap();
  const groups = groupByPage([...ads.values()]) as PageGroup[];

  // 2. Wykluczenia słownikowe + próg zasięgu.
  const exclude = (o.exclude_terms?.length ? o.exclude_terms : [...DEFAULT_EXCLUDE, ...(o.extra_exclude ?? [])]).map((t) => t.toLowerCase());
  const excluded: { page_name: string; term: string }[] = [];
  let pages = groups.filter((p) => {
    const hit = matchesExclusion(p, exclude);
    if (hit) excluded.push({ page_name: p.page_name, term: hit });
    return !hit;
  });
  if (o.min_reach) pages = pages.filter((p) => p.eu_reach >= (o.min_reach ?? 0));

  // 3. Domena + dedupe z bazy.
  const withDomain = pages.map((p) => ({ p, domain: pickDomain(p.domains) }));
  const known = await knownBlockers(pages.map((p) => p.page_id), withDomain.map((w) => w.domain).filter((d): d is string => !!d), !!o.include_seen);
  const skipped_known: { page_name: string; status: string; domain: string | null }[] = [];
  const fresh = withDomain.filter(({ p, domain }) => {
    const k = known.get(`page:${p.page_id}`) ?? (domain ? known.get(`domain:${domain}`) : undefined);
    if (k) skipped_known.push({ page_name: p.page_name, status: k.status, domain });
    return !k;
  });
  const noDomainAll = fresh.filter((w) => !w.domain);
  // 3b. Custom Search: dla najsilniejszych stron bez domeny spróbuj znaleźć ich stronę (max 6, tylko gdy włączone).
  const foundVia = new Map<string, string>();
  if (cseEnabled()) {
    const tryFind = noDomainAll.filter((w) => w.p.ads >= 2).slice(0, 6);
    const found = await Promise.all(tryFind.map((w) => findSiteByName(w.p.page_name).catch(() => null)));
    found.forEach((d, i) => {
      if (d && !known.get(`domain:${d}`)) {
        tryFind[i].domain = d;
        foundVia.set(tryFind[i].p.page_id, `custom search: ${d}`);
      }
    });
  }
  const no_domain = fresh.filter((w) => !w.domain).map((w) => ({ page_id: w.p.page_id, page_name: w.p.page_name, ads: w.p.ads, links: w.p.domains.slice(0, 2) }));
  const toQualify = fresh.filter((w) => !!w.domain).slice(0, Math.min(o.max_qualify ?? 25, 30));
  timing.dedupe_s = lap();

  // 4. Kwalifikacja stron (równolegle).
  const quals = await qualifyDomains(toQualify.map((w) => w.domain as string));
  const byDomain = new Map<string, PageQualification>(quals.map((x) => [x.domain, x]));
  const excerpts = new Map<string, string>(quals.map((x) => [x.domain, x.text_excerpt]));
  const candidates: Candidate[] = toQualify.map(({ p, domain }) => {
    const c = toCandidate(p, domain, byDomain.get(domain as string));
    const via = foundVia.get(p.page_id);
    if (via) c.found_via = via;
    return c;
  });
  timing.qualify_s = lap();

  // 5. Sortowanie przez model (etap 1) – z decyzjami Pawła w prompcie.
  let scoring: { scored: boolean; note?: string } = { scored: false, note: "wyłączone" };
  if (o.score !== false) {
    scoring = Date.now() - t0 > SCORE_SKIP_AFTER_MS ? { scored: false, note: "pominięte – brak czasu w budżecie 60 s" } : await scoreCandidates(candidates, decisions);
  }
  timing.score_s = lap();

  // 6. Finaliści: historia reklam + drugie czytanie (etap 2) + IG przez Custom Search, gdy brak kontaktu.
  const finalists = candidates.filter((c) => (c.verdict ?? "watpliwe") !== "nie").slice(0, REVIEW_MAX);
  let review: { reviewed: boolean; note?: string } = { reviewed: false, note: "wyłączone" };
  if (o.review !== false && finalists.length) {
    if (Date.now() - t0 > REVIEW_SKIP_AFTER_MS) review = { reviewed: false, note: "pominięte – brak czasu w budżecie 60 s" };
    else {
      const noContact = finalists.filter((c) => !c.site || (!c.site.emails.length && !c.site.instagram.length));
      const [hist, igs] = await Promise.all([
        pagesHistory(finalists.map((c) => c.page_id), o.countries).catch(() => new Map()),
        cseEnabled() ? Promise.all(noContact.slice(0, 4).map((c) => findInstagramByName(c.page_name).catch(() => null))) : Promise.resolve([] as (string | null)[]),
      ]);
      for (const c of finalists) {
        const h = hist.get(c.page_id);
        if (h) c.ads_history = { total_ads: h.total_ads, active_ads: h.active_ads, first_ever: h.first_ever, months_advertising: h.months_advertising };
      }
      igs.forEach((ig, i) => {
        const c = noContact[i];
        if (ig && c?.site) {
          c.site.instagram.push(ig);
          c.found_via = `${c.found_via ? c.found_via + "; " : ""}ig przez custom search`;
        }
      });
      review = await reviewFinalists(finalists, excerpts, decisions);
    }
  }
  timing.review_s = lap();

  // 7. Zapis „widziane”, rejestr fraz, odpowiedź.
  await Promise.all([upsertSeen(candidates, source), recordTerms(terms, perTerm, new Set(fresh.map((w) => w.p.page_id)), candidates, source).catch(() => undefined)]);
  timing.total_s = lap();

  candidates.sort((a, b) => (VERDICT_ORDER[a.verdict ?? "watpliwe"] - VERDICT_ORDER[b.verdict ?? "watpliwe"]) || b.ads - a.ads);
  const bucket = (v: string | undefined) => candidates.filter((c) => (c.verdict ?? "watpliwe") === v);
  return {
    timing,
    counts: {
      ads: ads.size, pages: groups.length, excluded: excluded.length, known_skipped: skipped_known.length, no_domain: no_domain.length,
      qualified: candidates.length, pasuje: bucket("pasuje").length, watpliwe: bucket("watpliwe").length, nie: bucket("nie").length,
    },
    scoring,
    review,
    custom_search: cseEnabled() ? "włączone" : "wyłączone (brak GOOGLE_CSE_KEY/GOOGLE_CSE_CX)",
    decisions_in_prompt: { accepted: decisionsRaw.accepted.length, rejected: decisionsRaw.rejected.length },
    errors,
    pasuje: bucket("pasuje"),
    watpliwe: bucket("watpliwe"),
    nie: bucket("nie").map((c) => ({ page_id: c.page_id, page_name: c.page_name, domain: c.domain, why: c.why })),
    skipped_known,
    no_domain: no_domain.slice(0, 15),
    excluded_sample: excluded.slice(0, 20),
    source,
  };
}

export type MarkItem = { page_id?: string; domain?: string; status: ProspectStatus; reason?: string; page_name?: string; return_after?: string };

export async function markProspects(items: MarkItem[], source: string) {
  const done: { key: string; status: string }[] = [];
  for (const it of items) {
    const domain = it.domain?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "") || null;
    const page_id = it.page_id?.trim() || null;
    if (!page_id && !domain) continue;
    // Jeśli istnieje wpis po domenie, a przyszedł page_id (lub odwrotnie) – aktualizujemy istniejący.
    const existing = await one<{ key: string }>(
      "SELECT key FROM prospects WHERE ($1::text IS NOT NULL AND page_id = $1) OR ($2::text IS NOT NULL AND domain = $2) ORDER BY (page_id = $1) DESC NULLS LAST LIMIT 1",
      [page_id, domain],
    );
    const key = existing?.key ?? keyFor(page_id, domain);
    await q(
      `INSERT INTO prospects (key, page_id, domain, page_name, status, reason, source, return_after)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (key) DO UPDATE SET
         page_id = COALESCE(prospects.page_id, EXCLUDED.page_id),
         domain = COALESCE(prospects.domain, EXCLUDED.domain),
         page_name = CASE WHEN EXCLUDED.page_name <> '' THEN EXCLUDED.page_name ELSE prospects.page_name END,
         status = EXCLUDED.status, reason = EXCLUDED.reason, return_after = EXCLUDED.return_after, updated_at = now()`,
      [key, page_id, domain, it.page_name ?? "", it.status, it.reason ?? "", source, it.return_after ?? null],
    );
    done.push({ key, status: it.status });
  }
  return { updated: done.length, items: done };
}

export async function listProspects(f: { status?: ProspectStatus; search?: string; limit?: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.status) {
    params.push(f.status);
    where.push(`status = $${params.length}`);
  }
  if (f.search) {
    params.push(`%${f.search.toLowerCase()}%`);
    where.push(`(lower(page_name) LIKE $${params.length} OR lower(domain) LIKE $${params.length})`);
  }
  params.push(Math.min(f.limit ?? 100, 500));
  const rows = await q<{ key: string; page_id: string | null; domain: string | null; page_name: string; status: string; reason: string; source: string; verdict: string | null; verdict_why: string | null; return_after: string | null; first_seen: string; updated_at: string }>(
    `SELECT key, page_id, domain, page_name, status, reason, source, verdict, verdict_why, return_after, first_seen, updated_at FROM prospects
     ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY updated_at DESC LIMIT $${params.length}`,
    params,
  );
  const stats = await q<{ status: string; n: string }>("SELECT status, count(*)::text AS n FROM prospects GROUP BY status");
  return { stats: Object.fromEntries(stats.map((s) => [s.status, Number(s.n)])), rows };
}

export async function termStats() {
  const rows = await q<{ term: string; runs: string; ads: string; pages: string; pages_new: string; qualified: string; pasuje: string; watpliwe: string; last_run: string }>(
    `SELECT term, count(*)::text AS runs, sum(ads)::text AS ads, sum(pages)::text AS pages, sum(pages_new)::text AS pages_new,
            sum(qualified)::text AS qualified, sum(pasuje)::text AS pasuje, sum(watpliwe)::text AS watpliwe, max(run_at)::text AS last_run
     FROM prospect_terms GROUP BY term ORDER BY sum(pasuje) DESC, sum(pages_new) DESC`,
  );
  return rows.map((r) => ({
    term: r.term, runs: +r.runs, ads: +r.ads, pages: +r.pages, pages_new: +r.pages_new, qualified: +r.qualified, pasuje: +r.pasuje, watpliwe: +r.watpliwe,
    pasuje_per_100_pages: +r.pages ? Math.round((100 * +r.pasuje) / +r.pages) : 0, last_run: r.last_run,
  }));
}
