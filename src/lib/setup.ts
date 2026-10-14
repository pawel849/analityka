// Przewodnik „Zbuduj ze mną”: definicje kroków, modeli lejków, źródeł ruchu i budowa mapy z odpowiedzi.
// Czyste funkcje – używane w przeglądarce (kreator) i w testach.
import { CATALOG_BY_KIND, type NodeData } from "./catalog.ts";
import { fold } from "./csv.ts";

export type PageRole = "page" | "lead" | "thankyou_lead" | "video" | "checkout" | "thankyou_purchase";

export interface SetupPage {
  id: string;
  name: string;
  url: string;
  role: PageRole;
  /** Przykładowy adres (podpowiedź w polu) – prawdziwy adres wpisuje użytkownik. */
  example?: string;
}

export interface SetupState {
  mode?: "guided" | "self";
  step?: string;
  done?: boolean;
  hidden?: boolean;
  offer?: string;
  model?: string;
  builder?: string;
  sales?: string;
  sources?: string[];
  pages?: SetupPage[];
  campaignHint?: string;
  funnelId?: string;
  metrics?: string[];
  skipped?: string[];
}

export const STEPS: { key: string; title: string; short: string }[] = [
  { key: "biznes", title: "Twój biznes", short: "Biznes" },
  { key: "strony", title: "Strony lejka", short: "Strony" },
  { key: "skrypt", title: "Skrypt śledzący na stronach", short: "Skrypt" },
  { key: "zrodla", title: "Linki z reklam i postów", short: "Źródła" },
  { key: "konwersje", title: "Zapisy i zakupy", short: "Konwersje" },
  { key: "koszty", title: "Koszty reklam", short: "Koszty" },
  { key: "mapa", title: "Mapa lejka", short: "Mapa" },
  { key: "metryki", title: "Metryki", short: "Metryki" },
  { key: "gotowe", title: "Gotowe – co dalej", short: "Gotowe" },
];

export const ROLES: { value: PageRole; label: string; kind: string; help: string }[] = [
  { value: "page", label: "Zwykła strona", kind: "landing", help: "Strona do przeczytania / obejrzenia, bez formularza." },
  { value: "lead", label: "Formularz zapisu", kind: "optin", help: "Strona, na której ktoś zostawia e-mail (zapis, rejestracja)." },
  { value: "thankyou_lead", label: "Podziękowanie po zapisie", kind: "thankyou", help: "Strona, na którą trafia osoba po zapisie." },
  { value: "video", label: "Wideo / webinar", kind: "vsl", help: "Strona z nagraniem albo pokój webinaru." },
  { value: "checkout", label: "Formularz zamówienia", kind: "checkout", help: "Koszyk / kasa / formularz płatności." },
  { value: "thankyou_purchase", label: "Podziękowanie po zakupie", kind: "thankyou", help: "Strona po opłaceniu zamówienia." },
];

type P = [name: string, role: PageRole, example: string];

export const MODELS: { id: string; label: string; description: string; pages: P[] }[] = [
  {
    id: "webinar",
    label: "Webinar",
    description: "Zapis na webinar → webinar → oferta → zakup",
    pages: [
      ["Rejestracja na webinar", "lead", "/webinar"],
      ["Podziękowanie po zapisie", "thankyou_lead", "/webinar-dziekujemy"],
      ["Pokój webinaru", "video", "/webinar-live"],
      ["Oferta", "page", "/oferta"],
      ["Zamówienie", "checkout", "/zamowienie"],
      ["Podziękowanie po zakupie", "thankyou_purchase", "/dziekujemy"],
    ],
  },
  {
    id: "lead_magnet",
    label: "Lead magnet",
    description: "Darmowy materiał za e-mail → oferta → zakup",
    pages: [
      ["Strona zapisu", "lead", "/zapis"],
      ["Podziękowanie / pobranie", "thankyou_lead", "/pobierz"],
      ["Oferta", "page", "/oferta"],
      ["Zamówienie", "checkout", "/zamowienie"],
      ["Podziękowanie po zakupie", "thankyou_purchase", "/dziekujemy"],
    ],
  },
  {
    id: "vsl",
    label: "Wideo sprzedażowe (VSL)",
    description: "Strona z wideo → zamówienie → zakup",
    pages: [
      ["Strona z wideo", "video", "/wideo"],
      ["Zamówienie", "checkout", "/zamowienie"],
      ["Podziękowanie po zakupie", "thankyou_purchase", "/dziekujemy"],
    ],
  },
  {
    id: "shop",
    label: "Sklep internetowy",
    description: "Produkt → koszyk → zakup",
    pages: [
      ["Strona główna", "page", "/"],
      ["Strona produktu", "page", "/produkt/*"],
      ["Zamówienie", "checkout", "/zamowienie"],
      ["Podziękowanie po zakupie", "thankyou_purchase", "/dziekujemy"],
    ],
  },
  {
    id: "call",
    label: "Rozmowa sprzedażowa",
    description: "Strona → ankieta → rezerwacja rozmowy",
    pages: [
      ["Strona oferty", "page", "/"],
      ["Ankieta / zgłoszenie", "lead", "/ankieta"],
      ["Rezerwacja rozmowy", "page", "/rezerwacja"],
      ["Potwierdzenie rezerwacji", "thankyou_lead", "/potwierdzenie"],
    ],
  },
  { id: "custom", label: "Inny / własny", description: "Ułożysz strony samodzielnie", pages: [] },
];

