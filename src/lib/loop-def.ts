// Definicje sesji analitycznej – bez zależności od bazy (używane też w przeglądarce).

export const STEPS = [
  { key: "cel", title: "Cel", question: "Ile profitu chcemy i z jakich kampanii oraz produktów liczymy?" },
  { key: "predykcja", title: "Predykcja", question: "Zanim zobaczysz dane: jak Twoim zdaniem jest?" },
  { key: "rzeczywistosc", title: "Rzeczywistość", question: "Ile profitu robimy naprawdę i jak trafiła Twoja predykcja?" },
  { key: "luka", title: "Luka", question: "Ile złotych brakuje do celu?" },
  { key: "kwota", title: "Kwota na stole", question: "Gdzie leży najwięcej pieniędzy?" },
  { key: "pytania", title: "Pytania", question: "Dlaczego ta dźwignia? Odpowiedz, zanim zobaczysz analizę." },
  { key: "decyzja", title: "Decyzja", question: "Jedna zmiana: co, kto, dlaczego, hipoteza, wartość, data sprawdzenia." },
  { key: "kalendarz", title: "Kalendarz", question: "Co trzeba zrobić i kiedy sprawdzamy wynik?" },
  { key: "rozstrzygniecie", title: "Rozstrzygnięcie", question: "Miałeś rację?" },
  { key: "wnioski", title: "Wnioski", question: "Czego się nauczyłeś?" },
] as const;
export type StepKey = (typeof STEPS)[number]["key"];

/** Etap, którego dotyczy zmiana (zwycięskie elementy). */
export const ELEMENTS = ["reklama", "strona", "VSL", "checkout", "oferta", "inne"] as const;
export const MEASURE_TASK = "Sprawdzić, czy pomiar działa";
export const VERDICTS = ["tak", "nie", "za mało danych"] as const;
export const NO_CHANGE = "nic nie zmieniam";
