# Monster-Preise

WebApp im hellen White-Look, die die aktuellen Monster-Energy-Angebote aus den Supermarkt-Prospekten (REWE, Edeka, Kaufland, Lidl, Netto, Aldi, Penny …) für eine PLZ zeigt. Standardmäßig ist **Ultra White** ausgewählt (alle anderen Sorten wählbar), dazu der Zeitraum diese Woche / nächste Woche / alle. Vergleich pro Supermarkt: Angebot plus Normalpreis (Nutzer-Meldungen, Prospekt oder Richtwert).

Dazu gibt es eine **Karte**, auf der Nutzer pro Laden melden können, ob es dort gerade Ultra White gibt. Meldungen gelten 7 Tage.

## Aufbau
- `index.html`: Oberfläche (statisch, kein Build), Karte mit Leaflet, Läden aus OpenStreetMap (Overpass)
- `api/offers.js`: holt Angebote über die inoffizielle Marktguru-API (`/api/offers?zip=76137`), 30 min Edge-Cache
- `api/reports.js`: Meldungen lesen/schreiben (`GET`/`POST /api/reports`), gespeichert in Neon Postgres (`mp_reports`), max. 30 Meldungen pro IP und Stunde
- `api/prices.js`: Nutzer-Regalpreise je Kette (`mp_prices`), Median der letzten 30 Tage
- `api/shops.js`: Läden im Ausschnitt über Nominatim
- `lib/db.js`: Neon-Verbindung (`DATABASE_URL`), Tabellen werden automatisch angelegt
- `test/`: `npm test` (DB-Tests brauchen eine lokale Postgres, siehe `test/pgq.mjs`)

## Deploy
1. Repo in Vercel importieren, Framework „Other“, keine Build-Einstellungen.
2. Für Meldungen: im Vercel-Projekt **Storage → Create Database → Neon** anlegen und mit dem Projekt verbinden (setzt `DATABASE_URL`). Danach einmal neu deployen.

Ohne Datenbank läuft der Preisvergleich trotzdem, nur die Meldungen sind dann aus.

Hinweis: Die Marktguru-API ist inoffiziell und kann sich ändern. Normalpreise ohne Angebot sind nicht enthalten. Private Fan-Seite, kein offizielles Angebot von Monster Energy.
