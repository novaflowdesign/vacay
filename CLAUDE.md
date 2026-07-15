# Trip Expense Tracker — kontekst projektu

Aplikacja webowa (PWA) do śledzenia wydatków na wyjazdach, dzielenia kosztów między
uczestnikami, kolekcjonowania odwiedzonych krajów na mapie oraz planowania wyjazdów
dzień po dniu. Stack: **Supabase (Postgres + Auth + RLS) + GitHub Pages**, hosting
darmowy, bez subskrypcji, bez płatnych API.

## Stack techniczny

- Frontend: (uzupełnić zgodnie z tym, co już działa w istniejącym projekcie — React/Vite lub podobne)
- Baza danych / Auth: Supabase (darmowy tier)
- Hosting: GitHub Pages
- PWA: manifest.json + service worker (uwaga na `scope`/`start_url` względem subpath GitHub Pages, np. `/repo-name/`)
- Kursy walut: NBP API (`https://api.nbp.pl/`) — darmowe, bez klucza, bez limitu
- Mapa świata: SVG/topojson (np. `world-atlas` + biblioteka do renderowania SVG), kolorowanie krajów po `country_code` (ISO 3166-1 alpha-2)

## Model ról (WAŻNE)

Jest tylko **jeden admin** (Ty) i reszta to **viewerzy**:

- **admin** — pełny dostęp: dodaje/edytuje wyjazdy, wydatki, kategorie, plan dnia po dniu,
  odwiedzone kraje, edytuje imiona/etykiety uczestników.
- **viewer** — wyłącznie podgląd (wyjazdy, wydatki, saldo, mapa, plan wyjazdu).
  Ma pełny dostęp do kalkulatora walut i ciekawostek/planu — te są tylko do odczytu i tak.

Rola trzymana w `profiles.role` (`admin` / `viewer`). Cała logika uprawnień w UI musi
być zgodna z politykami RLS w bazie — **RLS jest źródłem prawdy**, UI tylko ukrywa
przyciski dla viewerów (nie polegać wyłącznie na ukrywaniu w UI jako zabezpieczeniu).

## Model dzielenia kosztów (kluczowa logika biznesowa)

Nie ma sztywnego podziału 1:1 ani stałej piątki płatników. Każdy wydatek ma:

- `total_amount` — całkowita kwota wydatku
- `total_people` — ile osób bierze udział w TYM konkretnym wydatku (domyślnie z ustawień wyjazdu, edytowalne per wydatek — np. gdy ktoś nie idzie na daną atrakcję)
- Elastyczną listę **płatników** (`expense_payments`), gdzie każdy płatnik ma:
  - `amount_paid` — ile faktycznie wpłacił
  - `people_covered` — za ile osób ten płatnik odpowiada (1 = płaci tylko za siebie, N = płaci jako "blok" za N osób, np. teść płaci za siebie + żonę + córkę + jej siostrę = 4)

Wzór na saldo płatnika w danym wydatku:

```
udział_płatnika = total_amount * (people_covered / total_people)
saldo = amount_paid - udział_płatnika
```

Dodatnie saldo = nadpłacił (inni są mu winni), ujemne = jest winien.
Suma sald wszystkich płatników w wydatku musi wynosić 0 — czyli w UI formularza
dodawania wydatku pilnować, żeby suma `amount_paid` wszystkich płatników = `total_amount`.

Salda są już policzone w widokach SQL `expense_balances` i `trip_balances`
(patrz `schema.sql`) — używać ich zamiast liczyć to ręcznie po stronie frontendu
tam gdzie to możliwe.

**Netowanie długów** (debt simplification) potrzebne w zakładce "Podsumowanie" jeśli
w wyjeździe jest więcej niż 2 "bloki" płatników: algorytm zachłanny — dopasuj
największego dłużnika z największym wierzycielem, przelew = min(|dług|, wierzytelność),
powtarzaj aż wszystkie salda = 0. Cel: pokazać kto komu ile ma przelać w minimalnej
liczbie przelewów (max n-1 przelewów), nie rozpisywać tego per wydatek.

## Struktura ekranów (dolna nawigacja, 4 zakładki)

1. **Wyjazdy** — lista kafelków (nazwa, kraj/flaga, daty, **łączna kwota wydana** —
   BEZ informacji kto komu wisi na kafelku). Ikonka trybika w prawym górnym rogu
   → profil/ustawienia (nie osobna zakładka).
2. **Mapa** — kolekcja odwiedzonych krajów, kolorowanie SVG po `visited_countries`.
3. **Kalkulator walut** — EUR/USD/GBP → PLN, kurs z NBP API.
4. **Plan wyjazdu** — lista kafelków wyjazdów → po wejściu: plan dzień po dniu
   (`itinerary_days` + `itinerary_items`), tylko admin edytuje.

### Wewnątrz wyjazdu (po kliknięciu kafelka w zakładce "Wyjazdy")

- Tab **Wydatki** — chronologiczna lista + formularz dodawania (sekcja płatników
  dynamiczna, "+ Dodaj płatnika", pole `total_people`, live-podgląd salda)
- Tab **Podsumowanie** — wynik netowania długów ("Kto komu ile"), wykres wg kategorii,
  suma całkowita
- Tab **Info** — uczestnicy, daty, kraj, notatki

### Ekran "Ciekawostki o miejscu" (jeśli zdecydowano się na tę funkcję zamiast/obok planu)

Pole: kraj + miejscowość → wynik zapisywany jako kafelek w `place_tips` (cache —
to samo miasto pytane tylko raz). Jeśli używane jest zewnętrzne AI, wywołanie MUSI iść
przez backend (Supabase Edge Function), nigdy bezpośrednio z klienta — żeby nie
wystawiać kluczy API w kodzie frontendowym.

## Zasady formatowania / edycji danych

- Nazwy kategorii wydatków (`expense_categories.name`) — edytowalne przez admina.
- Etykiety/imiona uczestników (`profiles.display_name`, `expense_payments.payer_label`)
  — edytowalne przez admina (np. zamiast "Teść" ma być realne imię).
- Kwoty zawsze w `numeric(10,2)`, waluta domyślna PLN, ale `expenses.currency`
  pozwala zapisać wydatek w innej walucie (na przyszłość — na razie kalkulator
  walut jest osobnym, niezależnym narzędziem, nie przelicza automatycznie wydatków).

## Koszty — twarda zasada

Cały projekt ma być **całkowicie darmowy**, bez subskrypcji i bez płatnych API:

- Supabase free tier, GitHub Pages, NBP API — wszystko bez kosztów przy tej skali (5 użytkowników).
- Jeśli dodawana jest jakakolwiek nowa integracja zewnętrzna (nowe API, biblioteka,
  usługa AI) — sprawdzić najpierw, czy ma darmowy tier wystarczający na tę skalę
  użycia, i jasno to zaznaczyć przed wdrożeniem. Nie dodawać niczego wymagającego
  karty płatniczej bez wyraźnej zgody.

## Plik schema.sql

Pełny schemat tabel + RLS policies + widoki pomocnicze (`expense_balances`,
`trip_balances`, `trip_totals`) znajduje się w `schema.sql` w tym samym repo.
Traktować go jako źródło prawdy dla struktury bazy — jeśli trzeba dodać kolumnę/tabelę,
aktualizować ten plik równolegle z migracją w Supabase.
