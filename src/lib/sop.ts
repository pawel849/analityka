// Przegląd od makro do mikro: stała kolejność poziomów (SOP). Wnioski z dołu wracają na górę
// jako działania w kalendarzu i wpis na osi czasu.

export interface SopStep {
  key: "ekonomia" | "plan" | "lejki" | "testy" | "os-czasu";
  label: string;
  level: string;
  /** Pytanie, na które odpowiadasz notatką na tym poziomie. */
  question: string;
}

export const SOP: SopStep[] = [
  { key: "ekonomia", label: "Ekonomia", level: "Makro", question: "Czy biznes zarabia? Co zmieniło się od ostatniego przeglądu (CAC, LTV, przychód)?" },
  { key: "plan", label: "Kalendarz", level: "Plan", question: "Jakie terminy się zbliżają i co z nich wynika dla wyniku?" },
  { key: "lejki", label: "Mapy lejków", level: "Lejek", question: "Na którym kroku lejka odpada najwięcej ludzi? Co tam poprawić?" },
  { key: "testy", label: "Testy reklam", level: "Reklama", question: "Która reklama wygrywa i co testujesz dalej, żeby poprawić wynik?" },
  { key: "os-czasu", label: "Oś czasu", level: "Wnioski", question: "Co zmieniasz po tym przeglądzie i jakiego efektu na górze się spodziewasz?" },
];

export const sopHref = (projectId: string, key: SopStep["key"]) => `/projects/${projectId}/${key}`;

export interface ReviewNote {
  note: string;
  ok?: boolean; // „bez uwag”
}

export interface Review {
  id: string;
  step: number;
  notes: Record<string, ReviewNote>;
  started_at: string;
  finished_at: string | null;
}
