import assert from "node:assert";
import { parseBbox, compact, compactNominatim } from "../api/shops.js";
assert.deepEqual(parseBbox("48.99,8.38,49.02,8.43"), [48.99, 8.38, 49.02, 8.43]);
assert.equal(parseBbox("40,8,49,9"), null); assert.equal(parseBbox("48,8,49.5,9.5"), null); assert.equal(parseBbox("x"), null);
const c = compact([{ type: "node", id: 1, lat: 49, lon: 8.4, tags: { shop: "supermarket", brand: "REWE", name: "REWE Ettlinger Tor" } }, { type: "way", id: 2, center: { lat: 49.1, lon: 8.5 }, tags: { amenity: "fuel" } }]);
assert.equal(c.length, 2); assert.equal(c[1].name, "Tankstelle"); assert.equal(c[0].id, "node/1");
const nm = compactNominatim([{ osm_type: "node", osm_id: 7, lat: "49.01", lon: "8.4", name: "Lidl", type: "supermarket", extratags: { brand: "Lidl" } }, { osm_type: "way", osm_id: 8, lat: "49", lon: "8.41", name: "", type: "fuel" }]);
assert.equal(nm[0].id, "node/7"); assert.equal(nm[0].brand, "Lidl"); assert.equal(nm[1].name, "Tankstelle");
console.log("shops ok");