export interface SourceDef {
  id: string;
  label: string;
  kind: string;
  paid: boolean;
  /** utm_source w generowanych linkach – unikalny, żeby płatne i organiczne się nie myliły. */
  utmSource?: string;
  utmMedium?: string;
  match: string;
  /** Gdzie wkleić link / parametry. */
  where: string;
  /** Skąd koszty: meta = połączenie API, google = import CSV z Google Ads, csv = import CSV, manual = ręcznie w węźle. */
  costs?: "meta" | "google" | "csv";
  /** Parametry dla reklam (z makrami platformy), jeśli platforma je wspiera. */
  adParams?: string;
}

export const SOURCES: SourceDef[] = [
  {
    id: "meta_ads", label: "Reklamy Facebook / Instagram (Meta)", kind: "meta_ads", paid: true, utmSource: "ads_meta", utmMedium: "paid", match: "ads_meta", costs: "meta",
    adParams: "utm_source=ads_meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}",
    where: "Menedżer reklam → edycja reklamy → sekcja „Śledzenie” → pole „Parametry URL” (nazwy w polskim interfejsie mogą się nieco różnić). Wklej parametry poniżej – Meta sama podstawi nazwę kampanii i reklamy. Zrób to w każdej reklamie (można zaznaczyć kilka i edytować razem).",
  },
  {
    id: "google_ads", label: "Reklamy Google (wyszukiwarka)", kind: "google_ads", paid: true, utmSource: "ads_google", utmMedium: "cpc", match: "ads_google", costs: "google",
    adParams: "utm_source=ads_google&utm_medium=cpc&utm_campaign={campaignid}",
    where: "Google Ads → kampania → Ustawienia → „Opcje adresu URL kampanii” → „Sufiks końcowego adresu URL”. Wklej parametry poniżej ({campaignid} Google podstawi sam).",
  },
  {
    id: "youtube_ads", label: "Reklamy YouTube", kind: "youtube_ads", paid: true, utmSource: "ads_youtube", utmMedium: "paid", match: "ads_youtube", costs: "google",
    adParams: "utm_source=ads_youtube&utm_medium=paid&utm_campaign={campaignid}",
    where: "Reklamy YouTube ustawiasz w Google Ads – tak samo jak wyżej: kampania → Ustawienia → „Sufiks końcowego adresu URL”.",
  },
  {
    id: "tiktok_ads", label: "Reklamy TikTok", kind: "tiktok", paid: true, utmSource: "ads_tiktok", utmMedium: "paid", match: "ads_tiktok", costs: "csv",
    where: "TikTok Ads Manager → reklama → adres strony docelowej: wklej gotowy link poniżej (z parametrami).",
  },
  {
    id: "linkedin_ads", label: "Reklamy LinkedIn", kind: "linkedin", paid: true, utmSource: "ads_linkedin", utmMedium: "paid", match: "ads_linkedin", costs: "csv",
    where: "LinkedIn Campaign Manager → reklama → adres URL strony docelowej: wklej gotowy link poniżej.",
  },
  { id: "facebook", label: "Facebook (posty, grupy – bez reklam)", kind: "facebook_org", paid: false, utmSource: "facebook.com", utmMedium: "social", match: "facebook.com", where: "Używaj tego linku w postach, komentarzach i opisach na Facebooku." },
  { id: "instagram", label: "Instagram (bio, stories – bez reklam)", kind: "instagram", paid: false, utmSource: "instagram.com", utmMedium: "social", match: "instagram.com", where: "Wklej ten link w bio, stories (naklejka z linkiem) i wiadomościach." },
  { id: "youtube", label: "YouTube (filmy – bez reklam)", kind: "youtube", paid: false, utmSource: "youtube.com", utmMedium: "social", match: "youtube.com,youtu.be", where: "Wklej ten link w opisach filmów, komentarzu przypiętym i na karcie kanału." },
  { id: "tiktok", label: "TikTok (bez reklam)", kind: "tiktok_org", paid: false, utmSource: "tiktok.com", utmMedium: "social", match: "tiktok.com", where: "Wklej ten link w bio profilu." },
  { id: "linkedin", label: "LinkedIn (posty – bez reklam)", kind: "linkedin_org", paid: false, utmSource: "linkedin.com", utmMedium: "social", match: "linkedin.com,lnkd.in", where: "Używaj tego linku w postach i na profilu." },
  { id: "email", label: "Newsletter / e-maile (MailerLite, GetResponse…)", kind: "email", paid: false, utmSource: "newsletter", utmMedium: "email", match: "newsletter", where: "Wklej ten link w przyciskach i linkach w e-mailach (również w automatyzacjach)." },
  { id: "google_organic", label: "Google bez reklam (SEO)", kind: "google_search", paid: false, match: "google.com,google.pl", where: "Nic nie trzeba robić – wejścia z wyszukiwarki rozpoznają się same." },
  { id: "direct", label: "Wejścia bezpośrednie", kind: "direct", paid: false, match: "(direct)", where: "Nic nie trzeba robić – to osoby, które wpisały adres lub kliknęły link bez parametrów." },
];

