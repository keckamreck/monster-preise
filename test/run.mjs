import { fetchOffers, parseCanLitres } from "../api/offers.js";
import assert from "node:assert";
const now = Date.now(), d = (x) => new Date(now + x * 864e5).toISOString();
const home = `<html><script type="application/json">{"config":{"apiKey":"A","clientKey":"C"}}</script></html>`;
const results = [
  { id: 1, brand: { name: "Monster" }, advertisers: [{ name: "Kaufland", uniqueName: "kaufland" }], product: { name: "Energy Drink" }, description: "versch. Sorten, je 0,5-l-Dose", price: 0.99, oldPrice: 1.59, referencePrice: 1.98, unit: { shortName: "l" }, validityDates: [{ from: d(-1), to: d(3) }] },
  { id: 2, brand: { name: "Monster Energy" }, advertisers: [{ name: "Lidl", uniqueName: "lidl" }], product: { name: "Energy" }, description: "4 x 0,5 l", price: 4.44, oldPrice: null, referencePrice: 2.22, unit: { shortName: "l" }, requiresLoyalityMembership: true, validityDates: [{ from: d(2), to: d(6) }] },
  { id: 3, brand: { name: "Monster Munch" }, advertisers: [{ name: "REWE" }], product: { name: "Chips" }, description: "75 g", price: 1.29, referencePrice: 17.2, unit: { shortName: "kg" }, validityDates: [{ from: d(-1), to: d(3) }] },
  { id: 5, brand: { name: "Monster" }, advertisers: [{ name: "Scheck-in Center", uniqueName: "scheck-in-center" }], product: { name: "Energy Drink" }, description: "0,5-l-Dose", price: 0.89, referencePrice: 1.78, unit: { shortName: "l" }, validityDates: [{ from: d(-1), to: d(3) }] },
  { id: 6, brand: { name: "Monster" }, advertisers: [{ name: "Edeka" }], product: { name: "Energy" }, description: "0,5-l-Dose", price: 1.69, referencePrice: 3.38, unit: { shortName: "l" }, validityDates: [{ from: d(-1), to: d(3) }] },
  { id: 7, brand: { name: "Monster" }, advertisers: [{ name: "Penny" }], product: { name: "Energy" }, description: "0,5-l-Dose", price: 1.59, referencePrice: 3.18, unit: { shortName: "l" }, validityDates: [{ from: d(-1), to: d(3) }] },
  { id: 4, brand: { name: "Monster" }, advertisers: [{ name: "Netto" }], product: { name: "Energy" }, description: "355 ml", price: 1.11, referencePrice: 3.13, unit: { shortName: "l" }, validityDates: [{ from: d(-9), to: d(-2) }] },
];
const calls = [];
const fakeFetch = async (url, opts) => {
  calls.push([String(url), opts?.headers]);
  if (String(url).startsWith("https://www.marktguru.de")) return new Response(home);
  return new Response(JSON.stringify({ results }), { headers: { "content-type": "application/json" } });
};
const out = await fetchOffers("76137", fakeFetch);
assert.equal(out.length, 2, "Chips, abgelaufene, Scheck-in Center und Preise ab UVP raus");
assert.ok(!out.some((o) => /scheck/i.test(o.retailer)), "kein Scheck-in Center");
assert.equal(out[0].retailer, "Kaufland"); assert.equal(out[0].perCan, 0.99); assert.equal(out[0].active, true);
assert.equal(out[1].perCan, 1.11); assert.equal(out[1].cans, 4); assert.equal(out[1].active, false); assert.equal(out[1].loyalty, true);
assert.equal(calls[1][1]["x-apikey"], "A");
assert.match(calls[1][0], /zipCode=76137/);
assert.equal(parseCanLitres("355 ml Dose"), 0.355); assert.equal(parseCanLitres("je 0,5-l-Dose"), 0.5); assert.equal(parseCanLitres("4 x 0,5 l"), 0.5);
console.log("alle Tests ok", JSON.stringify(out[0]));
