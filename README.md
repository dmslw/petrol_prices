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

## Zmienne srodowiskowe

- `PORT` - port HTTP
- `HOST` - host bindowania, domyslnie `0.0.0.0`
- `DB_PATH` - sciezka do pliku SQLite
- `ADMIN_USERNAME` - login admina przy pierwszym uruchomieniu
- `ADMIN_PASSWORD` - haslo admina przy pierwszym uruchomieniu

## Publikacja na Railway

1. Wrzuć projekt do repozytorium GitHub.
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

- dodac zmiane hasla
- dodac reset hasla
- dodac rate limiting i captcha
- dodac regulamin i polityke prywatnosci
- dodac backup bazy danych
