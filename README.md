# Monster-Preise

WebApp im hellen White-Look, die die aktuellen Monster-Energy-Angebote aus den Supermarkt-Prospekten (REWE, Edeka, Kaufland, Lidl, Netto, Aldi, Penny …) für eine PLZ zeigt. Standardmäßig ist **Ultra White** ausgewählt, sortiert nach Preis pro Dose.

Dazu gibt es eine **Karte**, auf der Nutzer pro Laden melden können, ob es dort gerade Ultra White gibt. Meldungen gelten 7 Tage.

## Aufbau
- `index.html`: Oberfläche (statisch, kein Build), Karte mit Leaflet, Läden aus OpenStreetMap (Overpass)
- `api/offers.js`: holt Angebote über die inoffizielle Marktguru-API (`/api/offers?zip=76137`), 30 min Edge-Cache
- `api/reports.js`: Meldungen lesen/schreiben (`GET`/`POST /api/reports`), gespeichert in Upstash Redis, max. 30 Meldungen pro IP und Stunde
- `test/`: `node test/run.mjs && node test/reports.mjs`

## Deploy
1. Repo in Vercel importieren, Framework „Other“, keine Build-Einstellungen.
2. Für die Karten-Meldungen: im Vercel-Projekt **Storage → Create Database → Upstash (Redis)** anlegen und mit dem Projekt verbinden. Das setzt `KV_REST_API_URL` und `KV_REST_API_TOKEN` automatisch. Danach einmal neu deployen.

Ohne Redis läuft der Preisvergleich trotzdem, nur die Meldungen sind dann aus.

Hinweis: Die Marktguru-API ist inoffiziell und kann sich ändern. Normalpreise ohne Angebot sind nicht enthalten. Private Fan-Seite, kein offizielles Angebot von Monster Energy.
