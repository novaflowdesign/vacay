-- ============================================================
-- SCHEMAT BAZY DANYCH — Trip Expense Tracker
-- Supabase / PostgreSQL
-- ============================================================

-- ============================================================
-- 1. PROFILE UŻYTKOWNIKÓW (rozszerzenie auth.users)
-- ============================================================

create type user_role as enum ('admin', 'viewer');

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,          -- np. "Ja", "Teść" -> edytowalne na cokolwiek
  role user_role not null default 'viewer',
  created_at timestamptz not null default now()
);

-- Trigger: automatyczne tworzenie profilu po rejestracji w auth.users
create function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', new.email), 'viewer');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();


-- ============================================================
-- 2. WYJAZDY
-- ============================================================

create table trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country_code text,                   -- ISO 3166-1 alpha-2, np. 'PL', 'ES' — do mapy
  start_date date,
  end_date date,
  default_total_people int not null default 5,
  notes text,                          -- tab "Info" — dowolne notatki o wyjeździe
  photo_url text,                      -- publiczny URL zdjęcia w Supabase Storage (bucket "trip-photos")
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Uczestnicy wyjazdu — imię/etykieta używana przy dzieleniu wydatków (patrz
-- expense_payments.payer_label), niekoniecznie konto w systemie (np. "Teść").
-- Jeśli profile_id jest ustawione, to konto dostaje dostęp do tego wyjazdu
-- (patrz RLS niżej) i jego kraj automatycznie ląduje na mapie tej osoby.
create table trip_participants (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  name text not null,
  profile_id uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (trip_id, name),
  unique (trip_id, profile_id)
);


-- ============================================================
-- 3. KATEGORIE WYDATKÓW (edytowalne nazwy)
-- ============================================================

create table expense_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,                  -- np. "Jedzenie", "Nocleg" — edytowalne
  icon text,                           -- emoji lub nazwa ikony, np. "🍽️"
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Seed - domyślne kategorie
insert into expense_categories (name, icon) values
  ('Jedzenie', '🍽️'),
  ('Nocleg', '🏨'),
  ('Transport', '🚗'),
  ('Atrakcje', '🎫'),
  ('Inne', '🛒');


-- ============================================================
-- 3b. WALUTY (edytowalna lista walut, w których można zapisywać wydatki)
-- ============================================================

create table currencies (
  code text primary key,               -- ISO 4217, np. 'PLN', 'EUR', 'USD'
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

insert into currencies (code) values ('PLN'), ('EUR');


-- ============================================================
-- 4. WYDATKI + PŁATNICY (elastyczny model "bloków")
-- ============================================================

create table expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  category_id uuid references expense_categories(id),
  total_amount numeric(10,2) not null check (total_amount > 0),
  currency text not null default 'PLN' references currencies(code),
  total_people int not null,            -- ile osób bierze udział w TYM wydatku
  is_personal boolean not null default false, -- wydatek osobisty: liczy się do sum/statystyk,
                                               -- ale NIE generuje długu (patrz widok expense_balances)
  description text,
  expense_date date not null default current_date,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- Płatnicy per wydatek (elastyczna liczba "bloków")
create table expense_payments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references expenses(id) on delete cascade,
  payer_profile_id uuid references profiles(id),   -- kto płacił (może być NULL jeśli płatnik spoza systemu)
  payer_label text,                                -- etykieta wyświetlana, np. "Teść" (nadpisuje display_name jeśli trzeba)
  amount_paid numeric(10,2) not null default 0,
  people_covered int not null default 1,           -- za ile osób ten płatnik odpowiada
  check (people_covered > 0)
);

-- Walidacja: suma amount_paid wszystkich płatników wydatku = total_amount
-- (egzekwowane w aplikacji przy zapisie, opcjonalnie można dodać trigger sprawdzający)


-- ============================================================
-- 5. ODWIEDZONE KRAJE (mapa)
-- ============================================================

-- Mapa jest prywatna per konto — każdy zaznacza swoje własne odwiedzone kraje.
-- Gdy trip_id jest ustawione, wpis powstał automatycznie z podpięcia konta do
-- wyjazdu (patrz trip_participants) i znika razem z tym wyjazdem (on delete cascade).
create table visited_countries (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,          -- ISO 3166-1 alpha-2
  profile_id uuid not null references profiles(id) on delete cascade,
  trip_id uuid references trips(id) on delete cascade,
  first_visited_date date,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (country_code, profile_id)
);

create table visited_localities (
  id uuid primary key default gen_random_uuid(),
  country_code text not null,
  profile_id uuid not null references profiles(id) on delete cascade,
  name text not null,                  -- np. "Barcelona"
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  foreign key (country_code, profile_id) references visited_countries(country_code, profile_id) on delete cascade
);


