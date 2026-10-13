// Definicje importu: pola docelowe, gotowe ustawienia źródeł i automatyczne dopasowanie kolumn.
// Nazwy kolumn w gotowych ustawieniach to przypuszczenia – zawsze sprawdzane w podglądzie przed importem.
import { fold, parseDate, parseNumber } from "./csv.ts";

export type ImportKind = "ads" | "orders";

export interface FieldDef {
  key: string;
  label: string;
  required?: boolean;
  /** Fragmenty nazw kolumn (po fold), które dopasowują pole automatycznie. */
  hints: string[];
  type: "text" | "number" | "date";
}

export const AD_FIELDS: FieldDef[] = [
  { key: "period_start", label: "Początek okresu / data", required: true, type: "date", hints: ["poczatek raportowania", "reporting starts", "miesiac", "month", "day", "dzien", "data", "date"] },
  { key: "period_end", label: "Koniec okresu", type: "date", hints: ["koniec raportowania", "reporting ends"] },
  { key: "campaign", label: "Kampania", type: "text", hints: ["nazwa kampanii", "campaign name", "kampania", "campaign"] },
  { key: "adset", label: "Zestaw reklam", type: "text", hints: ["nazwa zestawu", "ad set name", "zestaw", "ad set", "ad group"] },
  { key: "ad", label: "Reklama", type: "text", hints: ["nazwa reklamy", "ad name", "reklama"] },
  { key: "spend", label: "Wydatki", required: true, type: "number", hints: ["wydana kwota", "amount spent", "spend", "wydatki", "koszt", "cost"] },
  { key: "impressions", label: "Wyświetlenia", type: "number", hints: ["wyswietlenia", "impressions"] },
  { key: "reach", label: "Zasięg", type: "number", hints: ["zasieg", "reach"] },
  { key: "clicks", label: "Kliknięcia linku", type: "number", hints: ["klikniecia linku", "link clicks", "klikniecia", "clicks"] },
  { key: "video_3s", label: "Odtworzenia 3 s", type: "number", hints: ["3 sek", "3-second", "3 s", "video plays at 3", "odtworzenia filmu"] },
  { key: "thruplay", label: "ThruPlay", type: "number", hints: ["thruplay"] },
  { key: "landing_views", label: "Wyświetlenia strony docelowej", type: "number", hints: ["strony docelowej", "landing page views"] },
  { key: "registrations", label: "Rejestracje", type: "number", hints: ["rejestracj", "registrations completed", "complete registration", "leady", "leads"] },
  { key: "add_to_cart", label: "Dodania do koszyka", type: "number", hints: ["do koszyka", "adds to cart"] },
  { key: "checkouts", label: "Rozpoczęcia płatności", type: "number", hints: ["rozpoczecia platnosci", "zainicjowan", "checkouts initiated"] },
  { key: "purchases", label: "Zakupy (z platformy)", type: "number", hints: ["zakupy", "purchases"] },
  { key: "purchase_value", label: "Wartość zakupów (z platformy)", type: "number", hints: ["wartosc konwersji zakupow", "purchases conversion value", "purchase value", "wartosc zakupow"] },
  { key: "title", label: "Nagłówek", type: "text", hints: ["naglowek", "headline", "title"] },
  { key: "body", label: "Treść", type: "text", hints: ["tresc", "body", "primary text", "tekst glowny"] },
];

export const ORDER_FIELDS: FieldDef[] = [
  { key: "order_ref", label: "Numer zamówienia", required: true, type: "text", hints: ["numer zamowienia", "order number", "order id", "id zamowienia", "zamowienie", "order", "id"] },
  { key: "ts", label: "Data zamówienia", required: true, type: "date", hints: ["data zamowienia", "order date", "date created", "data utworzenia", "data", "date", "created"] },
  { key: "email", label: "E-mail klienta", type: "text", hints: ["email", "e-mail", "adres e-mail", "billing email"] },
  { key: "gross", label: "Suma zamówienia (brutto)", type: "number", hints: ["suma", "order total", "total", "kwota", "wartosc", "amount", "brutto"] },
  { key: "item_price", label: "Cena pozycji (gdy wiersz = produkt)", type: "number", hints: ["cena produktu", "item cost", "line total", "item total", "cena pozycji"] },
  { key: "products", label: "Produkt(y)", type: "text", hints: ["produkty", "products", "nazwa produktu", "product name", "item name", "produkt", "items"] },
  { key: "status", label: "Status", type: "text", hints: ["status"] },
  { key: "coupon", label: "Kupon", type: "text", hints: ["kupon", "coupon"] },
];

