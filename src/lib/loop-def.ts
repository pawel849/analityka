// Definicje sesji analitycznej – bez zależności od bazy (używane też w przeglądarce).

export const STEPS = [
  { key: "cel", title: "Okres, cel i zakres" },
  { key: "predykcja", title: "Twoja predykcja" },
  { key: "rzeczywistosc", title: "Wynik vs cel" },
  { key: "luka", title: "Luka" },
  { key: "kwota", title: "Gdzie leżą pieniądze" },
  { key: "pytania", title: "Pytania" },
  { key: "analiza", title: "Analiza Claude" },
  { key: "decyzja", title: "Decyzja" },
  { key: "kalendarz", title: "Plan działań" },
  { key: "rozstrzygniecie", title: "Sprawdzenie decyzji" },
  { key: "raport", title: "Raport" },
] as const;
export type StepKey = (typeof STEPS)[number]["key"];

/** Etap, którego dotyczy zmiana (zwycięskie elementy). */
export const ELEMENTS = ["reklama", "mail", "strona", "VSL", "checkout", "oferta", "inne"] as const;
export const MEASURE_TASK = "Sprawdzić, czy pomiar działa";
export const VERDICTS = ["tak", "nie", "za mało danych"] as const;
export const NO_CHANGE = "nic nie zmieniam";
/** Fraza, którą trzeba wpisać przed nową sesją, gdy jest poprzedni raport. */
export const REVIEW_PHRASE = "przejrzałem poprzedni raport";
export const phraseOk = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ") === REVIEW_PHRASE;

/** Ludzkie nazwy dźwigni (metryk modelu). */
export const LEVER_NAMES: Record<string, { name: string; short: string }> = {
  cpm: { name: "Tańsze wyświetlenia", short: "CPM" },
  ctr: { name: "Więcej kliknięć w reklamę", short: "CTR" },
  cr: { name: "Więcej zakupów po kliknięciu", short: "CR" },
  aov: { name: "Większy koszyk", short: "AOV" },
  e_list: { name: "Więcej osób na liście", short: "osoby/wysyłkę" },
  e_freq: { name: "Więcej wysyłek", short: "wysyłki/mies." },
  e_open: { name: "Więcej otwarć maili", short: "open rate" },
  e_ctor: { name: "Więcej kliknięć w mailu", short: "CTOR" },
  e_cr: { name: "Więcej zakupów z maila", short: "CR maila" },
};

/** „Gdzie leżą pieniądze”: kategoria → jej dźwignie. Decyzja może dotyczyć całej kategorii („cat:…”) albo jednej dźwigni. */
export const CATEGORIES = [
  { key: "ads", name: "Reklamy", element: "reklama", levers: ["cpm", "ctr"] },
  { key: "email", name: "Maile", element: "mail", levers: ["e_list", "e_freq", "e_open", "e_ctor", "e_cr"] },
  { key: "page", name: "Strona / VSL", element: "strona", levers: ["cr"] },
  { key: "offer", name: "Oferta i koszyk", element: "oferta", levers: ["aov"] },
] as const;
export type CatKey = (typeof CATEGORIES)[number]["key"];
export const CAT = "cat:";
export const isCat = (k: string | null | undefined): k is `cat:${CatKey}` => !!k && k.startsWith(CAT) && CATEGORIES.some((c) => `${CAT}${c.key}` === k);
export const catOfLever = (k: string) => CATEGORIES.find((c) => (c.levers as readonly string[]).includes(k)) ?? null;
export const catByKey = (k: string) => CATEGORIES.find((c) => c.key === k || `${CAT}${c.key}` === k) ?? null;
/** Nazwa dźwigni albo kategorii (do decyzji, raportu, nauki). */
export const targetName = (k: string | null | undefined) => (!k ? "" : isCat(k) ? `${catByKey(k)!.name} (cała kategoria)` : LEVER_NAMES[k]?.name ?? k);
export const isEmailLever = (k: string | null | undefined) => !!k && k.startsWith("e_");
/** Format wartości metryki (procent / zł / liczba). */
export function fmtMetric(k: string | null | undefined, v: number | null | undefined): string {
  if (v == null || !k) return "brak danych";
  if (k === "ctr" || k === "cr" || k === "e_open" || k === "e_ctor" || k === "e_cr") return `${(v * 100).toLocaleString("pl-PL", { maximumFractionDigits: 2 })}%`;
  if (k === "e_list") return `${Math.round(v).toLocaleString("pl-PL")} os.`;
  if (k === "e_freq") return `${v.toLocaleString("pl-PL", { maximumFractionDigits: 1 })} / mies.`;
  return `${v.toLocaleString("pl-PL", { maximumFractionDigits: 2 })} zł`;
}