-- ============================================================
-- 6. PLAN WYJAZDU (dzień po dniu)
-- ============================================================

create table itinerary_days (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  day_date date not null,
  day_number int not null,
  title text,                          -- np. "Zwiedzanie Starówki"
  unique (trip_id, day_number)
);

create table itinerary_items (
  id uuid primary key default gen_random_uuid(),
  day_id uuid not null references itinerary_days(id) on delete cascade,
  time text,                           -- opcjonalna godzina, np. "10:00"
  title text not null,
  description text,
  category text,                       -- 'zwiedzanie' / 'jedzenie' / 'transport' / 'odpoczynek'
  order_index int not null default 0
);


-- ============================================================
-- 7. CIEKAWOSTKI / TIPY O MIEJSCACH (cache, zapisywane jako kafelki)
-- ============================================================

create table place_tips (
  id uuid primary key default gen_random_uuid(),
  country text not null,
  city text not null,
  attractions jsonb,                   -- lista atrakcji [{title, description}]
  warnings jsonb,                      -- lista uwag [{title, description}]
  tips jsonb,                          -- lista praktycznych tipów
  source_url text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique (country, city)                -- cache: to samo miasto nie jest pytane dwa razy
);


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table profiles enable row level security;
alter table trips enable row level security;
alter table trip_participants enable row level security;
alter table expense_categories enable row level security;
alter table currencies enable row level security;
alter table expenses enable row level security;
alter table expense_payments enable row level security;
alter table visited_countries enable row level security;
alter table visited_localities enable row level security;
alter table itinerary_days enable row level security;
alter table itinerary_items enable row level security;
alter table place_tips enable row level security;

-- Pomocnicza funkcja: czy zalogowany user jest adminem?
create function is_admin()
returns boolean as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable;

-- ---- profiles ----
create policy "Wszyscy zalogowani widzą profile" on profiles
  for select using (auth.uid() is not null);

create policy "Admin edytuje profile (imiona/role)" on profiles
  for update using (is_admin());

-- ---- trips ----
-- Admin ma pełny dostęp. Każdy inny widzi TYLKO wyjazdy, do których został
-- podpięty jako uczestnik z kontem (trip_participants.profile_id) — patrz
-- opis w sekcji 2 schematu. Insert/update/delete cały czas tylko dla admina.
create policy "Uczestnicy i admin widzą wyjazdy" on trips
  for select using (
    is_admin()
    or exists (
      select 1 from trip_participants tp
      where tp.trip_id = trips.id and tp.profile_id = auth.uid()
    )
  );

create policy "Admin zarządza wyjazdami" on trips
  for insert with check (is_admin());
create policy "Admin edytuje wyjazdy" on trips
  for update using (is_admin());
create policy "Admin usuwa wyjazdy" on trips
  for delete using (is_admin());

-- ---- trip_participants ----
create policy "Uczestnicy i admin widzą listę uczestników" on trip_participants
  for select using (
    is_admin()
    or exists (
      select 1 from trip_participants tp2
      where tp2.trip_id = trip_participants.trip_id and tp2.profile_id = auth.uid()
    )
  );
create policy "Admin zarządza uczestnikami" on trip_participants
  for all using (is_admin()) with check (is_admin());

-- ---- expense_categories ----
create policy "Wszyscy widzą kategorie" on expense_categories
  for select using (auth.uid() is not null);
create policy "Admin zarządza kategoriami" on expense_categories
  for insert with check (is_admin());
create policy "Admin edytuje kategorie" on expense_categories
  for update using (is_admin());
create policy "Admin usuwa kategorie" on expense_categories
  for delete using (is_admin());

-- ---- currencies ----
create policy "Wszyscy widzą waluty" on currencies
  for select using (auth.uid() is not null);
create policy "Admin dodaje waluty" on currencies
  for insert with check (is_admin());
create policy "Admin usuwa waluty" on currencies
  for delete using (is_admin());

-- ---- expenses ----
create policy "Uczestnicy i admin widzą wydatki" on expenses
  for select using (
    is_admin()
    or exists (
      select 1 from trip_participants tp
      where tp.trip_id = expenses.trip_id and tp.profile_id = auth.uid()
    )
  );
create policy "Admin dodaje wydatki" on expenses
  for insert with check (is_admin());
create policy "Admin edytuje wydatki" on expenses
  for update using (is_admin());
create policy "Admin usuwa wydatki" on expenses
  for delete using (is_admin());

-- ---- expense_payments ----
create policy "Uczestnicy i admin widzą płatności" on expense_payments
  for select using (
    is_admin()
    or exists (
      select 1 from expenses e
      join trip_participants tp on tp.trip_id = e.trip_id
      where e.id = expense_payments.expense_id and tp.profile_id = auth.uid()
    )
  );