export interface Preset {
  key: string;
  kind: ImportKind;
  label: string;
  note: string;
  /** Domyślne statusy uznawane za opłacone (po fold, przecinek). Puste = wszystkie. */
  paidStatuses?: string;
  productSeparator?: string;
}

export const PRESETS: Preset[] = [
  { key: "meta", kind: "ads", label: "Meta Ads (eksport z Menedżera reklam)", note: "Eksport z podziałem czasu (np. miesięcznym): wiersz = reklama × okres. Teksty reklam zwykle nie trafiają do eksportu CSV." },
  { key: "google_ads", kind: "ads", label: "Google Ads (raport)", note: "Raport kampanii/reklam z kolumną daty lub miesiąca, kosztem, wyświetleniami i kliknięciami." },
  { key: "ads_other", kind: "ads", label: "Inna platforma reklamowa", note: "Dowolny CSV z datą i wydatkami – resztę kolumn dopasuj ręcznie." },
  { key: "woocommerce", kind: "orders", label: "WooCommerce (eksport zamówień)", note: "Jeśli eksport ma wiersz na produkt, zamówienia z tym samym numerem zostaną połączone.", paidStatuses: "completed,processing,zrealizowane,w trakcie realizacji" },
  { key: "publigo", kind: "orders", label: "Publigo (historia płatności)", note: "Wybierz tylko opłacone zamówienia w polu statusów.", paidStatuses: "oplacone,oplacona,paid,completed" },
  { key: "orders_other", kind: "orders", label: "Inny sklep / system płatności", note: "Dowolny CSV z numerem, datą i kwotą zamówienia.", productSeparator: "," },
];

export function fieldsFor(kind: ImportKind): FieldDef[] {
  return kind === "ads" ? AD_FIELDS : ORDER_FIELDS;
}

/** Automatyczne mapowanie: pole → indeks kolumny (pierwsza wskazówka, która pasuje, wygrywa; kolumna użyta raz). */
export function autoMap(kind: ImportKind, headers: string[]): Record<string, number> {
  const folded = headers.map(fold);
  const used = new Set<number>();
  const map: Record<string, number> = {};
  for (const f of fieldsFor(kind)) {
    let found = -1;
    for (const h of f.hints) {
      // najpierw dokładne, potem „zawiera”
      found = folded.findIndex((c, i) => !used.has(i) && c === h);
      if (found < 0) found = folded.findIndex((c, i) => !used.has(i) && c.includes(h));
      if (found >= 0) break;
    }
    if (found >= 0) {
      map[f.key] = found;
      used.add(found);
    }
  }
  return map;
}

export interface AdRow {
  period_start: string;
  period_end: string;
  campaign: string;
  adset: string;
  ad: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  video_3s: number;
  thruplay: number;
  landing_views: number;
  registrations: number;
  add_to_cart: number;
  checkouts: number;
  purchases: number;
  purchase_value: number;
  title: string;
  body: string;
}

export interface OrderRow {
  order_ref: string;
  ts: string;
  email: string;
  gross: number;
  products: { name: string; price: number | null }[];
  coupon: string;
}

const AD_NUMERIC = ["spend", "impressions", "reach", "clicks", "video_3s", "thruplay", "landing_views", "registrations", "add_to_cart", "checkouts", "purchases", "purchase_value"] as const;

