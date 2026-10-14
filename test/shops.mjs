import assert from "node:assert";
import { parseBbox, compact, compactNominatim } from "../api/shops.js";
assert.deepEqual(parseBbox("48.99,8.38,49.02,8.43"), [48.99, 8.38, 49.02, 8.43]);
assert.equal(parseBbox("40,8,49,9"), null); assert.equal(parseBbox("48,8,49.5,9.5"), null); assert.equal(parseBbox("x"), null);
// nur Supermärkte der bekannten Ketten, Kette wird erkannt
const c = compact([
  { type: "node", id: 1, lat: 49, lon: 8.4, tags: { shop: "supermarket", brand: "REWE", name: "REWE Ettlinger Tor" } },
  { type: "way", id: 2, center: { lat: 49.1, lon: 8.5 }, tags: { amenity: "fuel", name: "Aral" } },
  { type: "way", id: 3, center: { lat: 49.1, lon: 8.5 }, tags: { shop: "supermarket", name: "Bioladen Sonnenschein" } },
  { type: "node", id: 4, lat: 49, lon: 8.4, tags: { shop: "supermarket", name: "ALDI", "brand:wikidata": "Q41171672" } },
]);
assert.deepEqual(c.map((x) => [x.id, x.chain]), [["node/1", "rewe"], ["node/4", "aldi-nord"]]);
const nm = compactNominatim([
  { osm_type: "node", osm_id: 7, lat: "49.01", lon: "8.4", name: "Lidl", type: "supermarket", extratags: { brand: "Lidl" } },
  { osm_type: "way", osm_id: 8, lat: "49", lon: "8.41", name: "", type: "supermarket" },
  { osm_type: "node", osm_id: 9, lat: "49", lon: "8.41", name: "Netto Marken-Discount", type: "supermarket" },
  { osm_type: "node", osm_id: 10, lat: "49", lon: "8.41", name: "Kiosk am Eck", type: "kiosk" },
]);
assert.deepEqual(nm.map((x) => [x.id, x.chain, x.brand]), [["node/7", "lidl", "Lidl"], ["node/9", "netto", ""]]);
console.log("shops ok");

// Fallback: Nominatim fällt aus, dann Overpass
import { fetchShops, overpassQuery } from "../api/shops.js";
assert.match(overpassQuery([48.99, 8.38, 49.02, 8.43]), /\(48\.99,8\.38,49\.02,8\.43\)/);
const seen = [];
const fake = (nomOk, ovOk) => async (url, opts) => {
  const u = String(url);
  seen.push(u.includes("nominatim") ? "nominatim" : "overpass");
  if (u.includes("nominatim")) return nomOk ? new Response(JSON.stringify([{ osm_type: "node", osm_id: 1, lat: "49", lon: "8.4", name: "REWE", type: "supermarket" }])) : new Response("", { status: 503 });
  assert.equal(opts.method, "POST");
  return ovOk ? new Response(JSON.stringify({ elements: [{ type: "node", id: 2, lat: 49, lon: 8.4, tags: { shop: "supermarket", name: "Lidl" } }] })) : new Response("", { status: 504 });
};
let shops = await fetchShops([48.99, 8.38, 49.02, 8.43], fake(true, true));
assert.equal(shops[0].id, "node/1"); assert.ok(!seen.includes("overpass"), "Overpass nur als Ersatz");
shops = await fetchShops([48.99, 8.38, 49.02, 8.43], fake(false, true));
assert.equal(shops[0].id, "node/2"); assert.equal(shops[0].name, "Lidl");
await assert.rejects(fetchShops([48.99, 8.38, 49.02, 8.43], fake(false, false)));
console.log("shops fallback ok");