export const BUILDERS: { id: string; label: string; steps: string[]; sure: boolean }[] = [
  {
    id: "wordpress",
    label: "WordPress",
    sure: true,
    steps: [
      "W panelu WordPress: Wtyczki → Dodaj nową → wyszukaj „WPCode” → Zainstaluj → Włącz.",
      "Code Snippets (lub „Fragmenty kodu”) → Header & Footer → pole „Header”.",
      "Wklej skrypt poniżej i kliknij Zapisz. Działa od razu na wszystkich stronach witryny.",
    ],
  },
  {
    id: "getresponse",
    label: "GetResponse (landing pages / kreator stron)",
    sure: false,
    steps: [
      "Otwórz stronę w edytorze GetResponse i poszukaj w ustawieniach strony pola na własny kod w nagłówku (np. „Kod śledzący”, „Tracking”, „<head>”).",
      "Wklej skrypt poniżej, zapisz i opublikuj stronę ponownie. Powtórz dla każdej strony lejka.",
    ],
  },
  {
    id: "mailerlite",
    label: "MailerLite (landing pages / strony)",
    sure: false,
    steps: [
      "Otwórz stronę w edytorze MailerLite i poszukaj w ustawieniach strony opcji własnego kodu w nagłówku (np. „Custom code”, „<head>”).",
      "Wklej skrypt poniżej, zapisz i opublikuj stronę ponownie. Powtórz dla każdej strony lejka.",
    ],
  },
  {
    id: "kajabi",
    label: "Kajabi",
    sure: false,
    steps: [
      "W ustawieniach witryny Kajabi poszukaj pola na skrypty strony (np. „Page Scripts” / „Header page scripts”).",
      "Wklej skrypt poniżej i zapisz. Sprawdź też strony kasy Kajabi, jeśli pozwalają na własny kod.",
    ],
  },
  {
    id: "html",
    label: "Własny kod / programista",
    sure: true,
    steps: ["Wklej skrypt poniżej w sekcji <head> każdej strony (przed </head>) – albo przekaż ten krok programiście razem ze skryptem."],
  },
  {
    id: "other",
    label: "Inne narzędzie",
    sure: false,
    steps: [
      "Poszukaj w ustawieniach strony pola „własny kod”, „skrypty”, „kod śledzący”, „head” lub „Google Analytics / Pixel – własny kod”.",
      "Wklej skrypt poniżej i opublikuj stronę ponownie. Jeśli narzędzie nie pozwala na własny kod – tej strony nie da się mierzyć skryptem.",
    ],
  },
];

