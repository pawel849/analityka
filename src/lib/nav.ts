// Narzędzia aplikacji – te same dla każdego klienta. Dane, które pokazują, zależą od wybranego projektu.

export type ToolKey = "pulpit" | "lejki" | "ekonomia" | "testy" | "plan" | "os-czasu" | "dane" | "ustawienia" | "przewodnik";

export interface ToolDef {
  key: ToolKey;
  label: string;
  section: "start" | "narzedzia" | "dane";
  /** Jedno zdanie: do czego służy. */
  what: string;
  /** 3 kroki: jak używać. */
  how: string[];
}

export const TOOLS: ToolDef[] = [
  {
    key: "pulpit",
    label: "Pulpit",
    section: "start",
    what: "Start projektu: przyciski do wszystkich narzędzi.",
    how: ["Kliknij narzędzie.", "Strzałka „Pulpit” u góry każdego narzędzia wraca tutaj."],
  },
  {
    key: "lejki",
    label: "Mapy lejków",
    section: "narzedzia",
    what: "Rysujesz drogę klienta (reklama → strony → zakup) i widzisz, ile osób przechodzi przez każdy krok i gdzie odpada.",
    how: [
      "Utwórz lejek (pusty albo z szablonu) i ułóż elementy: źródła, strony, akcje.",
      "W każdym elemencie wpisz, co ma mierzyć: adres strony, źródło ruchu, zdarzenie lub produkt.",
      "Przełącz mapę na „Analiza” – liczby pojawią się na elementach i strzałkach.",
    ],
  },
  {
    key: "ekonomia",
    label: "Ekonomia",
    section: "narzedzia",
    what: "Czy reklamy się opłacają: koszt pozyskania klienta (CAC), wartość klienta w czasie (LTV), zysk – liczone z zamówień i wydatków.",
    how: [
      "Upewnij się, że zamówienia i koszty reklam spływają (Dane i połączenia).",
      "„Zawęź do lejka”: wybierz kampanie i produkty, jeśli liczysz jeden lejek, a nie cały biznes.",
      "Porównaj okresy i zobacz, co zmieniło wynik: koszt klienta czy jego wartość.",
    ],
  },
  {
    key: "testy",
    label: "Testy reklam",
    section: "narzedzia",
    what: "Testujesz warianty reklam rundami: aplikacja liczy koszt kursanta każdego wariantu, podpowiada zwycięzcę i pilnuje zmęczenia.",
    how: [
      "Załóż test (kąt reklamy) i rundę: co zmieniasz i na co w każdym wariancie.",
      "Skopiuj wygenerowane nazwy reklam i linki z UTM do Menedżera reklam.",
      "Śledź tabelę wyników – po wydaniu budżetu zatwierdź podpowiedź (zwycięzca idzie do biblioteki).",
    ],
  },
  {
    key: "plan",
    label: "Kalendarz",
    section: "narzedzia",
    what: "Zadania, terminy i okresy do deadline'u.",
    how: ["Kliknij dzień i dodaj zadanie."],
  },
  {
    key: "os-czasu",
    label: "Oś czasu",
    section: "narzedzia",
    what: "Dziennik zmian (ceny, kampanie, strony, decyzje) na wykresie przychodu – widać, co wpłynęło na wynik.",
    how: ["Dopisuj zmiany, gdy je robisz (data + co zmieniono).", "Zdarzenia wykryte w danych pojawiają się same.", "Porównuj wykres przed i po zmianie."],
  },
  {
    key: "dane",
    label: "Źródła danych",
    section: "dane",
    what: "Skąd ten projekt bierze dane: skrypt na stronach, połączenia API (Meta, WooCommerce), webhook i import plików.",
    how: ["Wklej skrypt śledzący na strony klienta.", "Podłącz Meta Ads i sklep przez API.", "Opcjonalnie: zaimportuj historię z plików CSV."],
  },
  {
    key: "ustawienia",
    label: "Ustawienia klienta",
    section: "dane",
    what: "Jak liczyć dane tego klienta: waluta, VAT, produkt główny, kategorie produktów i kampanii, koszty.",
    how: ["Ustaw produkt główny i reguły kategorii.", "Sprawdź podgląd na danych klienta.", "Zapisz – Ekonomia przeliczy się sama."],
  },
  {
    key: "przewodnik",
    label: "Przewodnik konfiguracji",
    section: "dane",
    what: "Krok po kroku od zera do działającej analityki – z pytaniami i sprawdzaniem na żywo.",
    how: ["Odpowiedz na pytania o biznes.", "Wykonuj kroki – zielony znak = działa.", "Na końcu mapa lejka buduje się sama."],
  },
];

export const TOOL_BY_KEY = Object.fromEntries(TOOLS.map((t) => [t.key, t])) as Record<ToolKey, ToolDef>;

export function projectHref(projectId: string, key: ToolKey = "pulpit"): string {
  return key === "pulpit" ? `/projects/${projectId}` : `/projects/${projectId}/${key}`;
}

/** Stare adresy ?tab=… → nowe podstrony. */
export const LEGACY_TABS: Record<string, ToolKey> = {
  lejki: "lejki",
  dane: "dane",
  ekonomia: "ekonomia",
  os: "os-czasu",
  ustawienia: "ustawienia",
  integracje: "dane",
  start: "przewodnik",
  testy: "testy",
};
