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
  /** Źródło: dane z importu reklam – nazwa kampanii/zestawu/reklamy zawiera (po przecinku). */
  adsMatch?: string;
  /** Własna ikona (adres obrazka). */
  iconUrl?: string;
  /** Własny kolor akcentu węzła. */
  color?: string;
  /** Miniatura strony z obrazka (URL). */
  thumbnailUrl?: string;
  /** Lista zadań do wdrożenia elementu. */
  checklist?: ChecklistItem[];
  /** Akcja „zakup”: licz tylko zakupy zawierające te produkty (nazwy lub fragmenty nazw). */
  products?: string[];
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
  { value: "country", label: "kraj (kod, np. PL)" },
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
  /** Podgrupa w palecie (np. „Reklamy płatne”). */
  group: string;
  label: string;
  abbr: string;
  defaults?: Partial<NodeData>;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  source: "Źródła",
  page: "Strony",
  action: "Akcje",
  offline: "Ręczne",
};

/** Kolory znaczników podgrup (własne, bez logotypów marek). */
export const GROUP_COLORS: Record<string, string> = {
  "Reklamy płatne": "#0b6e4f",
  Wyszukiwarki: "#1f8a63",
  "Social (organicznie)": "#3fa47c",
  "Inne źródła": "#6dbd98",
  "CRM i e-mail": "#0b4a37",
  Komunikatory: "#2f7a5c",
  "Inne serwisy": "#5c7a6e",
  "Offline": "#0a3326",
  "Konwersje": "#0b6e4f",
  "Zaangażowanie": "#3fa47c",
  "Integracje (webhook)": "#0b4a37",
  "Własne": "#6f8a7f",
}

const src = (group: string, kind: string, label: string, abbr: string, match: string): CatalogItem => ({
  kind,
  category: "source",
  group,
  label,
  abbr,
  defaults: { sourceMatch: match },
});
const act = (group: string, kind: string, label: string, abbr: string, defaults: Partial<NodeData>): CatalogItem => ({
  kind,
  category: "action",
  group,
  label,
  abbr,
  defaults,
});
const page = (kind: string, label: string, abbr: string): CatalogItem => ({ kind, category: "page", group: "Strony", label, abbr });

const PAID = "Reklamy płatne";
const SEARCH = "Wyszukiwarki";
const SOCIAL = "Social (organicznie)";
const OTHER = "Inne źródła";
const CRM = "CRM i e-mail";
const MSG = "Komunikatory";
const SITES = "Inne serwisy";
const OFF = "Offline";

