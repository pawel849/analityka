// Czysta logika prospectingu (bez bazy i sieci) – filtry, wybór domeny, parsowanie ocen. Testowalna offline.
import type { PageQualification } from "./qualify-pages";

/** Słownik wykluczeń ICP Pawła (stan 30.10.2026). Dopasowanie: nazwa strony + domeny + próbki tekstu reklamy, małe litery. */
export const DEFAULT_EXCLUDE = [
  // edukacja egzaminacyjna
  "matur", "ósmoklas", "osmoklas", "egzamin",
  // prawo jazdy / ośrodki
  "osk", "prawo jazdy", "ośrodek", "osrodek", "instytut", "szkoła policealna", "szkola policealna", "uniwersytet",
  // fitness / dieta
  "fitness", "trening", "dieta", "odchudz", "dietetyk",
  // guru marketingu / IG / AI / marka osobista
  "marki osobistej", "marka osobista", "sprzedaż online", "sprzedaz online", "instagrama", "na instagramie zarab", "sztuczna inteligencj", "sztucznej inteligencj", "sztuczną inteligencj", "ai", "chatgpt", "reklam na facebooku", "lejk",
  // MLM, bukmacherka, kupony, dramy
  "mlm", "bukmach", "kupon", "kurs min", "reelshort", "dramawave", "drama",
  // instytucje / spółki / dotacje
  "sp. z o.o", "sp. z o. o", "stowarzyszenie", "fundacja", "dofinansow", "kfs", "bur", "nauczyciel",
];

/** Domeny, które nie są stroną prospekta (linki zbiorcze, social, skracacze). */
const NOT_A_SITE = /(^|\.)(facebook\.com|fb\.com|fb\.me|m\.me|instagram\.com|youtube\.com|youtu\.be|linktr\.ee|bio\.link|linkin\.bio|beacons\.ai|bit\.ly|tiny\.pl|tinyurl\.com|wa\.me|forms\.gle|docs\.google\.com|calendly\.com|t\.me|tiktok\.com|whatsapp\.com|messenger\.com|apple\.com|play\.google\.com)$/i;

export type PageGroup = {
  page_id: string;
  page_name: string;
  ads: number;
  first_start: string | null;
  last_start: string | null;
  eu_reach: number;
  domains: string[];
  sample_bodies: string[];
};

/** Frazy do 4 znaków (osk, kfs, bur, mlm, ai) dopasowujemy jako całe słowo – „osk” nie może wycinać „włoskiego”. */
function termMatches(hay: string, t: string): boolean {
  const term = t.trim();
  if (!term) return false;
  if (term.length > 4 || /\s/.test(term)) return hay.includes(term);
  const esc = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}(?=$|[^\\p{L}\\p{N}])`, "iu").test(hay);
}

export function matchesExclusion(p: PageGroup, terms: string[]): string | null {
  const hay = ` ${p.page_name} ${p.domains.join(" ")} ${p.sample_bodies.join(" ")} `.toLowerCase();
  for (const t of terms) if (termMatches(hay, t.toLowerCase())) return t;
  return null;
}

/** Pierwsza domena, która wygląda na własną stronę prospekta. */
export function pickDomain(domains: string[]): string | null {
  for (const d of domains) {
    const clean = d.toLowerCase().replace(/^www\./, "").trim();
    if (!clean.includes(".") || NOT_A_SITE.test(clean)) continue;
    return clean;
  }
  return null;
}

export type Verdict = "pasuje" | "watpliwe" | "nie";

export type Candidate = {
  page_id: string;
  page_name: string;
  ads: number;
  first_start: string | null;
  eu_reach: number;
  domain: string | null;
  sample_body: string;
  site: null | {
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
  };
  verdict?: Verdict;
  why?: string;
  /** Historia reklam (aktywne + zakończone) – uzupełniana dla finalistów. */
  ads_history?: { total_ads: number; active_ads: number; first_ever: string | null; months_advertising: number | null };
  /** Drugie czytanie (model na tekście strony) – tylko finaliści. */
  review?: { verdict: Verdict; produkt_cyfrowy: string; twarz: string; skala: string; jezyk: string; why: string };
  /** Skąd domena / IG, jeśli dociągnięte przez Custom Search. */
  found_via?: string;
};

export function toCandidate(p: PageGroup, domain: string | null, site: PageQualification | undefined): Candidate {
  return {
    page_id: p.page_id,
    page_name: p.page_name,
    ads: p.ads,
    first_start: p.first_start,
    eu_reach: p.eu_reach,
    domain,
    sample_body: p.sample_bodies[0] ?? "",
    site: site
      ? {
          ok: site.ok, ...(site.error ? { error: site.error } : {}), title: site.title, description: site.description,
          emails: site.emails, phones: site.phones, instagram: site.instagram, facebook: site.facebook, youtube: site.youtube,
          prices_pln: site.prices_pln, size_signals: site.size_signals, person_hints: site.person_hints,
          company_markers: site.company_markers, newsletter: site.newsletter,
        }
      : null,
  };
}

/** Parsuje odpowiedź modelu: tablica JSON {page_id, verdict, why}; toleruje płotki ```json. Nieznane → brak oceny. */
export function parseVerdicts(text: string): Map<string, { verdict: Verdict; why: string }> {
  const out = new Map<string, { verdict: Verdict; why: string }>();
  const body = text.replace(/^[\s\S]*?(\[)/, "$1").replace(/\][\s\S]*$/, "]");
  let arr: unknown;
  try {
    arr = JSON.parse(body);
  } catch {
    return out;
  }
  if (!Array.isArray(arr)) return out;
  for (const it of arr) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const id = String(o.page_id ?? "");
    const v = String(o.verdict ?? "").toLowerCase().replace("ą", "a");
    const verdict: Verdict | null = v.startsWith("pas") ? "pasuje" : v.startsWith("wat") || v.startsWith("wąt") ? "watpliwe" : v.startsWith("nie") ? "nie" : null;
    if (id && verdict) out.set(id, { verdict, why: String(o.why ?? "").slice(0, 200) });
  }
  return out;
}