export const SALES: { id: string; label: string }[] = [
  { id: "woocommerce", label: "WooCommerce" },
  { id: "stripe", label: "Stripe (linki płatności / Checkout)" },
  { id: "publigo", label: "Publigo" },
  { id: "kajabi", label: "Kajabi" },
  { id: "other", label: "Inny system płatności" },
  { id: "none", label: "Nie sprzedaję online (np. rozmowa, faktura)" },
];

export const METRIC_PRESETS: { id: string; name: string; formula: string; format: string; help: string }[] = [
  { id: "profit", name: "Zysk z reklam", formula: "revenue - spend", format: "money", help: "Przychód minus wydatki na reklamy." },
  { id: "rev_visitor", name: "Przychód na odwiedzającego", formula: "revenue / visitors", format: "money", help: "Ile średnio zarabiasz na jednej osobie na stronie." },
  { id: "cost_visitor", name: "Koszt odwiedzającego", formula: "spend / visitors", format: "money", help: "Ile płacisz za jedną osobę na stronie." },
  { id: "visit_lead", name: "Konwersja odwiedzający → zapis", formula: "leads / visitors", format: "percent", help: "Jaki procent odwiedzających zostawia e-mail." },
  { id: "lead_sale", name: "Konwersja zapis → zakup", formula: "sales / leads", format: "percent", help: "Jaki procent zapisanych kupuje." },
  { id: "rev_lead", name: "Wartość jednego zapisu", formula: "revenue / leads", format: "money", help: "Ile przychodu daje średnio jeden zapis – porównaj z CPL." },
];

/** Metryki wbudowane, które opisujemy w kroku „Metryki” (są zawsze widoczne pod mapą w trybie Analiza). */
export const BUILTIN_EXPLAINED: [string, string][] = [
  ["ROAS", "przychód ÷ wydatki – ile złotych wraca z każdej złotówki na reklamy"],
  ["Koszt leada (CPL)", "wydatki ÷ liczba zapisów"],
  ["Koszt sprzedaży (CPA)", "wydatki ÷ liczba zakupów"],
  ["Hook rate", "odtworzenia 3 s ÷ wyświetlenia reklamy (czy początek wideo zatrzymuje)"],
  ["CTR reklam", "kliknięcia ÷ wyświetlenia reklamy"],
  ["CTR stron", "kliknięcia w przyciski/linki ÷ odsłony strony"],
  ["Konwersja na sprzedaż", "kupujący ÷ odwiedzający"],
  ["Średnia wartość zamówienia", "przychód ÷ liczba zakupów"],
];

/** Pełny adres lub ścieżka → wzorzec ścieżki dla węzła mapy (np. „https://a.pl/zapis/” → „/zapis”). */
export function pathOf(url: string): string {
  const s = url.trim();
  if (!s) return "";
  if (s.startsWith("/")) return s;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
    const p = u.pathname.replace(/\/+$/, "");
    return p || "/";
  } catch {
    return s;
  }
}

