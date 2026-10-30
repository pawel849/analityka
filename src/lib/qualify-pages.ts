// Kwalifikacja prospektów: dla listy domen pobiera stronę główną i podstrony kontakt/polityka/regulamin/o-mnie
// równolegle po stronie serwera i wyciąga dane kontaktowe oraz sygnały wielkości. Bez zewnętrznych zależności.

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const FETCH_TIMEOUT_MS = 7000;
const MAX_DOMAINS = 30;
const MAX_SUBPAGES = 4;
const SUBPAGE_HINTS = ["kontakt", "contact", "polityka", "privacy", "regulamin", "terms", "o-mnie", "o-nas", "about"];

const JUNK_EMAIL = /(sentry|wixpress|example\.com|schema\.org|w3\.org|yourdomain|domain\.com|\.png$|\.jpg$|\.webp$|noreply|no-reply)/i;
const COMPANY_MARKERS = /(sp\.\s?z\s?o\.?\s?o|spółka|s\.a\.\b|fundacja|stowarzyszenie|ośrodek szkolenia|instytut|centrum szkole|akademia (medyczna|biznesu)|llc\b|ltd\b)/gi;

export type PageQualification = {
  domain: string;
  ok: boolean;
  error?: string;
  title: string | null;
  description: string | null;
  emails: string[];
  phones: string[];
  instagram: string[];
  facebook: string[];
  youtube: string[];
  prices_pln: number[];
  size_signals: string[];
  person_hints: string[];
  company_markers: string[];
  newsletter: boolean;
  fetched: string[];
};

function abortable(ms: number) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

async function getHtml(url: string): Promise<{ html: string; finalUrl: string } | null> {
  const a = abortable(FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: a.signal, redirect: "follow", headers: { "user-agent": UA, accept: "text/html,*/*;q=0.8", "accept-language": "pl-PL,pl;q=0.9" } });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!/html|xml|text/i.test(ct)) return null;
    const html = (await res.text()).slice(0, 600_000);
    return { html, finalUrl: res.url || url };
  } catch {
    return null;
  } finally {
    a.done();
  }
}

const decode = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&#64;|&#x40;/gi, "@").replace(/&#46;/g, ".").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

function toText(html: string): string {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>|<\/p>|<\/div>|<\/li>|<\/h\d>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/[ \t ]+/g, " ")
      .replace(/\n\s*\n+/g, "\n"),
  );
}

function uniq<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

