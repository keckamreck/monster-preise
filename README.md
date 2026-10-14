# Monster-Preise

WebApp im hellen White-Look, die die aktuellen Monster-Energy-Angebote aus den Supermarkt-Prospekten (REWE, Edeka, Kaufland, Lidl, Netto, Aldi, Penny …) für eine PLZ zeigt. Standardmäßig ist **Ultra White** ausgewählt (alle anderen Sorten wählbar), dazu der Zeitraum diese Woche / nächste Woche / alle. Vergleich pro Supermarkt: Angebot plus Normalpreis. Der Normalpreis ist überall die UVP von 1,59 € pro 0,5-l-Dose (ohne Pfand). Alles darunter ist ein Angebot, Prospektpreise ab 1,59 € pro Dose werden verworfen. Unter „Alle“ ist die Angebotsliste nach Woche gruppiert.

Dazu gibt es eine **Karte**, auf der Nutzer pro Laden melden können, ob es dort gerade Ultra White gibt. Meldungen gelten 7 Tage.

Die Karte und die Sortenauswahl sind noch in Entwicklung und in Produktion ausgeblendet (ohne Auswahl gilt immer Ultra White). Lokal (`localhost`) sind beide automatisch sichtbar, online mit `?dev=karte`, `?dev=sorte` oder `?dev=karte,sorte` an der URL. Freischalten: `MAP_ENABLED` bzw. `FLAVOR_SELECT_ENABLED` in `index.html` auf `true` setzen.

Angebote von Scheck-in Center werden komplett herausgefiltert (`BLOCKED_RETAILERS` in `api/offers.js`).

## Aufbau
- `index.html`: Oberfläche (statisch, kein Build), Karte mit Leaflet (wird nur bei freigeschalteter Karte nachgeladen), Läden aus OpenStreetMap (Overpass)
- `api/offers.js`: holt Angebote über die inoffizielle Marktguru-API (`/api/offers?zip=76137`), 30 min Edge-Cache
- `api/reports.js`: Meldungen lesen/schreiben (`GET`/`POST /api/reports`), gespeichert in Neon Postgres (`mp_reports`), max. 30 Meldungen pro IP und Stunde
- `api/prices.js`: Nutzer-Regalpreise je Kette (`mp_prices`), Median der letzten 30 Tage. Wird von der Oberfläche aktuell nicht genutzt, da der Normalpreis fest die UVP ist
- `api/shops.js`: Läden im Ausschnitt über Nominatim
- `lib/db.js`: Neon-Verbindung (`DATABASE_URL`), Tabellen werden automatisch angelegt
- `test/`: `npm test` (DB-Tests brauchen eine lokale Postgres, siehe `test/pgq.mjs`)

## Deploy
1. Repo in Vercel importieren, Framework „Other“, keine Build-Einstellungen.
2. Für Meldungen: im Vercel-Projekt **Storage → Create Database → Neon** anlegen und mit dem Projekt verbinden (setzt `DATABASE_URL`). Danach einmal neu deployen.

Ohne Datenbank läuft der Preisvergleich trotzdem, nur die Meldungen sind dann aus.

Hinweis: Die Marktguru-API ist inoffiziell und kann sich ändern. Private Fan-Seite, kein offizielles Angebot von Monster Energy.