export function hostOf(url: string): string {
  const s = url.trim();
  if (!s || s.startsWith("/")) return "";
  try {
    return new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Link z parametrami UTM dla danego źródła. */
export function utmLink(pageUrl: string, src: SourceDef, campaign = ""): string {
  if (!src.utmSource) return pageUrl;
  const base = pageUrl.trim();
  if (!base) return "";
  const params = new URLSearchParams({ utm_source: src.utmSource, utm_medium: src.utmMedium ?? "" });
  if (campaign.trim()) params.set("utm_campaign", campaign.trim());
  const [noHash, hash] = base.split("#");
  return `${noHash}${noHash.includes("?") ? "&" : "?"}${params}${hash ? `#${hash}` : ""}`;
}

export function scriptTag(origin: string, key: string, domains: string[]): string {
  const d = domains.length > 1 ? ` data-domains="${domains.join(",")}"` : "";
  return `<script async src="${origin}/t.js" data-key="${key}" data-identify="forms"${d}></script>`;
}

export const PURCHASE_SNIPPET = (amount: string) =>
  `<script>window.anl=window.anl||function(){(anl.q=anl.q||[]).push(arguments)};anl("purchase", ${Number(amount.replace(",", ".")) || 0});</script>`;

interface GNode {
  id: string;
  type: "funnel";
  position: { x: number; y: number };
  data: NodeData;
}
interface GEdge {
  id: string;
  source: string;
  target: string;
  type: "flow";
  markerEnd: { type: "arrowclosed" };
}

/** Mapa lejka z odpowiedzi przewodnika: źródła → strony po kolei, z akcjami zapisu i zakupu. */
export function buildSetupGraph(s: SetupState): { nodes: GNode[]; edges: GEdge[] } {
  const COL = 260;
  const ROW = 170;
  const nodes: GNode[] = [];
  const edges: GEdge[] = [];
  const node = (id: string, kind: string, col: number, row: number, patch: Partial<NodeData>) => {
    const item = CATALOG_BY_KIND[kind];
    nodes.push({ id, type: "funnel", position: { x: col * COL, y: row * ROW }, data: { kind, category: item.category, label: item.label, ...item.defaults, ...patch } as NodeData });
  };
  const edge = (a: string, b: string) => edges.push({ id: `e_${a}_${b}`, source: a, target: b, type: "flow", markerEnd: { type: "arrowclosed" } });

  // Kolejność kroków: strona, a po niej akcja (formularz → zapis; podziękowanie po zakupie → zakup).
  const chain: string[] = [];
  let col = 1;
  for (const p of s.pages ?? []) {
    const role = ROLES.find((r) => r.value === p.role) ?? ROLES[0];
    const id = `p_${p.id}`;
    const path = pathOf(p.url);
    node(id, role.kind, col++, 0, { label: p.name || role.label, url: path });
    chain.push(id);
    if (p.role === "lead") {
      const a = `a_${p.id}`;
      node(a, "form_submit", col++, 0, { label: "Zapis (formularz)", pageUrl: path, goal: true, goalName: "Lead" });
      chain.push(a);
    }
    if (p.role === "thankyou_purchase") {
      const a = `a_${p.id}`;
      node(a, "purchase", col++, 0, { label: "Zakup", goal: true, goalName: "Sprzedaż" });
      chain.push(a);
    }
  }
  for (let i = 1; i < chain.length; i++) edge(chain[i - 1], chain[i]);

  const hint = (s.campaignHint ?? "").trim() || "*";
  const srcs = (s.sources ?? []).map((id) => SOURCES.find((x) => x.id === id)).filter((x): x is SourceDef => !!x);
  const startRow = -Math.floor((srcs.length - 1) / 2);
  srcs.forEach((src, i) => {
    const id = `s_${src.id}`;
    const patch: Partial<NodeData> = { label: src.label.replace(/ \(.*\)$/, ""), sourceMatch: src.match };
    if (src.costs === "meta") patch.adsMatch = `meta:${hint}`;
    if (src.costs === "google") patch.adsMatch = `google:${hint}`;
    node(id, src.kind, 0, startRow + i, patch);
    if (chain[0]) edge(id, chain[0]);
  });
  return { nodes, edges };
}

/** Prefiks w polu „Koszty z importu reklam”: „meta:” / „google:” zawęża do danych tej platformy. */
export const ADS_PLATFORM_SOURCES: Record<string, string[]> = {
  meta: ["meta", "meta_api"],
  google: ["google_ads"],
  inne: ["ads_other"],
};

/**
 * Pole „Koszty z importu reklam”: fragmenty nazw po przecinku. Prefiks „meta:”, „google:” lub „inne:” zawęża do danych
 * tej platformy, „*” = wszystkie reklamy (np. „meta:*”, „google:webinar”).
 */
export function parseAdsMatch(v: string): { sources: string[] | null; text: string }[] {
  return v
    .split(",")
    .map((raw) => {
      const m = raw.trim().match(/^([a-z]+):(.*)$/i);
      const platform = m ? m[1].toLowerCase() : "";
      const sources = platform && ADS_PLATFORM_SOURCES[platform] ? ADS_PLATFORM_SOURCES[platform] : null;
      const text = fold((sources ? m![2] : raw).trim());
      return { sources, text };
    })
    .filter((t) => t.text || t.sources);
}

export function adMatches(tokens: { sources: string[] | null; text: string }[], source: string, name: string): boolean {
  const n = fold(name);
  return tokens.some((t) => (!t.sources || t.sources.includes(source)) && (t.text === "*" || t.text === "" || n.includes(t.text)));
}