export const CATALOG: CatalogItem[] = [
  // Źródła – reklamy płatne (rozróżnienie płatne/organiczne: dodaj warunek utm_medium, np. „cpc”)
  src(PAID, "meta_ads", "Facebook Ads", "FB", "facebook,fb,meta"),
  src(PAID, "instagram_ads", "Instagram Ads", "IG", "instagram,ig"),
  src(PAID, "google_ads", "Google Ads", "GA", "google"),
  src(PAID, "bing_ads", "Bing Ads", "BA", "bing"),
  src(PAID, "linkedin", "LinkedIn Ads", "LI", "linkedin"),
  src(PAID, "youtube_ads", "YouTube Ads", "YT", "youtube"),
  src(PAID, "x_ads", "X Ads", "X", "twitter,x.com,x"),
  src(PAID, "tiktok", "TikTok Ads", "TT", "tiktok"),
  src(PAID, "pinterest_ads", "Pinterest Ads", "PI", "pinterest"),
  src(PAID, "reddit_ads", "Reddit Ads", "RD", "reddit"),
  // Wyszukiwarki
  src(SEARCH, "organic", "Wszystkie wyszukiwarki", "SE", "google.com,bing.com,duckduckgo.com,yahoo.com,ecosia.org"),
  src(SEARCH, "google_search", "Google (organicznie)", "G", "google.com,google.pl"),
  src(SEARCH, "bing_search", "Bing (organicznie)", "B", "bing.com"),
  src(SEARCH, "youtube", "YouTube (organicznie)", "YT", "youtube.com"),
  // Social organicznie
  src(SOCIAL, "facebook_org", "Facebook", "FB", "facebook.com"),
  src(SOCIAL, "instagram", "Instagram", "IG", "instagram.com"),
  src(SOCIAL, "linkedin_org", "LinkedIn", "LI", "linkedin.com,lnkd.in"),
  src(SOCIAL, "tiktok_org", "TikTok", "TT", "tiktok.com"),
  src(SOCIAL, "x_org", "X (Twitter)", "X", "t.co,x.com,twitter.com"),
  src(SOCIAL, "pinterest_org", "Pinterest", "PI", "pinterest.com,pin.it"),
  src(SOCIAL, "reddit_org", "Reddit", "RD", "reddit.com"),
  // Inne źródła
  src(OTHER, "email", "E-mail", "@", "mailerlite,getresponse,newsletter,email"),
  src(OTHER, "direct", "Wejścia bezpośrednie", "DI", "(direct)"),
  src(OTHER, "affiliate", "Partnerzy / afiliacja", "AF", "affiliate,partner"),
  { kind: "source_custom", category: "source", group: OTHER, label: "Inne źródło", abbr: "SR" },
  // CRM i e-mail marketing (oznaczaj linki utm_source=<nazwa>)
  src(CRM, "mailerlite", "MailerLite", "ML", "mailerlite"),
  src(CRM, "getresponse", "GetResponse", "GR", "getresponse"),
  src(CRM, "kajabi", "Kajabi", "KJ", "kajabi"),
  src(CRM, "activecampaign", "ActiveCampaign", "AC", "activecampaign"),
  src(CRM, "mailchimp", "Mailchimp", "MC", "mailchimp"),
  src(CRM, "hubspot", "HubSpot", "HS", "hubspot"),
  src(CRM, "ontraport", "Ontraport", "ON", "ontraport"),
  src(CRM, "keap", "Keap", "KP", "keap,infusionsoft"),
  src(CRM, "pipedrive", "Pipedrive", "PD", "pipedrive"),
  src(CRM, "intercom", "Intercom", "IC", "intercom"),
  src(CRM, "marketo", "Marketo", "MK", "marketo"),
  src(CRM, "constant_contact", "Constant Contact", "CC", "constantcontact,constant_contact"),
  src(CRM, "drip", "Drip", "DR", "drip"),
  src(CRM, "salesforce", "Salesforce", "SF", "salesforce"),
  // Komunikatory
  src(MSG, "chat_box", "Czat na stronie", "CZ", "chat,livechat"),
  src(MSG, "messenger", "Messenger", "MS", "messenger,m.me"),
  src(MSG, "whatsapp", "WhatsApp", "WA", "whatsapp,wa.me"),
  src(MSG, "telegram", "Telegram", "TG", "telegram,t.me"),
  src(MSG, "slack", "Slack", "SL", "slack"),
  src(MSG, "sms", "SMS", "SM", "sms"),
  src(MSG, "chatbot", "Chatbot", "BOT", "chatbot,manychat"),
  // Inne serwisy
  src(SITES, "zoho", "Zoho", "ZO", "zoho"),
  src(SITES, "yelp", "Yelp", "YE", "yelp"),
  src(SITES, "zendesk", "Zendesk", "ZD", "zendesk"),
  src(SITES, "drift", "Drift", "DF", "drift"),
  src(SITES, "gotomeeting", "GoToMeeting", "GTM", "gotomeeting"),
  src(SITES, "amazon", "Amazon", "AM", "amazon"),
  src(SITES, "zoom", "Zoom", "ZM", "zoom"),
  src(SITES, "gmail", "Gmail", "GM", "gmail,mail.google.com"),
  src(SITES, "spotify", "Spotify", "SP", "spotify"),
  src(SITES, "snapchat", "Snapchat", "SC", "snapchat"),
  src(SITES, "clutch", "Clutch", "CL", "clutch"),
  src(SITES, "google_maps", "Mapy Google", "MAP", "maps.google,google_maps,gmb"),
  // Offline (oznaczaj linki/QR kody utm_source=<nazwa>)
  src(OFF, "job_interview", "Rozmowa o pracę", "RP", "job_interview"),
  src(OFF, "print_ad", "Reklama w prasie", "PR", "print"),
  src(OFF, "conference", "Konferencja", "KF", "conference"),
  src(OFF, "online_meeting", "Spotkanie online", "SO", "online_meeting,webinar"),
  src(OFF, "banner", "Baner", "BN", "banner"),
  src(OFF, "direct_mail", "Direct mail", "DM", "direct_mail"),
  src(OFF, "tv_ad", "Reklama TV", "TV", "tv"),
  src(OFF, "biz_directory", "Katalog firm", "KT", "directory"),
  src(OFF, "workshop", "Warsztaty", "WS", "workshop"),
  src(OFF, "radio", "Radio", "RA", "radio"),
  src(OFF, "guest_blog", "Gościnny wpis", "GB", "guest_blog"),
  src(OFF, "job_site", "Portal z ofertami pracy", "PP", "job_site"),
  src(OFF, "meeting_src", "Spotkanie", "SP", "meeting"),
  src(OFF, "billboard", "Billboard", "BB", "billboard"),
  src(OFF, "business_card", "Wizytówka", "WZ", "business_card"),
  src(OFF, "career_site", "Strona kariery", "SK", "career"),
  src(OFF, "phone_src", "Telefon", "TEL", "phone"),
  src(OFF, "report", "Raport / e-book", "PDF", "report,ebook"),
  src(OFF, "qr_code", "Kod QR", "QR", "qr"),

  // Strony
  page("landing", "Landing page", "LP"),
  page("optin", "Strona zapisu (opt-in)", "OP"),
  page("download", "Strona pobrania", "DL"),
  page("popup", "Popup", "PU"),
  page("sales", "Strona sprzedażowa", "SP"),
  page("vsl", "VSL (strona z wideo)", "VS"),
  page("webinar_reg", "Rejestracja na webinar", "WR"),
  page("webinar", "Pokój webinaru", "WB"),
  page("replay", "Powtórka webinaru", "RP"),
  page("application", "Ankieta / aplikacja", "AP"),
  page("booking", "Rezerwacja rozmowy (kalendarz)", "KL"),
  page("checkout", "Formularz zamówienia", "ZA"),
  page("upsell", "Upsell", "UP"),
  page("downsell", "Downsell", "DS"),
  page("oto", "Oferta jednorazowa (OTO)", "OT"),
  page("thankyou", "Strona podziękowania", "TY"),
  page("members", "Strefa członkowska", "SC"),
  page("blog", "Artykuł / blog", "BL"),
  page("home", "Strona główna", "HM"),
  page("page_custom", "Inna strona", "PG"),

  // Akcje – konwersje
  act("Konwersje", "purchase", "Zakup", "ZK", { eventType: "purchase" }),
  act("Konwersje", "lead", "Zapis (lead)", "LD", { eventType: "lead" }),
  act("Konwersje", "form_submit", "Wypełniony formularz", "FS", { eventType: "form_submit" }),
  act("Konwersje", "booking_done", "Umówione spotkanie", "UM", { eventType: "booking" }),
  act("Konwersje", "deal_won", "Wygrana transakcja", "WT", { eventType: "custom", eventName: "deal_won" }),
  act("Konwersje", "add_to_cart", "Dodanie do koszyka", "KO", { eventType: "add_to_cart" }),
  // Akcje – zaangażowanie
  act("Zaangażowanie", "video_play", "Odtworzenie wideo", "VP", { eventType: "video_play" }),
  act("Zaangażowanie", "link_click", "Kliknięcie linku", "LK", { eventType: "link_click" }),
  act("Zaangażowanie", "button_click", "Kliknięcie przycisku", "BT", { eventType: "button_click" }),
  act("Zaangażowanie", "click", "Dowolne kliknięcie", "KL", { eventType: "click" }),
  act("Zaangażowanie", "scroll", "Przewinięcie strony", "SC", { eventType: "scroll", eventName: "75" }),
  act("Zaangażowanie", "deal_status", "Zmiana statusu transakcji", "ST", { eventType: "custom", eventName: "deal_status" }),
  // Akcje – integracje (dane przychodzą webhookiem: ?type=custom&name=<nazwa>)
  act("Integracje (webhook)", "ghl_appointment", "GHL – spotkanie", "GA", { eventType: "custom", eventName: "ghl_appointment" }),
  act("Integracje (webhook)", "ghl_order", "GHL – zamówienie", "GO", { eventType: "custom", eventName: "ghl_order" }),
  act("Integracje (webhook)", "ghl_opportunity", "GHL – szansa sprzedaży", "GS", { eventType: "custom", eventName: "ghl_opportunity" }),
  act("Integracje (webhook)", "ghl_opportunity_won", "GHL – szansa wygrana", "GW", { eventType: "custom", eventName: "ghl_opportunity_won" }),
  act("Integracje (webhook)", "hubspot_deal", "HubSpot – transakcja", "HD", { eventType: "custom", eventName: "hubspot_deal" }),
  act("Integracje (webhook)", "hubspot_deal_won", "HubSpot – transakcja wygrana", "HW", { eventType: "custom", eventName: "hubspot_deal_won" }),
  // Akcje – własne
  act("Własne", "action_custom", "Zdarzenie własne", "ZW", { eventType: "custom" }),

  // Ręczne (offline, liczby wpisywane ręcznie)
  { kind: "call", category: "offline", group: "Ręczne", label: "Rozmowa telefoniczna", abbr: "TL" },
  { kind: "meeting", category: "offline", group: "Ręczne", label: "Spotkanie", abbr: "SP" },
  { kind: "email_msg", category: "offline", group: "Ręczne", label: "Wiadomość e-mail", abbr: "EM" },
  { kind: "note", category: "offline", group: "Ręczne", label: "Notatka", abbr: "NT" },
];

export const CATALOG_BY_KIND: Record<string, CatalogItem> = Object.fromEntries(CATALOG.map((c) => [c.kind, c]));

export const EVENT_TYPES: { value: string; label: string }[] = [
  { value: "click", label: "Kliknięcie (dowolne)" },
  { value: "link_click", label: "Kliknięcie linku" },
  { value: "button_click", label: "Kliknięcie przycisku" },
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
