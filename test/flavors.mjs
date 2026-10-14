import assert from "node:assert";
import { readFileSync } from "node:fs";
import { detectFlavors, FLAVORS } from "../api/offers.js";

const f = (desc, name = "Energy Drink") => detectFlavors({ product: { name }, description: desc });

// Grundfälle
assert.deepEqual(f("Ultra White 0,5 l"), ["ultra-white"]);
assert.deepEqual(f("versch. Sorten, je 0,5-l-Dose"), ["*"]);
assert.deepEqual(f("0,5-l-Dose"), ["*"]);
assert.deepEqual(f("Mango Loco"), ["mango-loco"]);
assert.deepEqual(f("Ultra White, Ultra Paradise oder Mango Loco, je 0,5-l-Dose"), ["ultra-white", "ultra-paradise", "mango-loco"]);

// Rosá mit Akzent
assert.deepEqual(f("Monster Energy Ultra Rosá 0,5 l"), ["ultra-rosa"]);
assert.deepEqual(f("Ultra Rosa"), ["ultra-rosa"]);
// Fiesta Mango ist kein Mango Loco
assert.deepEqual(f("Ultra Fiesta Mango, 0,5-l-Dose"), ["ultra-fiesta"]);
assert.deepEqual(f("Ultra Fiesta (Mango)"), ["ultra-fiesta"]);
assert.deepEqual(f("Ultra Fiesta oder Mango Loco"), ["ultra-fiesta", "mango-loco"]);
// Reserve White Pineapple / Watermelon sind Reserve, nicht Ultra
assert.deepEqual(f("Reserve White Pineapple, 0,5-l-Dose"), ["reserve"]);
assert.deepEqual(f("Reserve Watermelon"), ["reserve"]);
assert.deepEqual(f("Ultra Watermelon"), ["ultra-watermelon"]);
// Zero Sugar nur als eigene Sorte, nicht als Zusatz
assert.deepEqual(f("Ultra White Zero Zucker, 0,5-l-Dose"), ["ultra-white"]);
assert.deepEqual(f("Lando Norris Zero Sugar"), ["lando-norris"]);
assert.deepEqual(f("Lewis Hamilton Zero Sugar"), ["lewis-hamilton"]);
assert.deepEqual(f("Zero Sugar, 0,5-l-Dose"), ["zero-sugar"]);
assert.deepEqual(f("Monster Energy Zero Sugar 0,5 l", "Monster"), ["zero-sugar"]);
assert.deepEqual(f("Original oder Zero Sugar"), ["zero-sugar", "original"]);
// „Ultra“ allein ist in Deutschland die weiße Dose
assert.deepEqual(f("Monster Energy Ultra 0,5 l"), ["ultra-white"]);
assert.deepEqual(f("Ultra, versch. Sorten"), ["*"]);
// neuere Sorten
assert.deepEqual(f("Ultra Peachy Keen"), ["ultra-peachy-keen"]);
assert.deepEqual(f("Ultra Fantasy Ruby Red"), ["ultra-ruby-red"]);
assert.deepEqual(f("Juiced Rio Punch"), ["rio-punch"]);
assert.deepEqual(f("The Doctor"), ["the-doctor"]);
assert.deepEqual(f("Rehab Peach Tea"), ["rehab"]);
assert.deepEqual(f("Original, grün"), ["original"]);

// Oberfläche und Server kennen dieselben Sorten
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const block = html.match(/const FLAVOR_GROUPS = \[([\s\S]*?)\n  \];/);
assert.ok(block, "FLAVOR_GROUPS in index.html gefunden");
const uiKeys = new Set([...block[1].matchAll(/\["([a-z0-9-]+)", "/g)].map((m) => m[1]));
const apiKeys = new Set(FLAVORS.map(([k]) => k));
assert.deepEqual([...uiKeys].sort(), [...apiKeys].sort(), "Sortenliste in index.html und api/offers.js stimmen überein");

console.log("flavors ok");
