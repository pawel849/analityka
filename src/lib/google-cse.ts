// Google Programmable Search (Custom Search JSON API) – 100 zapytań/dzień za darmo.
// Zmienne: GOOGLE_CSE_KEY (klucz API), GOOGLE_CSE_CX (identyfikator wyszukiwarki). Bez nich funkcje zwracają null.

export type CseHit = { title: string; link: string; snippet: string };

export function cseEnabled(): boolean {
  return !!(process.env.GOOGLE_CSE_KEY && process.env.GOOGLE_CSE_CX);
}

export async function cseSearch(query: string, num = 5): Promise<CseHit[] | null> {
  if (!cseEnabled()) return null;
  const u = new URL("https://www.googleapis.com/customsearch/v1");
  u.searchParams.set("key", process.env.GOOGLE_CSE_KEY as string);
  u.searchParams.set("cx", process.env.GOOGLE_CSE_CX as string);
  u.searchParams.set("q", query);
  u.searchParams.set("num", String(Math.min(Math.max(num, 1), 10)));
  u.searchParams.set("gl", "pl");
  u.searchParams.set("hl", "pl");
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 6000);
  try {
    const res = await fetch(u, { signal: c.signal });
    const json = (await res.json()) as { items?: { title?: string; link?: string; snippet?: string }[]; error?: { message?: string } };
    if (!res.ok) throw new Error(`Custom Search: ${json.error?.message ?? res.status}`);
    return (json.items ?? []).map((i) => ({ title: i.title ?? "", link: i.link ?? "", snippet: i.snippet ?? "" })).filter((i) => i.link);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const NOT_SITE = /(facebook\.com|instagram\.com|youtube\.com|linkedin\.com|tiktok\.com|linktr\.ee|allegro\.pl|olx\.pl|wikipedia\.org|gowork\.pl|aleo\.com|krs-online|rejestr\.io|panoramafirm|pkt\.pl|znanylekarz|booksy|google\.com|apple\.com|spotify\.com)/i;

/** Szuka własnej strony twórcy po nazwie strony FB. Zwraca domenę albo null. */
export async function findSiteByName(pageName: string): Promise<string | null> {
  const hits = await cseSearch(`"${pageName.replace(/"/g, "")}" kurs OR szkolenie OR warsztaty`, 5);
  if (!hits) return null;
  for (const h of hits) {
    try {
      const host = new URL(h.link).hostname.toLowerCase().replace(/^www\./, "");
      if (!NOT_SITE.test(host)) return host;
    } catch {
      /* zły link */
    }
  }
  return null;
}

/** Szuka profilu Instagram po nazwie. Zwraca "instagram.com/<handle>" albo null. */
export async function findInstagramByName(pageName: string): Promise<string | null> {
  const hits = await cseSearch(`"${pageName.replace(/"/g, "")}" site:instagram.com`, 5);
  if (!hits) return null;
  for (const h of hits) {
    const m = h.link.match(/instagram\.com\/([A-Za-z0-9_.]{2,40})\/?/);
    if (m && !/^(p|reel|reels|explore|accounts|stories)$/.test(m[1])) return `instagram.com/${m[1]}`;
  }
  return null;
}
