# Monster-Preise

WebApp im hellen White-Look, die die aktuellen Monster-Energy-Angebote aus den Supermarkt-Prospekten (REWE, Edeka, Kaufland, Lidl, Netto, Aldi, Penny, Norma …) für eine PLZ zeigt.

## Funktionen

- **Preise**: nur **Ultra White** (eine Sortenauswahl gibt es nicht). Angebote, die „versch. Sorten“ nennen, zählen mit, weil Ultra White wahrscheinlich dabei ist. Zeitraum diese Woche / nächste Woche / alle (unter „Alle“ nach Woche gruppiert). Vergleich pro Supermarkt: günstigstes Angebot im Zeitraum oder Normalpreis. Der Normalpreis ist überall die UVP von 1,59 € pro 0,5-l-Dose (ohne Pfand). Alles darunter ist ein Angebot, Prospektpreise ab 1,59 € pro Dose werden verworfen. Händler-Chips blenden Ketten im Preisvergleich ein und aus.
- **Karte**: zeigt nur Supermärkte der Ketten, die auch auf der Startseite auswählbar sind.
  - Ein Tipp auf eine Kette (Chip über der Karte) hebt alle ihre Märkte als Pin in Kettenfarbe hervor, die anderen werden blass. Ist keine Filiale im Ausschnitt, zoomt die Karte zu den nächsten. Unter der Karte stehen die Märkte der Kette, nach Entfernung sortiert.
  - Ein Tipp auf einen Supermarkt öffnet eine Kachel wie bei Google Maps: Adresse, Öffnungszeiten („Geöffnet · bis 22:00“), Entfernung, Ultra-White-Meldungen, **Route** (Google Maps) und **Melden** („White da“ / „Kein White“). Die Kette des Ladens wird dabei mit hervorgehoben.
  - Meldungen gelten 7 Tage, ältere als 2 Tage werden blasser. Wer sich vertippt, kann die eigene Meldung eine Stunde lang ändern. Ohne Auswahl stehen unter der Karte die Meldungen im Ausschnitt.

Angebote von Scheck-in Center werden komplett herausgefiltert (`BLOCKED_RETAILERS` in `api/offers.js`).

## Aufbau
- `index.html`: Oberfläche (statisch, kein Build). Leaflet wird erst beim Öffnen der Karte geladen, Kacheln von OpenStreetMap
- `api/offers.js`: holt Angebote über die inoffizielle Marktguru-API (`/api/offers?zip=76137`), erkennt die Sorten (für Ultra White und die Sorten-Badges), 30 min Edge-Cache
- `api/reports.js`: Meldungen lesen/schreiben (`GET /api/reports?flavor=ultra-white`, `POST /api/reports`), gespeichert in Neon Postgres (`mp_reports`). Eine Meldung pro IP, Laden und Sorte und Stunde (eine zweite ersetzt die erste), max. 30 Meldungen pro IP und Stunde, nur Supermärkte der bekannten Ketten
- `api/shops.js`: Supermärkte der bekannten Ketten im Ausschnitt mit Adresse und Öffnungszeiten (`/api/shops?bbox=s,w,n,e`), über Nominatim, bei Ausfall Overpass, 1 Tag Edge-Cache
- `api/prices.js`: Nutzer-Regalpreise je Kette (`mp_prices`), Median der letzten 30 Tage. Wird von der Oberfläche aktuell nicht genutzt, da der Normalpreis fest die UVP ist
- `lib/chains.js`: die bekannten Ketten und ihre Erkennung aus OSM-Namen/-Marken
- `lib/db.js`: Neon-Verbindung (`DATABASE_URL`), Tabellen werden automatisch angelegt
- `test/`: `npm test`. Die DB-Tests brauchen eine lokale Postgres (Socket über `PGHOST`, Standard `/tmp/claude-0/pg`, Port `PGPORT`, Standard `5499`, siehe `test/pgq.mjs`)

Sorten und Ketten stehen sowohl in `index.html` als auch in `api/offers.js` bzw. `lib/chains.js`. `npm test` prüft, dass beide Listen übereinstimmen, und testet den Öffnungszeiten-Parser aus `index.html`.

## Deploy
1. Repo in Vercel importieren, Framework „Other“, keine Build-Einstellungen.
2. Für Meldungen: im Vercel-Projekt **Storage → Create Database → Neon** anlegen und mit dem Projekt verbinden (setzt `DATABASE_URL`). Danach einmal neu deployen.

Ohne Datenbank läuft der Preisvergleich trotzdem, die Karte zeigt dann die Supermärkte, Melden ist aus.

Hinweis: Die Marktguru-API ist inoffiziell und kann sich ändern. Private Fan-Seite, kein offizielles Angebot von Monster Energy.
