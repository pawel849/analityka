// Katalog elementów mapy lejka. Wspólny dla klienta i serwera.

export type Category = "source" | "page" | "action" | "offline";

export interface NodeData {
  kind: string;
  category: Category;
  label: string;
  /** Strona: fragment adresu URL / ścieżki, po którym rozpoznajemy odsłony. */
  url?: string;
  /** Źródło: wartości utm_source (po przecinku) lub domeny odsyłające. */
  sourceMatch?: string;
  /** Akcja: typ zdarzenia ze skryptu śledzącego. */
  eventType?: string;
  /** Akcja: nazwa zdarzenia lub tekst przycisku (opcjonalnie). */
  eventName?: string;
  /** Akcja: ogranicz do strony o adresie zawierającym ten fragment. */
  pageUrl?: string;
  notes?: string;
  /** Strona: dodatkowe adresy URL (wystarczy dopasowanie jednego). */
  urls?: string[];
  /** Warunki klucz / wartość (UTM, parametry adresu itd.). Wszystkie muszą być spełnione. */
  filters?: NodeFilter[];
  /** Cel konwersji. */
  goal?: boolean;
  goalName?: string;
  /** Wartość jednej konwersji celu (ujemna = koszt). */
  goalValue?: number;
  /** Własny kolor akcentu węzła. */
  color?: string;
  /** Miniatura strony z obrazka (URL). */
  thumbnailUrl?: string;
  /** Lista zadań do wdrożenia elementu. */
  checklist?: ChecklistItem[];
  /** Prognozowana liczba osób na okres. */
  forecast?: { period: "day" | "week" | "month"; people: number };
  [key: string]: unknown;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface NodeFilter {
  key: string;
  op: "eq" | "neq" | "contains" | "not_contains" | "empty" | "not_empty";
  value: string;
}

export const FILTER_KEYS: { value: string; label: string }[] = [
  { value: "utm_source", label: "utm_source" },
  { value: "utm_medium", label: "utm_medium" },
  { value: "utm_campaign", label: "utm_campaign" },
  { value: "utm_content", label: "utm_content" },
  { value: "utm_term", label: "utm_term" },
  { value: "source", label: "źródło (utm lub odsyłacz)" },
  { value: "path", label: "ścieżka strony" },
  { value: "element", label: "tekst klikniętego elementu" },
  { value: "name", label: "nazwa zdarzenia" },
];

export const FILTER_OPS: { value: NodeFilter["op"]; label: string }[] = [
  { value: "eq", label: "równa się" },
  { value: "neq", label: "różne od" },
  { value: "contains", label: "zawiera" },
  { value: "not_contains", label: "nie zawiera" },
  { value: "not_empty", label: "jest ustawione" },
  { value: "empty", label: "jest puste" },
];

export interface CatalogItem {
  kind: string;
  category: Category;
  label: string;
  abbr: string;
  defaults?: Partial<NodeData>;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  source: "Źródła ruchu",
  page: "Strony",
  action: "Akcje",
  offline: "Offline / inne",
};

export const CATALOG: CatalogItem[] = [
  // Źródła ruchu
  { kind: "meta_ads", category: "source", label: "Meta Ads", abbr: "FB", defaults: { sourceMatch: "facebook,fb,instagram,ig,meta" } },
  { kind: "google_ads", category: "source", label: "Google Ads", abbr: "GA", defaults: { sourceMatch: "google" } },
  { kind: "youtube", category: "source", label: "YouTube", abbr: "YT", defaults: { sourceMatch: "youtube,youtube.com" } },
  { kind: "tiktok", category: "source", label: "TikTok", abbr: "TT", defaults: { sourceMatch: "tiktok" } },
  { kind: "linkedin", category: "source", label: "LinkedIn", abbr: "IN", defaults: { sourceMatch: "linkedin" } },
  { kind: "instagram", category: "source", label: "Instagram (organicznie)", abbr: "IG", defaults: { sourceMatch: "instagram.com" } },
  { kind: "email", category: "source", label: "E-mail", abbr: "@", defaults: { sourceMatch: "mailerlite,getresponse,newsletter,email" } },
  { kind: "sms", category: "source", label: "SMS", abbr: "SM", defaults: { sourceMatch: "sms" } },
  { kind: "organic", category: "source", label: "Wyszukiwarka (SEO)", abbr: "SE", defaults: { sourceMatch: "google.com,bing.com,duckduckgo.com" } },
  { kind: "affiliate", category: "source", label: "Partner / afiliacja", abbr: "AF", defaults: { sourceMatch: "affiliate,partner" } },
  { kind: "direct", category: "source", label: "Wejścia bezpośrednie", abbr: "DI", defaults: { sourceMatch: "(direct)" } },
  { kind: "source_custom", category: "source", label: "Inne źródło", abbr: "SR" },

  // Strony
  { kind: "landing", category: "page", label: "Landing page", abbr: "LP" },
  { kind: "optin", category: "page", label: "Strona zapisu (opt-in)", abbr: "OP" },
  { kind: "download", category: "page", label: "Strona pobrania", abbr: "DL" },
  { kind: "popup", category: "page", label: "Popup", abbr: "PU" },
  { kind: "sales", category: "page", label: "Strona sprzedażowa", abbr: "SP" },
  { kind: "vsl", category: "page", label: "VSL (strona z wideo)", abbr: "VS" },
  { kind: "webinar_reg", category: "page", label: "Rejestracja na webinar", abbr: "WR" },
  { kind: "webinar", category: "page", label: "Pokój webinaru", abbr: "WB" },
  { kind: "replay", category: "page", label: "Powtórka webinaru", abbr: "RP" },
  { kind: "application", category: "page", label: "Ankieta / aplikacja", abbr: "AP" },
  { kind: "booking", category: "page", label: "Rezerwacja rozmowy", abbr: "KL" },
  { kind: "checkout", category: "page", label: "Formularz zamówienia", abbr: "ZA" },
  { kind: "upsell", category: "page", label: "Upsell", abbr: "UP" },
  { kind: "downsell", category: "page", label: "Downsell", abbr: "DS" },
  { kind: "oto", category: "page", label: "Oferta jednorazowa (OTO)", abbr: "OT" },
  { kind: "thankyou", category: "page", label: "Strona podziękowania", abbr: "TY" },
  { kind: "members", category: "page", label: "Strefa członkowska", abbr: "SC" },
  { kind: "blog", category: "page", label: "Artykuł / blog", abbr: "BL" },
  { kind: "home", category: "page", label: "Strona główna", abbr: "HM" },
  { kind: "page_custom", category: "page", label: "Inna strona", abbr: "PG" },

  // Akcje
  { kind: "click", category: "action", label: "Kliknięcie", abbr: "KL", defaults: { eventType: "click" } },
  { kind: "lead", category: "action", label: "Zapis (lead)", abbr: "LD", defaults: { eventType: "lead" } },
  { kind: "form_submit", category: "action", label: "Wysłanie formularza", abbr: "FS", defaults: { eventType: "form_submit" } },
  { kind: "purchase", category: "action", label: "Zakup", abbr: "ZK", defaults: { eventType: "purchase" } },
  { kind: "add_to_cart", category: "action", label: "Dodanie do koszyka", abbr: "KO", defaults: { eventType: "add_to_cart" } },
  { kind: "video_play", category: "action", label: "Odtworzenie wideo", abbr: "VP", defaults: { eventType: "video_play" } },
  { kind: "scroll", category: "action", label: "Przewinięcie strony", abbr: "SC", defaults: { eventType: "scroll", eventName: "75" } },
  { kind: "booking_done", category: "action", label: "Umówione spotkanie", abbr: "UM", defaults: { eventType: "booking" } },
  { kind: "action_custom", category: "action", label: "Zdarzenie własne", abbr: "ZW", defaults: { eventType: "custom" } },

  // Offline / inne
  { kind: "call", category: "offline", label: "Rozmowa telefoniczna", abbr: "TL" },
  { kind: "meeting", category: "offline", label: "Spotkanie", abbr: "SP" },
  { kind: "email_msg", category: "offline", label: "Wiadomość e-mail", abbr: "EM" },
  { kind: "note", category: "offline", label: "Notatka", abbr: "NT" },
];

export const CATALOG_BY_KIND: Record<string, CatalogItem> = Object.fromEntries(CATALOG.map((c) => [c.kind, c]));

export const EVENT_TYPES: { value: string; label: string }[] = [
  { value: "click", label: "Kliknięcie" },
  { value: "lead", label: "Zapis (lead)" },
  { value: "form_submit", label: "Wysłanie formularza" },
  { value: "purchase", label: "Zakup" },
  { value: "add_to_cart", label: "Dodanie do koszyka" },
  { value: "video_play", label: "Odtworzenie wideo" },
  { value: "scroll", label: "Przewinięcie (próg %)" },
  { value: "booking", label: "Umówione spotkanie" },
  { value: "custom", label: "Zdarzenie własne" },
];

/** Dane ręczne, które można wpisać dla węzła danej kategorii. */
export const MANUAL_METRICS: Record<Category, { key: string; label: string }[]> = {
  source: [
    { key: "spend", label: "Wydatki (PLN)" },
    { key: "impressions", label: "Wyświetlenia" },
    { key: "clicks", label: "Kliknięcia w reklamę" },
    { key: "video_3s", label: "Odtworzenia wideo 3 s" },
    { key: "visitors", label: "Odwiedzający (nadpisz)" },
  ],
  page: [
    { key: "visitors", label: "Odwiedzający (nadpisz)" },
    { key: "pageviews", label: "Odsłony (nadpisz)" },
    { key: "cta_clicks", label: "Kliknięcia CTA (nadpisz)" },
  ],
  action: [
    { key: "conversions", label: "Konwersje (nadpisz)" },
    { key: "revenue", label: "Przychód (PLN)" },
  ],
  offline: [
    { key: "conversions", label: "Liczba (np. rozmów)" },
    { key: "revenue", label: "Przychód (PLN)" },
    { key: "spend", label: "Koszt (PLN)" },
  ],
};
