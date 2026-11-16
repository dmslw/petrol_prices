# Ceny Paliw

Prosta aplikacja webowa do zglaszania cen paliw na stacjach w Polsce. Front pokazuje mape stacji z OpenStreetMap, liste zgloszen, logowanie uzytkownikow i panel admina.

## Wymagania

- Node.js 22+

## Start lokalny

```powershell
npm start
```

Aplikacja bedzie dostepna pod `http://127.0.0.1:3000`.

Domyslne dane administracyjne sa przeznaczone **wylacznie do lokalnego developmentu**:

- login: `admin`
- haslo: `admin123`

**WAZNE:** Przed publicznym wdrozeniem ustaw silne `ADMIN_PASSWORD` i zmien haslo istniejacego konta administratora. Zmiana samej zmiennej srodowiskowej nie resetuje hasla konta zapisanego juz w SQLite.

Mozesz je zmienic przez zmienne srodowiskowe:

```powershell
$env:ADMIN_USERNAME="twoj-admin"
$env:ADMIN_PASSWORD="mocne-haslo"
npm start
```

## Szybki test

```powershell
npm run test:smoke
```

Test sprawdza:

- start serwera
- rejestracje
- logowanie
- dodanie zgloszenia
- panel admina
- usuwanie zgloszenia

## Import stacji do bazy

Jednorazowy import wiekszej liczby stacji do bazy SQLite wskazanej przez `DB_PATH`:

```powershell
npm run import:stations
```

Ta komenda:

- pobiera stacje paliw z OpenStreetMap partiami dla obszaru Polski,
- zapisuje je do tabeli `stations`,
- aktualizuje istniejace rekordy po identyfikatorze OSM.

Do codziennego odswiezania mozesz uzywac tej samej komendy:

```powershell
npm run sync:stations
```

Najlepiej uruchamiac ja raz dziennie w nocy z poziomu osobnego zadania. Uwaga: osobny serwis Railway nie wspoldzieli automatycznie systemu plikow glownego serwisu; import musi korzystac z tej samej trwalej bazy. Nie zakladaj, ze samo uruchomienie cron joba zaktualizuje baze produkcyjna.

## Backup bazy danych

Reczna kopia zapasowa lokalnej bazy SQLite:

```powershell
npm run backup:db
```

Skrypt tworzy spojna kopie bazy (`VACUUM INTO`) w katalogu `data/backups` z nazwa
opatrzona znacznikiem czasu i automatycznie usuwa najstarsze kopie. Mozna go bezpiecznie
uruchamiac przy dzialajacym serwerze.

Zmienne srodowiskowe:

- `BACKUP_DIR` - katalog na kopie (domyslnie `data/backups`)
- `BACKUP_KEEP` - ile ostatnich kopii zachowac (domyslnie `14`)

Do regularnych kopii ustaw te komende w nocnym cron jobie obok `sync:stations`.

## Reset hasla uzytkownika

Reset hasla odbywa sie przez administratora. W panelu admina przy kazdym uzytkowniku
jest przycisk `Resetuj haslo`, ktory generuje jednorazowe tymczasowe haslo (pokazywane
adminowi raz) i wylogowuje wszystkie biezace sesje danego uzytkownika. Uzytkownik po
zalogowaniu tymczasowym haslem powinien ustawic wlasne w sekcji `Zmiana hasla`.

## Zmienne srodowiskowe

- `PORT` - port HTTP
- `HOST` - host bindowania, domyslnie `0.0.0.0`
- `DB_PATH` - sciezka do pliku SQLite
- `ADMIN_USERNAME` - login admina przy pierwszym uruchomieniu
- `ADMIN_PASSWORD` - haslo admina przy pierwszym uruchomieniu (nie zmienia hasla istniejacego konta)
- `SEED_DEMO_DATA` - ustaw `true` tylko do lokalnych testow, aby wypelnic pusta baze przykladowymi stacjami i cenami
- `SECURE_COOKIES` - `true`/`false`, wymusza ciasteczka `Secure` i naglowek HSTS (domyslnie wlaczone na produkcji)
- `MAX_BODY_BYTES` - maksymalny rozmiar zadania w bajtach (domyslnie `1048576`)
- `AUTH_RATE_LIMIT_MAX` - liczba prob logowania/rejestracji na okno czasu i adres IP (domyslnie `10`)
- `AUTH_RATE_LIMIT_WINDOW_MS` - dlugosc okna rate limitera w ms (domyslnie `900000`)