create policy "Admin zarządza płatnościami" on expense_payments
  for all using (is_admin()) with check (is_admin());

-- ---- visited_countries ----
-- Mapa jest prywatna: każdy zarządza tylko swoimi wpisami; admin może też,
-- bo to on automatycznie dopisuje/kasuje kraje przy podpinaniu uczestników.
create policy "Własna mapa lub admin" on visited_countries
  for all using (profile_id = auth.uid() or is_admin())
  with check (profile_id = auth.uid() or is_admin());

-- ---- visited_localities ----
create policy "Własne miejscowości lub admin" on visited_localities
  for all using (profile_id = auth.uid() or is_admin())
  with check (profile_id = auth.uid() or is_admin());

-- ---- itinerary_days ----
create policy "Uczestnicy i admin widzą plan" on itinerary_days
  for select using (
    is_admin()
    or exists (
      select 1 from trip_participants tp
      where tp.trip_id = itinerary_days.trip_id and tp.profile_id = auth.uid()
    )
  );
create policy "Admin zarządza planem dni" on itinerary_days
  for all using (is_admin()) with check (is_admin());

-- ---- itinerary_items ----
create policy "Uczestnicy i admin widzą punkty planu" on itinerary_items
  for select using (
    is_admin()
    or exists (
      select 1 from itinerary_days d
      join trip_participants tp on tp.trip_id = d.trip_id
      where d.id = itinerary_items.day_id and tp.profile_id = auth.uid()
    )
  );
create policy "Admin zarządza punktami planu" on itinerary_items
  for all using (is_admin()) with check (is_admin());

-- ---- place_tips ----
-- Wszyscy zalogowani mogą czytać I dopisywać nowe (cache) - to nie są dane "wyjazdowe" tylko ogólny cache
create policy "Wszyscy widzą ciekawostki" on place_tips
  for select using (auth.uid() is not null);
create policy "Wszyscy mogą dopisać do cache ciekawostek" on place_tips
  for insert with check (auth.uid() is not null);


-- ============================================================
-- WIDOKI POMOCNICZE (do liczenia sald)
-- ============================================================

-- Saldo każdego płatnika w każdym wydatku:
-- saldo = amount_paid - (total_amount * people_covered / total_people)
-- Wydatki "osobiste" (is_personal) liczą się do sum/statystyk, ale mają saldo = 0
-- (nie generują długu) — patrz kolumna is_personal na expenses.
create view expense_balances as
select
  ep.id as payment_id,
  e.id as expense_id,
  e.trip_id,
  e.currency,
  ep.payer_profile_id,
  ep.payer_label,
  ep.amount_paid,
  case when e.is_personal then 0
       else round(e.total_amount * ep.people_covered::numeric / e.total_people, 2)
  end as share_amount,
  case when e.is_personal then 0
       else round(ep.amount_paid - (e.total_amount * ep.people_covered::numeric / e.total_people), 2)
  end as balance
from expense_payments ep
join expenses e on e.id = ep.expense_id;

-- Saldo zbiorcze per osoba per wyjazd per waluta (do zakładki "Podsumowanie")
-- Osobno per waluta — kwot w różnych walutach nie da się bez przelicznika po prostu zsumować.
create view trip_balances as
select
  trip_id,
  currency,
  payer_profile_id,
  payer_label,
  sum(balance) as total_balance
from expense_balances
group by trip_id, currency, payer_profile_id, payer_label;

-- Suma wydatków per wyjazd per waluta (do kafelka na liście "Wyjazdy")
create view trip_totals as
select
  trip_id,
  currency,
  sum(total_amount) as total_spent
from expenses
group by trip_id, currency;


-- ============================================================
-- SUPABASE STORAGE — zdjęcia wyjazdów
-- ============================================================

-- Bucket "trip-photos": publiczny odczyt (proste <img src>, bez podpisywania URL-i),
-- zapis/edycja/usuwanie tylko dla admina. Darmowy tier Supabase Storage (1 GB / 2 GB
-- transferu) wystarcza z ogromnym zapasem przy tej skali (5 osób, po jednym zdjęciu na wyjazd).
insert into storage.buckets (id, name, public)
values ('trip-photos', 'trip-photos', true)
on conflict (id) do nothing;

create policy "Publiczny odczyt zdjęć wyjazdów"
  on storage.objects for select
  using (bucket_id = 'trip-photos');

create policy "Admin wgrywa zdjęcia wyjazdów"
  on storage.objects for insert
  with check (bucket_id = 'trip-photos' and is_admin());

create policy "Admin nadpisuje zdjęcia wyjazdów"
  on storage.objects for update
  using (bucket_id = 'trip-photos' and is_admin());

create policy "Admin usuwa zdjęcia wyjazdów"
  on storage.objects for delete
  using (bucket_id = 'trip-photos' and is_admin());
