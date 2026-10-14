# Analityka lejków

Narzędzie do mapowania i analityki lejków marketingowych dla wielu klientów.
Struktura: **Klient → Projekt (jeden skrypt śledzący) → Lejki (mapy)**.

## Etap 1 – co działa

- Klienci, projekty, lejki (dodawanie, usuwanie, kopiowanie przez API).
- Mapa lejka (przeciągnij i upuść): źródła ruchu, strony, akcje, elementy offline. Autozapis.
- Przełącznik **Planowanie** (jasna „karta techniczna”) / **Analiza** (ciemny motyw z liczbami na węzłach i strzałkach).
- Skrypt śledzący `/t.js`: odsłony, źródło (UTM / odsyłacz / fbclid / gclid), kliknięcia, przewinięcie 25/50/75/100%,
  formularze, wideo HTML5, zdarzenia ręczne `anl("lead")`, `anl("purchase", 297)`, `anl("event", "nazwa")`,
  przenoszenie identyfikatora między domenami (`data-domains`).
- Dane ręczne na węzłach (wydatki, wyświetlenia, kliknięcia, odtworzenia 3 s, nadpisania liczby osób).
- Metryki wbudowane: ROAS, przychód, sprzedaże, wydatki, CPL, leady, hook rate, CTR reklam, CTR stron, CPA, AOV, konwersja.
- Własne metryki ze wzorów, np. `revenue - spend`, `edge("Zapis", "Oferta") / node("Zapis", "people")`.
- Dane testowe (symulacja ruchu po mapie) do podglądu trybu analizy – oznaczone i usuwalne.

### Dodatkowe funkcje

- **Mapa:** szablony lejków (strategia + analiza z danych), tekst, kształty, obrazy, widgety (trendy, cele, osoby, prognoza, kraje),
  notatki i checklisty (węzła i całego lejka), prognozy, cele z wartością, kopiuj/wklej/duplikuj, warstwy (liczby, przepływ, miniatury, plan).
- **Strzałki:** krok bezpośredni / pośredni (z pominięciem kroków) / bez danych, linia krzywa lub prosta.
- **Analiza:** tryb danych „ruch” lub „lejek”, filtry osób (UTM, kraj, ścieżka, parametry adresu), porównanie z poprzednim okresem,
  osoby i atrybuty na węźle, eksploracja danych z dodawaniem na mapę.
- **Eksport i udostępnianie:** PNG, druk/PDF, JSON (eksport i import), publiczny link tylko do odczytu (`/share/...`).
- **Projekt:** Monitor (liczby, wykres dzienny, strony, źródła, kraje) i Integracje.
- **Webhook projektu** `POST /api/hooks/{sekret}?type=lead|purchase&value=…` – leady i zakupy z Zapiera, Make, Pabbly, Stripe,
  MailerLite itd. Osoba rozpoznawana po e-mailu: `anl("identify", email)` lub `data-identify="forms"` w skrypcie.
  Podpis Stripe nie jest weryfikowany – zabezpieczeniem jest tajny adres.
- **Kraj** zapisywany z nagłówka `x-vercel-ip-country` (działa na Vercel; lokalnie „Nieznany”).

### Połączenia API (automatyczny import)

Projekt → Integracje → „Połączenia API”:

- **Meta Ads** (Marketing API, domyślnie v26.0 – do zmiany w ustawieniach połączenia): ID konta + token `ads_read`.
  Dziennie, poziom reklamy: wydatki, wyświetlenia, zasięg, kliknięcia linku, odtworzenia 3 s (`video_view`), ThruPlay,
  wyświetlenia strony docelowej, rejestracje/leady, koszyki, płatności, zakupy i wartość zakupów wg Meta.
- **WooCommerce** (REST API wc/v3): adres sklepu (https) + klucze z uprawnieniem Odczyt. Zamówienia o statusach „opłaconych”
  (domyślnie processing, completed) → Ekonomia; zmiana statusu (zwrot, anulowanie) usuwa zamówienie. Opcjonalnie zakupy na mapie.
- Klucze szyfrowane AES-256-GCM kluczem z `AUTH_SECRET` – po zmianie `AUTH_SECRET` trzeba je wpisać ponownie.
- Automat: `vercel.json` → `/api/cron/sync` raz dziennie. Wymaga zmiennej **`CRON_SECRET`** (dowolny długi ciąg) na Vercelu.
- Limit czasu jednego uruchomienia – duża historia pobiera się w kilku synchronizacjach.
- Nie testowane na prawdziwych kontach (brak dostępu z tego środowiska) – tylko na atrapie API i testach jednostkowych.

