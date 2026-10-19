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
      "Kolejność startu: dodaj klienta → dodaj projekt → pulpit → „Źródła danych”: wklej skrypt na strony → utwórz lejek → ułóż mapę → przełącz na Analizę.",
    ],
  },
  {
    id: "przewodnik",
    title: "Przewodnik „Zbuduj ze mną” – konfiguracja krok po kroku",
    tags: "przewodnik zbuduj ze mną start konfiguracja krok po kroku od czego zacząć nietechniczny kreator",
    body: [
      "Przy nowym projekcie wybierasz: „Zbuduj ze mną” (prowadzenie krok po kroku) albo „Sam zbuduję”.",
      "Kroki: 1) Biznes – pytania o model sprzedaży, narzędzie do stron, płatności i źródła ruchu. 2) Strony – układasz strony lejka i wpisujesz ich adresy. 3) Skrypt – gotowy kod z instrukcją dla Twojego narzędzia i sprawdzaniem na żywo każdej strony. 4) Źródła – gotowe linki i parametry do reklam, postów i e-maili, ze sprawdzeniem. 5) Zapisy i zakupy – test formularza i podłączenie płatności (WooCommerce API, Stripe, kod na stronie podziękowania, Zapier/Make). 6) Koszty reklam – połączenie Meta API, import CSV z Google Ads. 7) Mapa – budowana automatycznie z odpowiedzi. 8) Metryki – wbudowane + do wyboru + własny wzór. 9) Gotowe – stan wszystkiego i kilkanaście opcji „co dalej”.",
      "Znaczki kroków u góry: ✓ = działa, ! = do dokończenia. Każdy krok można pominąć i wrócić później.",
      "Stan sprawdza się sam co 5 sekund – wystarczy otworzyć stronę lub kliknąć link, żeby zobaczyć zielony znak.",
      "„Ukryj przewodnik” chowa zakładkę; wrócisz przyciskiem „Otwórz przewodnik „Zbuduj ze mną”” na pulpicie: „Przewodnik konfiguracji”.",
      "Linki z przewodnika używają oznaczeń: ads_meta, ads_google, ads_youtube, ads_tiktok, ads_linkedin (reklamy), facebook.com, instagram.com, youtube.com, tiktok.com, linkedin.com (posty) i newsletter (e-maile) – dzięki temu płatne i bezpłatne wejścia się nie mieszają.",
    ],
  },
  {
    id: "mcp",
    title: "Dostęp dla AI (MCP) – Claude uzupełnia dane za Ciebie",
    tags: "ai mcp claude konektor asystent klucz dostęp automatycznie uzupełnij",
    body: [
      "Górny pasek → „Dostęp dla AI” → „Utwórz klucz”. Skopiuj adres konektora (widoczny tylko raz).",
      "W Claude: Ustawienia → Konektory → Dodaj własny konektor → wklej adres. W Claude Code: skopiowane polecenie „claude mcp add …”.",
      "Potem w zwykłym czacie z Claude: np. „Załóż klientowi X projekt, lejek webinarowy, strony to … – i sprawdź, czy skrypt działa”.",
      "Claude może: zakładać klientów/projekty/lejki, uzupełniać przewodnik „Zbuduj ze mną”, budować i zmieniać mapy, dodawać metryki, dane ręczne, wpisy na osi czasu, zmieniać ustawienia, importować dane reklam i zamówień, uruchamiać synchronizację, czytać liczby.",
      "Nie może: wkleić skryptu na stronę, wygenerować tokenu Meta / kluczy WooCommerce, usuwać klientów i projektów.",
      "Jeśli masz otwartą mapę w przeglądarce, odśwież ją po zmianach od Claude – inaczej edytor może nadpisać jego zmiany przy Twojej następnej edycji.",
      "Klucz wyłączasz przyciskiem „Wyłącz” – dostęp znika od razu.",
    ],
  },
  {
    id: "przeglad",
    title: "Sesja analityczna → decyzja w złotówkach",
    tags: "sesja analiza pętla cel predykcja rzeczywistość luka kwota na stole dźwignia benchmark pytania claude decyzja hipoteza brief kalendarz rozstrzygnięcie wnioski licznik pewność",
    body: [
      "Na pulpicie: „Rozpocznij sesję”. Zawsze 10 kroków od początku do końca: Cel → Predykcja → Rzeczywistość → Luka → Kwota na stole → Pytania → Decyzja → Kalendarz → Rozstrzygnięcie → Wnioski. Następny krok otwiera się po zapisie poprzedniego. Sesji nie da się zamknąć bez decyzji (dopuszczalne „nic nie zmieniam” – z uzasadnieniem i datą).",
      "Krok 1: cel profitu (ten sam co w Ustawieniach, auto-uzupełniany) i zakres: z których kampanii (koszty, wyświetlenia, kliknięcia) i produktów (zamówienia) liczymy. Zakres zostaje na kolejne sesje.",
      "Profit = przychód netto − reklamy − koszty zmienne i stałe − podatek (z Ustawień). Krok 2: zanim zobaczysz dane, wpisujesz profit z ostatnich 7 dni i etap, który się pogorszył – krok 3 pokazuje różnicę.",
      "Kwota na stole: model CPM → CTR (kliknięcia w link) → CR (kliknięcie → zakup) → wartość zakupu (AOV netto + LTV 30, jeśli są dane). Dźwignia = ile zł/mies. więcej przy metryce na poziomie benchmarku (najlepsze 7 dni z 60 spełniające próg próby albo wartości docelowe z Ustawień), przy stałym budżecie i reszcie lejka bez zmian. Poniżej progu próby: „niska pewność” i zakres 90%.",
      "Pytania (2–3) układane z danych dla wybranej dźwigni; analiza Claude dopiero po Twoich odpowiedziach. Decyzja: co, kto, dlaczego, hipoteza „metryka M z A do B”, wartość oczekiwana z modelu, data sprawdzenia (domyślnie +14 dni). Trafia na oś czasu i do kalendarza; „Generuj brief” kopiuje zlecenie.",
      "W dniu sprawdzenia decyzja wraca na pulpit: „Miałeś rację?” – wynik metryki od wdrożenia, realny wpływ w zł/mies. (model: tylko ta metryka się zmienia), wniosek jednym zdaniem. Trafiona zmiana z zyskiem trafia do zwycięskich elementów. Licznik na pulpicie: suma zweryfikowanych zł, trafność hipotez, średni błąd predykcji.",
    ],
  },
  {
    id: "uklad",
    title: "Jak jest zbudowana aplikacja: narzędzia vs dane klienta",
    tags: "układ menu narzędzia dane klienta projekt przełącznik pulpit nawigacja gdzie co jest",
    body: [
      "Strona główna = klienci i ich lejki (projekty). Kliknij lejek, żeby wejść na jego pulpit.",
      "Pulpit to przyciski do narzędzi (Mapy lejków, Ekonomia, Testy reklam, Oś czasu, Źródła danych, Ustawienia klienta, Przewodnik konfiguracji) i kalendarz pracy.",
      "W każdym narzędziu strzałka obok nazwy wraca do pulpitu, a strzałka na pulpicie – do listy klientów.",
      "Stan danych (skrypt, Meta, sklep, zamówienia, koszty) widzisz na górze „Źródeł danych”.",
    ],
  },
  {
    id: "testy-reklam",
    title: "Testy reklam – rundy wariantów i koszt kursanta",
    tags: "testy reklam ab test warianty runda kąt cac koszt kursanta zwycięzca zmęczenie skalowanie biblioteka utm nazwa reklamy",
    body: [
      "Test = kąt (obietnica) reklamy. Runda = 2–8 wariantów różniących się jednym elementem (hook, body, close, kąt, CTA, format, odbiorcy, styl graficzno-wizualny). Bazą kolejnej rundy jest zwycięzca poprzedniej.",
      "Kreator rundy generuje nazwy reklam (np. AMERYKANSKI_COACH_R2_B). W Menedżerze reklam nazwij reklamy dokładnie tak i w polu „Parametry URL” wklej: utm_source=ads_meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}.",
      "Wydatki, kliknięcia, wideo – z połączenia Meta (po nazwie reklamy). Wejścia – ze skryptu (utm_content). Kursy – zakupy produktu głównego przypisane do wariantu po utm_content w oknie atrybucji (domyślnie 7 dni).",
      "Koszt kursanta (CAC) = wydatki ÷ kursy. Po wydaniu budżetu na wariant (domyślnie 2 × maks. CAC) aplikacja podpowiada: zwycięzca / przegrywa / wyłącz / remis. Decyzję zatwierdzasz Ty – zwycięzca trafia do biblioteki i na oś czasu.",
      "Zmęczenie: tygodniowy CTR i CAC zwycięzcy względem 1. tygodnia – alarm, gdy CTR spadnie o próg albo CAC wzrośnie. Skalowanie: CAC ≤ maksymalnego przez N dni → podpowiedź zwiększenia budżetu (aplikacja nie zmienia budżetu w Meta sama).",
      "Tryb ręczny: kliknij wiersz wariantu → „Wpisz ręcznie”, gdy integracja nie działa. Dane automatyczne zastępują ręczne, gdy zaczną spływać.",
      "Tabela odświeża się co 30 sekund (i przyciskiem „Odśwież”).",
      "Ograniczenie: zamówienia z WooCommerce przypisują się do wariantu tylko, gdy da się je połączyć z wejściem osoby (e-mail złapany przez skrypt albo zakup wysłany ze strony z UTM).",
    ],
  },
  {
    id: "skrypt",
    title: "Skrypt śledzący – instalacja",
    tags: "skrypt śledzący t.js instalacja kod head wordpress tracking",
    body: [
      "Skrypt jest w projekcie: pulpit → Źródła danych → Skrypt na stronach. Wklej go w <head> każdej strony lejka (WordPress, GetResponse, MailerLite, własny HTML).",
      "Zbiera automatycznie: odsłony, źródło (UTM, odsyłacz, fbclid, gclid), kliknięcia, przewinięcie 25/50/75/100%, wysłanie formularzy, odtwarzanie wideo HTML5.",
      "Ręczne zdarzenia: anl(\"lead\"), anl(\"purchase\", 297), anl(\"event\", \"nazwa\"), anl(\"identify\", email).",
      "data-domains=\"a.pl,b.pl\" przenosi identyfikator osoby między domenami. data-identify=\"forms\" łączy osobę z e-mailem z formularza.",
      "Sprawdzenie: Źródła danych → Skrypt na stronach → „Ostatnie zdarzenia” (pojawiają się w ciągu kilku sekund po otwarciu strony). W edytorze lewy panel „Eksploruj” pokazuje strony i źródła widziane przez skrypt.",
    ],
  },
  {
    id: "mapa",
    title: "Układanie mapy lejka",
    tags: "mapa węzeł element przeciągnij strzałka połączenie paleta źródło strona akcja offline",
    body: [
      "Lewy panel „Elementy”: źródła ruchu, strony, akcje i elementy offline. Przeciągnij element na mapę albo kliknij go dwukrotnie. Jest wyszukiwarka.",
      "Strzałkę rysujesz od kropki po prawej stronie węzła do kropki po lewej stronie kolejnego.",
      "Kliknięcie węzła lub strzałki wysuwa z prawej panel ustawień (nad mapą). Zamykasz go przyciskiem „Zamknij ×” albo kliknięciem w puste tło mapy. Przeciąganie elementu panelu nie otwiera.",
      "Lewy panel chowasz ikoną na dole paska z lewej albo klikając ponownie aktywną zakładkę (ikonę).",
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
      "Zakup: pole „Produkty” – zaznacz produkty lejka, a węzeł (oraz przychód, sprzedaże i ROAS na dole) policzy tylko zamówienia, które je zawierają. Lista pochodzi z zamówień projektu (WooCommerce / import). Dla kodu na stronie podziękowania: anl(\"purchase\", 297, \"Nazwa produktu\").",
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
      "Alternatywa: połącz Meta Ads przez API (Integracje → Połączenia API) albo zaimportuj CSV z reklam (projekt → Dane), a w węźle źródła wpisz pole „Koszty z importu reklam” – fragmenty nazw kampanii/zestawów/reklam. Koszty liczą się proporcjonalnie do dni zakresu.",
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
    id: "api",
    title: "Automatyczny import: Meta Ads i WooCommerce (API)",
    tags: "api meta facebook woocommerce sklep automatycznie synchronizacja token klucz połączenie import koszty zamówienia cron",
    body: [
      "Projekt → Źródła danych → Połączenia API → „+ Meta Ads” lub „+ WooCommerce”.",
      "Meta Ads: ID konta reklamowego (same cyfry) i token z uprawnieniem ads_read (Business Manager → Użytkownicy systemowi). Pobiera dziennie na poziomie reklamy: wydatki, wyświetlenia, zasięg, kliknięcia linku, odtworzenia 3 s, ThruPlay, wyświetlenia strony docelowej, rejestracje/leady, koszyki, płatności, zakupy i ich wartość wg Meta.",
      "WooCommerce: adres sklepu (https) i klucze REST API z uprawnieniem Odczyt (WooCommerce → Ustawienia → Zaawansowane → REST API). Pobiera zamówienia ze statusami z listy „opłacone” (domyślnie processing, completed); zamówienia, które zmieniły status (np. zwrot), są usuwane z danych.",
      "Opcja „Dodawaj opłacone zamówienia jako zakupy na mapie” tworzy zdarzenia zakupu na mapie (bez duplikatów). Wyłącz ją, jeśli strona podziękowania wysyła już anl(\"purchase\").",
      "Dane trafiają tam, gdzie import CSV: koszty reklam do węzłów źródeł (pole „Koszty z importu reklam”) i do Ekonomii; zamówienia do Ekonomii.",
      "Pierwsza synchronizacja pobiera ostatnie N dni (domyślnie 90) – przy dużej historii w kilku podejściach. Kolejne pobierają ostatnie dni i nadpisują je (Meta poprawia dane wstecz).",
      "Automat raz dziennie działa na Vercelu po ustawieniu zmiennej CRON_SECRET. Zawsze można kliknąć „Synchronizuj teraz”.",
      "Nie mieszaj importu CSV z Meta i połączenia API dla tego samego okresu – wydatki policzą się podwójnie (aplikacja ostrzega).",
    ],
  },
  {
    id: "import",
    title: "Import danych CSV (reklamy i zamówienia)",
    tags: "import csv meta google ads woocommerce publigo zamówienia reklamy dane",
    body: [
      "Projekt → Źródła danych → Import plików. Wybierz typ pliku (Meta Ads, Google Ads, inne reklamy, WooCommerce, Publigo, inne zamówienia).",
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
      "Projekt → Ekonomia. Na górze wybierasz okres (30 dni, 90 dni, 12 mies., wszystko albo własne daty). Wskaźniki porównują go z poprzednim okresem tej samej długości; jeśli masz okresy w Ustawieniach klienta, przycisk „Okresy z ustawień” pokaże je obok siebie.",
      "Zakres to równanie: wydatki z wybranych kampanii ÷ nowi klienci wybranego produktu = CAC. Kliknij kartę kampanii albo produktu, żeby zmienić wybór. Zaznaczaj tylko produkt główny – dodatki z tego samego zamówienia (order bump) liczą się same.",
      "Wykres „Z czego” (koło) pokazuje udział kategorii produktów w przychodzie i ile zostaje po reklamach. „Miesiące + reklamy” pokazuje przychód i wydatki obok siebie w każdym miesiącu.",
      "CAC to górna granica – reklamy sprzedają też inne produkty niż główny. LTV liczone tylko dla klientów, od których zakupu minęło pełne okno (np. 90 dni); wcześniej widać „za wcześnie”. Klienci bez e-maila liczeni są jako osobne osoby.",
      "„Co zmieniło wynik” (metoda Shapleya) rozkłada zmianę wyniku z 10 000 zł reklam na wpływ CAC i LTV. To nie test A/B – na wynik wpływa też rynek.",
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
      "2. Czy skrypt jest na stronach? Źródła danych → „Ostatnie zdarzenia” lub panel Eksploruj w edytorze pokażą, czy przychodzą zdarzenia.",
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
      { target: "[data-tour=create-client]", title: "1. Dodaj klienta", text: "Kliknij kafelek „Dodaj klienta” i wpisz nazwę firmy. Od razu otworzy się kreator pierwszego lejka." },
      { target: "[data-tour=client-list]", title: "2. Klienci i lejki", text: "Kliknij lejek, żeby otworzyć jego pulpit. „Dodaj nowy lejek” prowadzi krok po kroku. Ołówek zmienia nazwę, kosz usuwa (pojawiają się po najechaniu)." },
      { target: "[data-tour=help]", title: "Pomoc zawsze tutaj", text: "Przycisk „?” w prawym górnym rogu: samouczki, wyszukiwarka pomocy i pytania do asystenta." },
    ],
  },
  {
    id: "projekt",
    title: "Projekt: pulpit",
    path: "^/projects/[^/]+$",
    hint: "Otwórz dowolny projekt klienta.",
    steps: [
      { target: ".ls", title: "Analiza", text: "Jedna droga: analiza od celu do wniosków, zawsze w tej samej kolejności." },
      { target: "#kalendarz", title: "Kalendarz", text: "Dziś, najbliższe terminy i miesiąc z paskami okresów do deadline'u." },
      { target: "[data-tour=nav-lejki]", title: "Mapy lejków", text: "Droga klienta od reklamy do zakupu – ile osób przechodzi przez każdy krok." },
      { target: "[data-tour=nav-testy]", title: "Testy reklam", text: "Rundy wariantów reklam, koszt kursanta na wariant, podpowiedź zwycięzcy." },
      { target: "[data-tour=nav-dane]", title: "Źródła danych", text: "Skrypt na stronach, połączenia API (Meta, WooCommerce), import plików i webhook." },
      { target: "[data-tour=nav-ustawienia]", title: "Ustawienia klienta", text: "Jak liczyć dane tego klienta: VAT, produkt główny, kategorie." },
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