## Publikacja na Railway

1. Wrzuc projekt do repozytorium GitHub.
2. Utworz nowy projekt w Railway i podlacz repo.
3. Dodaj trwaly Railway Volume (np. mount path `/data`) i ustaw `DB_PATH=/data/fuel-prices.db`. Nie uzywaj domyslnej sciezki w nietrwalym systemie plikow kontenera.
4. Ustaw zmienne:
   - `HOST=0.0.0.0`
   - `ADMIN_USERNAME=admin`
   - `ADMIN_PASSWORD=zmien-to-na-mocne-haslo`
   - `DB_PATH=/data/fuel-prices.db`
   - `NODE_ENV=production`
5. Deploy uruchomi `npm start`.
6. Sprawdz `/api/health`, `/api/stations` i `/api/reports`.
7. Przed pierwszym importem wykonaj backup. Uruchamiaj `npm run import:stations` w srodowisku z dostepem do tego samego wolumenu i `DB_PATH` (np. w powloce dzialajacego serwisu, jezeli dostepna). Import korzysta z zewnetrznego Overpass API i moze potrwac kilka minut lub zakonczyc sie bledem limitu API.
8. Po ponownym wdrozeniu sprawdz, czy liczba stacji i zgloszen nie zniknela.

Dane demonstracyjne sa domyslnie wylaczone. Wylacznie w lokalnym srodowisku testowym mozna ustawic `SEED_DEMO_DATA=true`. Zmiana ta **nie usuwa** danych demonstracyjnych dodanych wczesniej. Nie kasuj rekordow w produkcji bez kopii i sprawdzenia powiazan.

### Bezpieczne wdrozenie zmian

- Zrob kopie bazy **poza wolumenem Railway** (backup przechowywany na tym samym wolumenie nie chroni przed jego utrata).
- Sprawdz `DB_PATH` i mount path wolumenu przed zmianami; nie zmieniaj sciezki istniejacej bazy bez migracji danych.
- Zweryfikuj, czy konto admina nie ma nadal hasla `admin123`.
- Testy lokalne: `npm run test:smoke` (nie uruchamiaj testow modyfikujacych dane na produkcyjnej bazie).

Repo zawiera plik `railway.json`.

## Publikacja na Render

1. Podlacz repo w Render.
2. Ustaw persistent disk i wskaz katalog `data`.
3. Ustaw zmienne:
   - `HOST=0.0.0.0`
   - `ADMIN_USERNAME=admin`
   - `ADMIN_PASSWORD=zmien-to-na-mocne-haslo`
4. Start command: `npm start`

Repo zawiera plik `render.yaml`.

## Co jeszcze warto zrobic przed publicznym startem

- [x] zmiana hasla
- [x] reset hasla (przez admina)
- [x] rate limiting na logowaniu/rejestracji (captcha opcjonalnie)
- [x] regulamin i polityka prywatnosci (uzupelnic dane administratora w plikach `regulamin.html` i `polityka-prywatnosci.html`)
- [x] backup bazy danych (`npm run backup:db`)
- [x] limit rozmiaru zadania i naglowki bezpieczenstwa (CSP, nosniff, X-Frame-Options)
- [x] podstawowe SEO (meta description, Open Graph, favicon, robots.txt, sitemap.xml, dane strukturalne)

## SEO i domena

Strona ma podstawowe SEO: `meta description`, Open Graph/Twitter Card, favicone (`favicon.svg`),
`robots.txt`, `sitemap.xml`, link `canonical` oraz dane strukturalne JSON-LD.

Domena produkcyjna: `https://www.cenalitra.pl` (wersja z `www`; gole `cenalitra.pl`
powinno przekierowywac na nia). Adresy sa zapisane w `index.html`, `regulamin.html`,
`polityka-prywatnosci.html`, `robots.txt` i `sitemap.xml`.

Warto tez dodac obrazek podgladu social media (1200x630 px) i wskazac go w `og:image`,
oraz zarejestrowac strone w Google Search Console i wyslac tam `sitemap.xml`.