### Pomoc w aplikacji

- Przycisk **?** w prawym górnym rogu: samouczki interaktywne (podświetlanie elementów krok po kroku – strona główna, projekt, edytor),
  baza „Jak to działa” z wyszukiwarką i zakładka **Zapytaj**.
- „Zapytaj” korzysta z Claude API, gdy na serwerze jest `ANTHROPIC_API_KEY` (płatne wg zużycia na koncie Anthropic).
  Bez klucza pokazuje pasujące artykuły pomocy.
- Prawy panel edytora wysuwa się po kliknięciu elementu; „Schowaj »” chowa go, „« Panel” przywraca.

### Dane klienta i ekonomia (zakładki projektu)

Wszystko konfigurowane osobno dla każdego klienta (projektu):

- **Dane (import):** CSV z reklam (Meta Ads, Google Ads, inne) i zamówień (WooCommerce, Publigo, dowolny sklep).
  Automatyczne dopasowanie kolumn z ręczną korektą i podglądem, kodowanie UTF-8/Windows-1250, łączenie wierszy-produktów
  w zamówienia, filtr opłaconych statusów. E-mail → skrót SHA-256 liczony w przeglądarce (nie trafia na serwer).
  Ponowny import nadpisuje dane bez duplikatów.
- **Ustawienia klienta:** waluta, VAT, produkt główny, reguły kategorii produktów / typów kampanii / kątów reklam
  (z podglądem na danych klienta), okresy analizy, koszty jako założenia.
- **Ekonomia:** przychód (wg kategorii) vs wydatki miesięcznie, okresy: CAC, LTV 30/90/365 (tylko dojrzałe okna),
  LTV/CAC, powroty, back-end, order bump, „na 10 000 zł reklam”, zysk szacunkowy; rozkład zmiany na CAC i LTV (Shapley).
- **Oś czasu:** zdarzenia ręczne z oznaczeniem pewności + wykryte w danych (zmiany ceny, start/koniec kampanii),
  wykres przychodu i wydatków ze zdarzeniami, eksport dziennika zmian (.md).
- **Mapa:** węzeł źródła może pobierać koszty z importu reklam (pole „Koszty z importu reklam”).

### Definicje metryk

| Metryka | Wzór |
|---|---|
| ROAS | przychód ÷ wydatki |
| CPL | wydatki ÷ leady |
| CPA | wydatki ÷ sprzedaże |
| Hook rate | odtworzenia wideo 3 s ÷ wyświetlenia reklamy |
| CTR reklam | kliknięcia w reklamę ÷ wyświetlenia |
| CTR strony | kliknięcia (linki/przyciski) na stronie ÷ odsłony strony |
| % przeczytania | odsetek osób na stronie, które przewinęły do 25/50/75/100% |
| Strzałka A → B | liczba osób z A, które później trafiły do B; % = ta liczba ÷ osoby w A |

Strzałka z przerywaną ramką = szacunek (co najmniej jeden węzeł ma tylko dane ręczne).

## Wdrożenie (Vercel + GitHub)

1. Vercel → **Add New → Project** → zaimportuj repozytorium `pawel849/analityka`.
2. Baza danych: w projekcie Vercel → **Storage** → dodaj Postgres (np. Neon z Marketplace). Vercel ustawi `DATABASE_URL`.
   Jeśli integracja nazwie zmienną inaczej, dodaj ręcznie `DATABASE_URL` z tym samym adresem.
3. **Settings → Environment Variables**: `APP_PASSWORD` (hasło do logowania) i `AUTH_SECRET` (długi losowy ciąg).
4. Deploy. Tabele tworzą się same przy pierwszym uruchomieniu.
5. W aplikacji: dodaj klienta → projekt → skopiuj skrypt śledzący na strony klienta.

## Lokalnie

```bash
npm install
npm run dev        # bez DATABASE_URL używa wbudowanej bazy PGlite w .data/, logowanie wyłączone
npm test           # testy silnika analizy i wzorów
```

## Dalsze etapy

- Etap 2: strony HTML z Twojego tekstu (tryb ręczny i tryb AI – `ANTHROPIC_API_KEY`), wdrażanie stron na hosting.
- Etap 3: kolejne integracje API (GA4, PostHog, Google Ads, MailerLite, GetResponse, Kajabi, Stripe, Fakturownia).
