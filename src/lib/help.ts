// Baza wiedzy pomocy + samouczki interaktywne. Używane przez centrum pomocy (wyszukiwarka offline)
// i jako kontekst dla asystenta AI (/api/assistant).

export interface HelpArticle {
  id: string;
  title: string;
  tags: string;
  body: string[];
}

export interface TourStep {
  /** Selektor CSS elementu do podświetlenia; brak = okno na środku. */
  target?: string;
  /** Selektor elementu klikanego przed pokazaniem kroku (np. przełączenie trybu). */
  click?: string;
  title: string;
  text: string;
}

export interface Tour {
  id: string;
  title: string;
  /** Wyrażenie regularne ścieżki strony, na której samouczek działa. */
  path: string;
  /** Gdzie przejść, jeśli samouczek uruchomiono na innej stronie (brak = trzeba wejść samemu). */
  hint?: string;
  steps: TourStep[];
}

export const HELP_ARTICLES: HelpArticle[] = [
  {
    id: "struktura",
    title: "Jak jest zbudowana aplikacja (klient → projekt → lejek)",
    tags: "start klient projekt lejek struktura od czego zacząć",
    body: [
      "Klient to firma, dla której pracujesz. Klient ma projekty.",
      "Projekt = jedno miejsce zbierania danych: ma własny skrypt śledzący, import danych, ustawienia i ekonomię. Zwykle jeden projekt na domenę lub ofertę.",
      "Lejek to mapa w projekcie. Wszystkie lejki projektu korzystają z tych samych danych ze skryptu.",
      "Kolejność startu: dodaj klienta → dodaj projekt → zakładka Integracje: wklej skrypt na strony → utwórz lejek → ułóż mapę → przełącz na Analizę.",
    ],
  },
  {
    id: "skrypt",
    title: "Skrypt śledzący – instalacja",
    tags: "skrypt śledzący t.js instalacja kod head wordpress tracking",
    body: [
      "Skrypt jest w projekcie, zakładka Integracje (blok „Skrypt śledzący”). Wklej go w <head> każdej strony lejka (WordPress, GetResponse, MailerLite, własny HTML).",
      "Zbiera automatycznie: odsłony, źródło (UTM, odsyłacz, fbclid, gclid), kliknięcia, przewinięcie 25/50/75/100%, wysłanie formularzy, odtwarzanie wideo HTML5.",
      "Ręczne zdarzenia: anl(\"lead\"), anl(\"purchase\", 297), anl(\"event\", \"nazwa\"), anl(\"identify\", email).",
      "data-domains=\"a.pl,b.pl\" przenosi identyfikator osoby między domenami. data-identify=\"forms\" łączy osobę z e-mailem z formularza.",
      "Sprawdzenie: zakładka Integracje → „Ostatnie zdarzenia” (pojawiają się w ciągu kilku sekund po otwarciu strony). Zakładka Lejki ma Monitor (liczby, wykres dzienny, strony, źródła, kraje). W edytorze lewy panel „Eksploruj” pokazuje strony i źródła widziane przez skrypt.",
    ],
  },
  {
    id: "mapa",
    title: "Układanie mapy lejka",
    tags: "mapa węzeł element przeciągnij strzałka połączenie paleta źródło strona akcja offline",
    body: [
      "Lewy panel „Elementy”: źródła ruchu, strony, akcje i elementy offline. Przeciągnij element na mapę albo kliknij go dwukrotnie. Jest wyszukiwarka.",
      "Strzałkę rysujesz od kropki po prawej stronie węzła do kropki po lewej stronie kolejnego.",
      "Kliknięcie węzła lub strzałki otwiera prawy panel ustawień (wysuwa się). Można go schować przyciskiem » i otworzyć ponownie zakładką « Panel przy prawej krawędzi.",
      "Szablony (przycisk „Szablony” na górze) wstawiają gotowe lejki strategiczne albo lejek zbudowany z Twoich danych.",
      "Tekst, kształty, obrazy i widgety dodajesz przyciskami T, ▭, ▣ i „Widget”.",
      "Mapa zapisuje się sama (status obok nazwy lejka).",
    ],
  },
  {
    id: "sledzenie-wezla",
    title: "Jak węzeł łapie dane (adres, źródło, zdarzenie)",
    tags: "adres url dopasowanie strona utm_source źródło zdarzenie typ akcja filtry cel śledzenie",
    body: [
      "Panel węzła → zakładka Śledzenie.",
      "Strona: adres „/zapis” = dokładnie ta ścieżka; „/blog/*” = wszystko pod /blog/; inny tekst = adres zawiera ten tekst. Można podać kilka adresów.",
      "Źródło: wartości utm_source oddzielone przecinkami, „*” = dowolne źródło, „(direct)” = wejścia bezpośrednie.",
      "Akcja: typ zdarzenia (np. lead, zakup, kliknięcie, przewinięcie, własne zdarzenie z nazwą) i opcjonalnie strona, na której ma wystąpić.",
      "Filtry węzła (np. utm_campaign, kraj, param:xyz) zawężają osoby liczone w węźle.",
      "Cel: oznacz węzeł jako cel z wartością – pojawi się w metrykach celów.",
    ],
  },
  {
    id: "analiza",
    title: "Tryb Analiza – liczby na mapie",
    tags: "analiza liczby zakres daty porównanie filtry tryb danych ruch lejek odśwież",
    body: [
      "Przełącznik Planowanie / Analiza w prawym górnym rogu edytora. Analiza ma ciemny motyw i liczby na węzłach i strzałkach.",
      "Pasek analizy: zakres dat, „Dane: ruch” (każdy węzeł liczy wszystkie osoby) lub „Dane: lejek” (węzeł liczy tylko osoby, które przeszły wcześniejsze kroki), Filtry osób, porównanie z poprzednim okresem, Odśwież.",
      "Strzałka A → B pokazuje, ile osób z A trafiło później do B; % = ta liczba ÷ osoby w A.",
      "Typ połączenia strzałki (kliknij strzałkę): bezpośredni (B zaraz po A), pośredni (B kiedykolwiek po A), bez danych.",
      "Przerywana ramka = szacunek (co najmniej jeden węzeł ma tylko dane ręczne).",
      "Dolny pasek pokazuje metryki całego lejka i własne metryki.",
    ],
  },
  {
    id: "warstwy",
    title: "Warstwy: liczby, przepływ, miniatury, plan",
    tags: "warstwy przepływ miniatury plan liczby grubość strzałek",
    body: [
      "Panel „Warstwy” w prawym górnym rogu mapy.",
      "Liczby – wyniki na węzłach. Przepływ – grubość strzałek zależy od liczby osób. Miniatury – podgląd strony na węźle. Plan – notatki, checklisty i prognozy na węzłach.",
    ],
  },
  {
    id: "dane-reczne",
    title: "Koszty reklam i dane ręczne",
    tags: "koszty wydatki spend ręcznie wyświetlenia kliknięcia hook rate dane ręczne nadpisanie",
    body: [
      "Dane spoza skryptu (wydatki, wyświetlenia, kliknięcia reklam, odtworzenia 3 s, nadpisanie liczby osób) wpisujesz w panelu węzła, zakładka Wyniki, w trybie Analiza.",
      "Alternatywa: zaimportuj CSV z reklam (projekt → Dane) i w węźle źródła wpisz pole „Koszty z importu reklam” – fragmenty nazw kampanii/zestawów/reklam. Koszty liczą się proporcjonalnie do dni zakresu.",
    ],
  },
  {
    id: "metryki",
    title: "Metryki i własne wzory",
    tags: "metryki roas cpl cpa aov hook rate ctr wzór formuła własna metryka",
    body: [
      "Wbudowane: ROAS = przychód ÷ wydatki, CPL = wydatki ÷ leady, CPA = wydatki ÷ sprzedaże, AOV, hook rate = odtworzenia 3 s ÷ wyświetlenia, CTR reklam = kliknięcia ÷ wyświetlenia, CTR strony = kliknięcia na stronie ÷ odsłony, konwersja.",
      "Własne metryki dodajesz w dolnym pasku metryk (tryb Analiza). Wzór może używać sum (np. revenue - spend), node(\"Nazwa węzła\", \"people\"), edge(\"A\", \"B\"), min, max, round.",
    ],
  },
  {
    id: "plan",
    title: "Planowanie: notatki, checklisty, prognozy, styl",
    tags: "notatki checklista prognoza plan styl kolor ikona miniatura",
    body: [
      "Panel węzła → zakładka Plan: notatki, checklista i prognoza węzła. Zakładka Styl: kolor, ikona, miniatura.",
      "Notatki i checklista całego lejka są w lewym pasku (ikony ✎ i ✓).",
    ],
  },
  {
    id: "skroty",
    title: "Skróty klawiszowe w edytorze",
    tags: "skróty klawisze kopiuj wklej duplikuj usuń kolejność",
    body: [
      "Ctrl/⌘+C kopiuj, Ctrl/⌘+V wklej (także w innym lejku), Ctrl/⌘+D duplikuj.",
      "Ctrl/⌘+] / Ctrl/⌘+[ – wyżej/niżej; z Shift – na wierzch/spód. Delete lub Backspace – usuń.",
    ],
  },
  {
    id: "eksport",
    title: "Eksport i udostępnianie",
    tags: "eksport png pdf druk json import udostępnij link klient",
    body: [
      "Menu ⋯ w edytorze: Eksport PNG, Drukuj / zapisz PDF, eksport i import mapy (JSON), Udostępnij link.",
      "Udostępniony link jest tylko do odczytu – klient widzi mapę i liczby bez logowania. Link można wyłączyć.",
    ],
  },
  {
    id: "import",
    title: "Import danych CSV (reklamy i zamówienia)",
    tags: "import csv meta google ads woocommerce publigo zamówienia reklamy dane",
    body: [
      "Projekt → zakładka Dane. Wybierz typ pliku (Meta Ads, Google Ads, inne reklamy, WooCommerce, Publigo, inne zamówienia).",
      "Kolumny dopasowują się same; możesz je poprawić i zobaczyć podgląd. Obsługiwane kodowanie UTF-8 i Windows-1250.",
      "E-maile są zamieniane na skrót SHA-256 w przeglądarce – nie trafiają na serwer.",
      "Ponowny import tego samego okresu nadpisuje dane bez duplikatów.",
    ],
  },
  {
    id: "ekonomia",
    title: "Ekonomia: CAC, LTV, zysk",
    tags: "ekonomia cac ltv zysk powroty backend order bump shapley okresy",
    body: [
      "Projekt → Ekonomia. Liczone z importu zamówień i reklam: przychód vs wydatki miesięcznie, CAC, LTV 30/90/365 (tylko dojrzałe okna), LTV/CAC, powroty, back-end, order bump, wynik na 10 000 zł reklam, zysk szacunkowy.",
      "Rozkład zmiany (Shapley) pokazuje, ile zmiany wyniku wynika z CAC, a ile z LTV.",
      "Okresy, kategorie produktów i koszty ustawiasz w zakładce Ustawienia.",
    ],
  },
  {
    id: "ustawienia",
    title: "Ustawienia klienta",
    tags: "ustawienia waluta vat produkt główny reguły kategorie kampanie kąty okresy koszty",
    body: [
      "Projekt → Ustawienia: waluta, VAT, produkt główny, reguły kategorii produktów, typów kampanii i kątów reklam (z podglądem na danych), okresy analizy, koszty jako założenia.",
    ],
  },
  {
    id: "os-czasu",
    title: "Oś czasu zmian",
    tags: "oś czasu zdarzenia zmiany ceny kampania dziennik",
    body: [
      "Projekt → Oś czasu: zdarzenia dodane ręcznie (z pewnością) i wykryte w danych (zmiana ceny o >10%, start/koniec kampanii). Wykres przychodu i wydatków z zaznaczonymi zdarzeniami, eksport dziennika (.md).",
    ],
  },
  {
    id: "webhook",
    title: "Webhook: leady i zakupy z innych narzędzi",
    tags: "webhook stripe zapier make mailerlite lead zakup integracja",
    body: [
      "Projekt → Integracje: adres webhooka POST /api/hooks/{sekret}?type=lead|purchase&value=…",
      "Obsługuje zdarzenia Stripe (checkout.session.completed, payment_intent.succeeded, charge.succeeded, invoice.paid) oraz dowolne narzędzia (Zapier, Make, Pabbly, MailerLite).",
      "Osoba jest łączona po e-mailu z wizytami ze skryptu (wymaga anl(\"identify\", email) lub data-identify=\"forms\").",
      "Podpis Stripe nie jest weryfikowany – zabezpieczeniem jest tajny adres.",
    ],
  },
  {
    id: "dane-testowe",
    title: "Dane testowe",
    tags: "dane testowe symulacja podgląd usuń",
    body: [
      "Projekt → Integracje: można wygenerować dane testowe (symulowany ruch po mapie), żeby zobaczyć tryb Analiza. Są oznaczone i można je usunąć jednym przyciskiem.",
    ],
  },
  {
    id: "brak-danych",
    title: "Nie widzę liczb na mapie – co sprawdzić",
    tags: "brak danych zero puste nie działa problem liczby",
    body: [
      "1. Czy jesteś w trybie Analiza i zakres dat obejmuje okres z ruchem?",
      "2. Czy skrypt jest na stronach? Integracje → „Ostatnie zdarzenia”, Monitor w zakładce Lejki lub panel Eksploruj w edytorze pokażą, czy przychodzą zdarzenia.",
      "3. Czy adres strony w węźle pasuje do ścieżek z Eksploruj (np. „/zapis” vs „/zapis/”)? Użyj „/zapis*” lub fragmentu adresu.",
      "4. Czy filtry (pasek analizy lub węzła) nie wykluczają wszystkich osób?",
      "5. Tryb „Dane: lejek” liczy tylko osoby, które przeszły wcześniejsze kroki – sprawdź „Dane: ruch”.",
    ],
  },
];