export type DecisionExample = { page_name: string; domain: string | null; status: string; reason: string; why: string | null };

/** Blok z decyzjami Pawła do promptu – model ma się uczyć, gdzie leży jego granica. */
export function decisionsBlock(accepted: DecisionExample[], rejected: DecisionExample[]): string {
  const line = (d: DecisionExample) => `- ${d.page_name}${d.domain ? ` (${d.domain})` : ""}${d.reason ? ` — ${d.reason}` : d.why ? ` — ${d.why}` : ""}`;
  if (!accepted.length && !rejected.length) return "";
  return `\n\nDECYZJE PAWŁA Z OSTATNICH PARTII (to jest wzorzec, nie kryteria w ogólności):\nWZIĄŁ:\n${accepted.map(line).join("\n") || "- (brak)"}\nODRZUCIŁ:\n${rejected.map(line).join("\n") || "- (brak)"}\nGdy kandydat przypomina któryś z powyższych, oceniaj tak jak Paweł.`;
}

/** Etap 2 – model czyta tekst strony finalisty. */
export const REVIEW_SYSTEM = `Oceniasz FINALISTÓW prospectingu copywritera direct response (Paweł) dla polskich twórców infoproduktów. Dostajesz: dane z reklamy, historię reklam w Meta (od kiedy, ile aktywnych), wyciągnięte sygnały i SUROWY TEKST strony głównej.
Dla każdego odpowiedz krótko (po polsku, max 12 słów na pole), WYŁĄCZNIE na podstawie danych:
- produkt_cyfrowy: jaki konkretnie produkt cyfrowy sprzedaje (kurs/warsztat/mentoring/e-book + cena, jeśli widać), albo "brak/niejasne", albo "usługa 1:1 / towar / aplikacja"
- twarz: imię i nazwisko twórcy, jeśli strona je pokazuje jako markę; albo "firma/instytucja bez twarzy"
- skala: liczniki (kursanci, opinie, lista), launch, newsletter; albo "brak sygnałów"
- jezyk: język strony ("polski", "ukraiński", "angielski", …)
- verdict: "pasuje" | "watpliwe" | "nie"
- why: jedno zdanie
Kryteria jak w etapie 1: PASUJE = własny produkt cyfrowy + marka osobista z twarzą + sygnały sprzedaży; NIE = fitness/dieta (PL), guru marketingu/sprzedaży/Instagrama/marki osobistej/AI, MLM, matura/ósmoklasista, instytucje/ośrodki/spółki bez twarzy, towar, strona nie po polsku. Historia reklam: wiele miesięcy ciągłych reklam = mocny sygnał realnej sprzedaży; pierwsza reklama w tym tygodniu = słaby. Gdy brak pewności: "watpliwe".
Odpowiadasz WYŁĄCZNIE tablicą JSON: [{"page_id":"...","produkt_cyfrowy":"...","twarz":"...","skala":"...","jezyk":"...","verdict":"...","why":"..."}].`;