/** Wiersze reklam: brak daty lub wydatków = wiersz pominięty (zwracany w `skipped`). */
export function normalizeAds(rows: string[][], map: Record<string, number>): { rows: AdRow[]; skipped: number } {
  const get = (r: string[], k: string) => (map[k] != null ? r[map[k]] ?? "" : "");
  const out: AdRow[] = [];
  let skipped = 0;
  for (const r of rows) {
    const start = parseDate(get(r, "period_start"));
    if (!start) {
      skipped++;
      continue;
    }
    const end = parseDate(get(r, "period_end")) ?? start;
    const row: AdRow = {
      period_start: start.slice(0, 10),
      period_end: end.slice(0, 10),
      campaign: get(r, "campaign").trim(),
      adset: get(r, "adset").trim(),
      ad: get(r, "ad").trim(),
      title: get(r, "title").trim(),
      body: get(r, "body").trim(),
      spend: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      video_3s: 0,
      thruplay: 0,
      landing_views: 0,
      registrations: 0,
      add_to_cart: 0,
      checkouts: 0,
      purchases: 0,
      purchase_value: 0,
    };
    for (const k of AD_NUMERIC) row[k] = parseNumber(get(r, k)) ?? 0;
    // wiersze sumaryczne (np. „Wyniki łącznie”) bez nazw i bez daty końca są typowe w eksportach – pomijamy puste
    if (!row.campaign && !row.adset && !row.ad && row.spend === 0) {
      skipped++;
      continue;
    }
    out.push(row);
  }
  return { rows: out, skipped };
}

export interface OrderOptions {
  paidStatuses: string;
  productSeparator: string;
}

/** Wiersze zamówień; ten sam numer w kilku wierszach = jedno zamówienie z wieloma produktami. */
export function normalizeOrders(rows: string[][], map: Record<string, number>, opts: OrderOptions): { rows: OrderRow[]; skipped: number } {
  const get = (r: string[], k: string) => (map[k] != null ? r[map[k]] ?? "" : "");
  const allowed = opts.paidStatuses
    .split(",")
    .map((s) => fold(s))
    .filter(Boolean);
  const byRef = new Map<string, OrderRow & { itemSum: number; hasItemPrice: boolean }>();
  let skipped = 0;
  for (const r of rows) {
    const ref = get(r, "order_ref").trim();
    const ts = parseDate(get(r, "ts"));
    if (!ref || !ts) {
      skipped++;
      continue;
    }
    if (allowed.length && map.status != null && !allowed.includes(fold(get(r, "status")))) {
      skipped++;
      continue;
    }
    const itemPrice = parseNumber(get(r, "item_price"));
    const names = splitProducts(get(r, "products"), opts.productSeparator);
    let o = byRef.get(ref);
    if (!o) {
      o = {
        order_ref: ref,
        ts,
        email: get(r, "email").trim().toLowerCase(),
        gross: parseNumber(get(r, "gross")) ?? 0,
        products: [],
        coupon: get(r, "coupon").trim(),
        itemSum: 0,
        hasItemPrice: false,
      };
      byRef.set(ref, o);
    }
    if (itemPrice != null) {
      o.itemSum += itemPrice;
      o.hasItemPrice = true;
    }
    for (const name of names) o.products.push({ name, price: names.length === 1 ? itemPrice : null });
    if (!o.email) o.email = get(r, "email").trim().toLowerCase();
  }
  const out: OrderRow[] = [];
  for (const o of byRef.values()) {
    const { itemSum, hasItemPrice, ...rest } = o;
    out.push({ ...rest, gross: rest.gross || (hasItemPrice ? itemSum : 0) });
  }
  return { rows: out, skipped };
}

function splitProducts(v: string, sep: string): string[] {
  const s = v.trim();
  if (!s) return [];
  const parts = sep ? s.split(sep === "\\n" ? /\r?\n/ : sep) : [s];
  return parts
    .map((p) => p.replace(/\s*[×x]\s*\d+\s*$/i, "").trim())
    .filter(Boolean);
}

/** Skrót e-maila (SHA-256, 16 znaków hex) – liczony w przeglądarce, e-mail nie trafia na serwer. */
export async function hashEmail(email: string): Promise<string> {
  const e = email.trim().toLowerCase();
  if (!e) return "";
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(e));
  return [...new Uint8Array(buf)]
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