export const TOURS: Tour[] = [
  {
    id: "start",
    title: "Pierwsze kroki",
    path: "^/$",
    steps: [
      { title: "Witaj w Analityce", text: "Krótki przegląd: klient → projekt → lejek. Przejdziesz go strzałkami lub przyciskiem Dalej." },
      { target: "[data-tour=create-client]", title: "1. Dodaj klienta", text: "Wpisz nazwę firmy klienta i kliknij „Dodaj klienta”. Każdy klient ma własne projekty i dane." },
      { target: "[data-tour=client-list]", title: "2. Lista klientów", text: "Kliknij klienta, aby dodać projekt (jedno miejsce zbierania danych, np. domena)." },
      { target: "[data-tour=help]", title: "Pomoc zawsze tutaj", text: "Przycisk „?” w prawym górnym rogu: samouczki, wyszukiwarka pomocy i pytania do asystenta." },
    ],
  },
  {
    id: "projekt",
    title: "Projekt: zakładki i skrypt",
    path: "^/projects/",
    hint: "Otwórz dowolny projekt klienta.",
    steps: [
      { target: "[data-tour=tab-lejki]", title: "Lejki", text: "Mapy lejków tego projektu i Monitor (liczby, wykres dzienny, strony, źródła). Wszystkie lejki korzystają z tych samych danych ze skryptu." },
      { target: "[data-tour=tab-integracje]", title: "Integracje", text: "Skrypt śledzący do wklejenia w <head> stron, ostatnie zdarzenia, dane testowe i webhook." },
      { target: "[data-tour=tab-dane]", title: "Dane", text: "Import CSV z reklam (Meta, Google) i zamówień (WooCommerce, Publigo, inne)." },
      { target: "[data-tour=tab-ekonomia]", title: "Ekonomia", text: "CAC, LTV, powroty, zysk – liczone z zaimportowanych danych." },
      { target: "[data-tour=tab-os]", title: "Oś czasu", text: "Zmiany cen, starty kampanii i Twoje notatki na wykresie przychodu." },
      { target: "[data-tour=tab-ustawienia]", title: "Ustawienia", text: "Waluta, VAT, reguły kategorii i koszty – osobno dla każdego klienta." },
    ],
  },
  {
    id: "edytor",
    title: "Edytor lejka",
    path: "^/funnels/",
    hint: "Otwórz dowolny lejek.",
    steps: [
      { target: ".fe-left", title: "Elementy mapy", text: "Źródła ruchu, strony, akcje i elementy offline. Przeciągnij na mapę lub kliknij dwukrotnie. Ikony z lewej: Eksploruj dane, notatki i checklista lejka." },
      { target: ".fe-canvas", title: "Mapa", text: "Połącz elementy strzałką: od kropki po prawej do kropki po lewej. Kliknij element, aby wysunąć panel ustawień." },
      { target: "[data-tour=templates]", title: "Szablony", text: "Gotowe lejki strategiczne albo lejek zbudowany z Twoich danych." },
      { target: ".layers-panel", title: "Warstwy", text: "Włączaj liczby, przepływ (grubość strzałek), miniatury stron i plan (notatki, checklisty)." },
      { target: "[data-tour=more]", title: "Eksport i link", text: "PNG, PDF, JSON i link tylko do odczytu dla klienta." },
      { target: ".mode-switch", click: "[data-tour=mode-analyze]", title: "Tryb Analiza", text: "Przełączyłem na Analizę: ciemny motyw i liczby na węzłach oraz strzałkach." },
      { target: ".fe-analysis-bar", title: "Pasek analizy", text: "Zakres dat, tryb danych (ruch / lejek), filtry osób, porównanie z poprzednim okresem." },
      { target: ".fe-metrics", title: "Metryki lejka", text: "ROAS, CPL, CPA, konwersja i Twoje własne wzory." },
      { target: ".mode-switch", click: "[data-tour=mode-plan]", title: "Powrót do planowania", text: "Gotowe. Pytania? Kliknij „?” i zakładkę „Zapytaj”." },
    ],
  },
];

/** Prosta wyszukiwarka po słowach (bez polskich znaków). */
export function foldText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ł/g, "l");
}

export function searchHelp(query: string, limit = 5): HelpArticle[] {
  const words = foldText(query)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
  if (!words.length) return [];
  const scored = HELP_ARTICLES.map((a) => {
    const title = foldText(a.title);
    const tags = foldText(a.tags);
    const body = foldText(a.body.join(" "));
    let score = 0;
    for (const w of words) {
      const stem = w.length > 5 ? w.slice(0, w.length - 2) : w;
      if (title.includes(stem)) score += 3;
      if (tags.includes(stem)) score += 2;
      if (body.includes(stem)) score += 1;
    }
    return { a, score };
  });
  return scored
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => x.a);
}

export function helpKnowledgeText(): string {
  return HELP_ARTICLES.map((a) => `## ${a.title}\n${a.body.map((b) => `- ${b}`).join("\n")}`).join("\n\n");
}
