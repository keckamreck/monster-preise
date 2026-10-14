// Supermarktketten, die die Seite kennt (Händler-Auswahl auf der Startseite, Läden auf der Karte).
// Schlüssel und Muster müssen zu RETAILERS in index.html passen (test/chains.mjs prüft das).
export const CHAINS = [
  ["aldi-sued", "Aldi Süd", /aldi\s*s(ü|ue)d/],
  ["aldi-nord", "Aldi Nord", /aldi\s*nord/],
  ["edeka", "Edeka", /edeka|\be\s*-?\s*center\b|marktkauf/],
  ["kaufland", "Kaufland", /kaufland/],
  ["lidl", "Lidl", /lidl/],
  ["netto", "Netto", /netto/],
  ["norma", "Norma", /\bnorma\b/],
  ["penny", "Penny", /penny/],
  ["rewe", "REWE", /rewe/],
  ["globus", "Globus", /globus/],
];

const WIKIDATA = { Q41171373: "aldi-sued", Q41171672: "aldi-nord" };

// Kette eines Ladens aus Name/Marke (OSM), sonst null
export function chainOf({ name = "", brand = "", wikidata = "", lat, lon } = {}) {
  if (WIKIDATA[wikidata]) return WIKIDATA[wikidata];
  const t = `${brand} ${name}`.toLowerCase();
  const hit = CHAINS.find(([, , re]) => re.test(t));
  if (hit) return hit[0];
  // „Aldi“ ohne Zusatz: grob nach Region. Aldi Süd hat Bayern, Baden-Württemberg, Saarland,
  // Rheinland-Pfalz, Hessen und das südliche NRW, Aldi Nord den Rest.
  if (/\baldi\b/.test(t)) {
    const la = Number(lat), lo = Number(lon);
    return la < 50.35 || (lo < 10.2 && la < 51.4) ? "aldi-sued" : "aldi-nord";
  }
  return null;
}
