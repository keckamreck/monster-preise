# Monster-Preise

Kleine WebApp, die die aktuellen Monster-Energy-Angebote aus den Supermarkt-Prospekten (REWE, Kaufland, Lidl, Netto, Edeka, Penny …) für eine PLZ zeigt und nach Preis pro Dose sortiert.

- `index.html`: Oberfläche (statisch, kein Build)
- `api/offers.js`: Vercel-Serverless-Funktion, holt die Angebote über die inoffizielle Marktguru-API (`/api/offers?zip=76137`), Antwort 30 min im Edge-Cache

## Deploy
Repo in Vercel importieren, Framework „Other“, keine Build-Einstellungen nötig.

Hinweis: Die Marktguru-API ist inoffiziell und kann sich ändern. Normalpreise ohne Angebot sind nicht enthalten.
