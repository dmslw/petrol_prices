# Ceny Paliw

Prosta aplikacja webowa do zglaszania cen paliw na stacjach w Polsce. Front pokazuje mape stacji z OpenStreetMap, liste zgloszen, logowanie uzytkownikow i panel admina.

## Wymagania

- Node.js 22+

## Start lokalny

```powershell
npm start
```

Aplikacja bedzie dostepna pod `http://127.0.0.1:3000`.

Domyslne konto admina:

- login: `admin`
- haslo: `admin123`

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

Jednorazowy import wiekszej liczby stacji do lokalnej bazy SQLite:

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

Najlepiej uruchamiac ja raz dziennie w nocy z poziomu Railway cron job albo innego schedulera.

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
- `ADMIN_PASSWORD` - haslo admina przy pierwszym uruchomieniu
- `SECURE_COOKIES` - `true`/`false`, wymusza ciasteczka `Secure` i naglowek HSTS (domyslnie wlaczone na produkcji)
- `MAX_BODY_BYTES` - maksymalny rozmiar zadania w bajtach (domyslnie `1048576`)
- `AUTH_RATE_LIMIT_MAX` - liczba prob logowania/rejestracji na okno czasu i adres IP (domyslnie `10`)
- `AUTH_RATE_LIMIT_WINDOW_MS` - dlugosc okna rate limitera w ms (domyslnie `900000`)

## Publikacja na Railway

1. Wrzuc projekt do repozytorium GitHub.
2. Utworz nowy projekt w Railway i podlacz repo.
3. Ustaw volume zamontowany do katalogu `data`.
4. Ustaw zmienne:
   - `HOST=0.0.0.0`
   - `ADMIN_USERNAME=admin`
   - `ADMIN_PASSWORD=zmien-to-na-mocne-haslo`
5. Deploy uruchomi `npm start`.

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

Przed publikacja podmien placeholder `https://twoja-domena.pl` na swoja domene w plikach:

- `index.html` (canonical, og:url, JSON-LD)
- `regulamin.html` i `polityka-prywatnosci.html` (canonical)
- `robots.txt` (adres sitemap)
- `sitemap.xml` (adresy stron i `lastmod`)

Warto tez dodac obrazek podgladu social media (1200x630 px) i wskazac go w `og:image`,
oraz zarejestrowac strone w Google Search Console i wyslac tam `sitemap.xml`.