export type Review = NonNullable<Candidate["review"]>;

export function parseReviews(text: string): Map<string, Review> {
  const out = new Map<string, Review>();
  const body = text.replace(/^[\s\S]*?(\[)/, "$1").replace(/\][\s\S]*$/, "]");
  let arr: unknown;
  try {
    arr = JSON.parse(body);
  } catch {
    return out;
  }
  if (!Array.isArray(arr)) return out;
  const str = (v: unknown) => String(v ?? "").slice(0, 160);
  for (const it of arr) {
    if (!it || typeof it !== "object") continue;
    const o = it as Record<string, unknown>;
    const id = String(o.page_id ?? "");
    const v = String(o.verdict ?? "").toLowerCase().replace("ą", "a");
    const verdict: Verdict | null = v.startsWith("pas") ? "pasuje" : v.startsWith("wat") || v.startsWith("wąt") ? "watpliwe" : v.startsWith("nie") ? "nie" : null;
    if (!id || !verdict) continue;
    out.set(id, { verdict, produkt_cyfrowy: str(o.produkt_cyfrowy), twarz: str(o.twarz), skala: str(o.skala), jezyk: str(o.jezyk), why: str(o.why) });
  }
  return out;
}

export const VERDICT_ORDER: Record<Verdict, number> = { pasuje: 0, watpliwe: 1, nie: 2 };

/** Kryteria ICP do sortowania kandydatów przez model. Model SORTUJE, nie decyduje. */
export const ICP_SYSTEM = `Sortujesz kandydatów na klientów copywritera direct response (Paweł) pracującego dla polskich twórców infoproduktów (kursy online, szkolenia, warsztaty, mentoringi).
Dla każdego kandydata dajesz verdict: "pasuje", "watpliwe" albo "nie" + jedno krótkie zdanie "why" po polsku, oparte WYŁĄCZNIE na podanych danych. Nie zgaduj faktów, których nie ma w danych.

PASUJE, gdy łącznie:
- własny produkt cyfrowy sprzedawany z własnej strony (kurs, szkolenie, warsztat, mentoring, grupa, poradnik), a nie usługa 1:1, sklep z towarem, aplikacja czy agencja;
- marka osobista z twarzą twórcy (imię i nazwisko, „nazywam się”, RODO na osobę) – nie spółka, instytucja, ośrodek, fundacja, uczelnia;
- sygnały realnej sprzedaży/listy: ceny produktów, liczniki kursantów/absolwentów/opinii, newsletter, reklamy lead-genowe, launch. Lista ~2000+ to ideał; brak liczników sam w sobie nie dyskwalifikuje.

NIE, gdy którekolwiek:
- coach fitness, trener personalny, dietetyk, odchudzanie (rynek PL);
- guru marketingu/sprzedaży online, nauka Instagrama, nauka marki osobistej, nauka AI w biznesie, agencja marketingowa;
- MLM, bukmacherka, kursy za 9–30 zł jako główny produkt, „drama”/aplikacje;
- edukacja do matury lub egzaminu ósmoklasisty;
- ośrodek szkoleniowy, fabryka certyfikatów, szkoła policealna, uczelnia, OSK, szkolenia z dofinansowaniem (KFS/BUR) jako model;
- firma/spółka bez twarzy, sklep sprzedający kurs jako dodatek do towaru;
- strona w języku innym niż polski (np. ukraiński, angielski) przy reklamach na PL.

WATPLIWE – wszystko pomiędzy, w szczególności: granica fitness/zdrowie (np. fizjoterapia, postawa, oddech), brak danych ze strony (nieosiągalna), produkt niejasny, usługi + kurs, bizz-opp konkretnego fachu (to jest OK, ale sprawdź czy nie marketingowy).
Zasada: gdy nie masz pewności, dawaj "watpliwe", nie "nie". Człowiek czyta "pasuje" i "watpliwe" i podejmuje decyzję.

Odpowiadasz WYŁĄCZNIE tablicą JSON: [{"page_id":"...","verdict":"pasuje|watpliwe|nie","why":"..."}] – po jednym wpisie na każdego kandydata, bez komentarza.`;
