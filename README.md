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
- Etap 3: integracje API (GA4, PostHog, Meta Ads, Google Ads, MailerLite, GetResponse, Kajabi, Stripe, Fakturownia).
