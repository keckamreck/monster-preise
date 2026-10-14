import assert from "node:assert";
import { readFileSync } from "node:fs";
import { CHAINS, chainOf } from "../lib/chains.js";

assert.equal(chainOf({ name: "REWE Ettlinger Tor" }), "rewe");
assert.equal(chainOf({ name: "ALDI SÜD" }), "aldi-sued");
assert.equal(chainOf({ name: "Aldi Nord" }), "aldi-nord");
assert.equal(chainOf({ name: "E center Durlach" }), "edeka");
assert.equal(chainOf({ name: "Marktkauf" }), "edeka");
assert.equal(chainOf({ name: "Netto Marken-Discount" }), "netto");
assert.equal(chainOf({ name: "Norma" }), "norma");
assert.equal(chainOf({ name: "Shopping Store center" }), null, "„e center“ nur als eigenes Wort");
assert.equal(chainOf({ name: "Aral" }), null);
assert.equal(chainOf({ name: "Kiosk am Eck" }), null);
// „Aldi“ ohne Zusatz: Marke laut Wikidata, sonst grob nach Region
assert.equal(chainOf({ name: "ALDI", wikidata: "Q41171373", lat: 53.5, lon: 10 }), "aldi-sued");
assert.equal(chainOf({ name: "ALDI", lat: 49.0, lon: 8.4 }), "aldi-sued");  // Karlsruhe
assert.equal(chainOf({ name: "ALDI", lat: 50.94, lon: 6.96 }), "aldi-sued"); // Köln
assert.equal(chainOf({ name: "ALDI", lat: 53.55, lon: 10.0 }), "aldi-nord"); // Hamburg
assert.equal(chainOf({ name: "ALDI", lat: 51.05, lon: 13.74 }), "aldi-nord"); // Dresden

// Oberfläche und Server kennen dieselben Ketten
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const block = html.match(/const RETAILERS = \[([\s\S]*?)\n  \];/);
assert.ok(block, "RETAILERS in index.html gefunden");
const ui = [...block[1].matchAll(/\["([a-z-]+)", "([^"]+)"/g)].map((m) => [m[1], m[2]]);
assert.deepEqual(ui, CHAINS.map(([k, l]) => [k, l]), "Ketten in index.html und lib/chains.js stimmen überein");
console.log("chains ok");