function extractEmails(html: string, text: string, domain: string): string[] {
  const src = `${decode(html)}\n${text}`
    .replace(/\s*\[\s*(at|małpa|malpa)\s*\]\s*/gi, "@")
    .replace(/\s*\(\s*(at|małpa|malpa)\s*\)\s*/gi, "@")
    .replace(/\s*\[\s*(dot|kropka)\s*\]\s*/gi, ".");
  const found = src.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [];
  const mailto = [...html.matchAll(/mailto:([^"'?\s>]+)/gi)].map((m) => decode(m[1]));
  const all = uniq([...mailto, ...found].map((e) => e.toLowerCase().replace(/^u003e|^3e/i, "")).filter((e) => !JUNK_EMAIL.test(e) && e.length < 80));
  const root = domain.replace(/^www\./, "");
  // Najpierw adresy w domenie prospekta, potem reszta.
  return [...all.filter((e) => e.endsWith("@" + root) || e.includes(root.split(".")[0])), ...all.filter((e) => !(e.endsWith("@" + root) || e.includes(root.split(".")[0])))].slice(0, 6);
}

function extractPhones(html: string, text: string): string[] {
  const tel = [...html.matchAll(/tel:([+\d\s().-]{7,20})/gi)].map((m) => m[1]);
  const raw = text.match(/(?:\+48[\s-]?)?(?:\(?\d{2,3}\)?[\s-]?)\d{3}[\s-]?\d{2,3}[\s-]?\d{2,3}\b/g) ?? [];
  const norm = (p: string) => p.replace(/[^\d+]/g, "");
  const out = uniq([...tel, ...raw].map(norm)).filter((p) => {
    const d = p.replace(/\D/g, "");
    if (d.length < 9 || d.length > 11) return false;
    if (/^(\d)\1{8}/.test(d)) return false;
    // odrzuć NIP/REGON/kody pocztowe wyglądające jak numery
    return !(d.length === 10 && !d.startsWith("48") && !/^[4-9]/.test(d));
  });
  return out.slice(0, 4);
}

function extractSocial(html: string, re: RegExp): string[] {
  return uniq([...html.matchAll(re)].map((m) => m[0].replace(/^https?:\/\/(www\.)?/, "").replace(/[/?#].*$/, (s) => s.split(/[?#]/)[0]).replace(/\/$/, "")))
    .filter((u) => !/\/(p|reel|reels|share|sharer|plugins|tr|dialog|policies|help|explore|stories)\b/i.test(u) && !/instagram\.com\/?$/.test(u) && !/facebook\.com\/?$/.test(u))
    .slice(0, 4);
}

function extractPrices(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(\d{1,3}(?:[  .]\d{3})+|\d{2,5})(?:[,.]\d{2})?\s?(?:zł|PLN)(?![a-ząćęłńóśźż])/giu)) {
    const v = Number(m[1].replace(/[  .]/g, ""));
    if (v >= 19 && v <= 50_000) out.push(v);
  }
  return uniq(out).sort((a, b) => a - b).slice(0, 12);
}

function extractSizeSignals(text: string): string[] {
  const re = /((?:ponad|już|przeszło|więcej niż)?\s?\d[\d\s .,]{0,8}(?:\s?tys\.?|\s?000)?\s?(?:kursant|absolwent|uczestni|klient|os[oó]b|subskryb|czytelni|student|firm|opinii|edycj|kurs[oó]w|lekcj|lat (?:doświadczenia|na rynku)))/gi;
  return uniq([...text.matchAll(re)].map((m) => m[1].replace(/\s+/g, " ").trim())).slice(0, 8);
}

function extractPersons(text: string): string[] {
  const hits: string[] = [];
  const pats = [
    /administratorem (?:twoich |pani\/pana |państwa )?danych(?: osobowych)? jest[:\s]+([^.\n]{3,120})/gi,
    /©\s?(?:\d{4}(?:\s?[-–]\s?\d{4})?)?\s?([A-ZŁŚŻŹĆŃÓĘĄ][^\n|.]{2,60})/g,
    /(?:nazywam się|mam na imię|jestem)\s+([A-ZŁŚŻŹĆŃÓĘĄ][a-ząćęłńóśźż]+(?:\s[A-ZŁŚŻŹĆŃÓĘĄ][a-ząćęłńóśźż-]+){1,2})/gi,
    /sprzedawcą jest[:\s]+([^.\n]{3,120})/gi,
  ];
  for (const re of pats) for (const m of text.matchAll(re)) hits.push(m[1].trim());
  return uniq(hits).slice(0, 6);
}

function pickSubpages(html: string, base: URL): string[] {
  const links = [...html.matchAll(/href=["']([^"'#]+)["']/gi)].map((m) => m[1]);
  const out: string[] = [];
  for (const h of links) {
    try {
      const u = new URL(h, base);
      if (u.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) continue;
      const p = u.pathname.toLowerCase();
      if (SUBPAGE_HINTS.some((k) => p.includes(k)) && !out.includes(u.href)) out.push(u.href);
    } catch {
      /* zły href */
    }
    if (out.length >= MAX_SUBPAGES) break;
  }
  // Domyślne ścieżki, gdyby strona nie linkowała.
  for (const p of ["/kontakt", "/polityka-prywatnosci", "/regulamin"]) {
    const href = new URL(p, base).href;
    if (out.length < MAX_SUBPAGES && !out.includes(href)) out.push(href);
  }
  return out.slice(0, MAX_SUBPAGES);
}

export async function qualifyDomain(input: string): Promise<PageQualification> {
  const domain = input.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase();
  const empty: PageQualification = {
    domain, ok: false, title: null, description: null, emails: [], phones: [], instagram: [], facebook: [], youtube: [],
    prices_pln: [], size_signals: [], person_hints: [], company_markers: [], newsletter: false, fetched: [],
  };
  if (!domain || !domain.includes(".")) return { ...empty, error: "Nieprawidłowa domena" };

  let home = await getHtml(`https://${domain}/`);
  if (!home) home = await getHtml(`https://www.${domain}/`);
  if (!home) return { ...empty, error: "Strona główna nieosiągalna (timeout/blokada/404)" };

  const base = new URL(home.finalUrl);
  const subUrls = pickSubpages(home.html, base);
  const subs = await Promise.all(subUrls.map((u) => getHtml(u)));
  const pages = [home, ...subs.filter((s): s is NonNullable<typeof s> => !!s)];
  const html = pages.map((p) => p.html).join("\n");
  const text = pages.map((p) => toText(p.html)).join("\n");
  const homeText = toText(home.html);

  const title = home.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
  const description = home.html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{3,300})["']/i)?.[1] ?? null;

  return {
    domain,
    ok: true,
    title,
    description: description ? decode(description) : null,
    emails: extractEmails(html, text, domain),
    phones: extractPhones(html, text),
    instagram: extractSocial(html, /https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]{2,40}\/?/gi),
    facebook: extractSocial(html, /https?:\/\/(?:www\.)?facebook\.com\/[A-Za-z0-9_.\-]{2,60}\/?/gi),
    youtube: extractSocial(html, /https?:\/\/(?:www\.)?youtube\.com\/(?:@|c\/|channel\/|user\/)[A-Za-z0-9_.\-]{2,60}\/?/gi),
    prices_pln: extractPrices(homeText),
    size_signals: extractSizeSignals(text),
    person_hints: extractPersons(text),
    company_markers: uniq([...text.matchAll(COMPANY_MARKERS)].map((m) => m[0].toLowerCase())).slice(0, 4),
    newsletter: /newsletter|zapisz się na list|zapisz się do list|dołącz do listy/i.test(text),
    fetched: pages.map((p) => p.finalUrl),
  };
}

export async function qualifyDomains(domains: string[]): Promise<PageQualification[]> {
  const list = uniq(domains.map((d) => d.trim()).filter(Boolean)).slice(0, MAX_DOMAINS);
  return Promise.all(list.map((d) => qualifyDomain(d)));
}
