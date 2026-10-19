// Definicje sesji analitycznej – bez zależności od bazy (używane też w przeglądarce).

export const STEPS = [
  { key: "cel", title: "Cel i zakres" },
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
export const ELEMENTS = ["reklama", "strona", "VSL", "checkout", "oferta", "inne"] as const;
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
};
