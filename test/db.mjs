import assert from "node:assert";
import { makeQ } from "./pgq.mjs";
import * as reports from "../api/reports.js";
import * as prices from "../api/prices.js";
import { detectFlavors } from "../api/offers.js";
const q = makeQ();
await q("DROP TABLE IF EXISTS mp_reports, mp_prices");
const mk = () => { const r = { code: 0 }; r.status = (c) => (r.code = c, r); r.json = (b) => (r.body = b, r); r.setHeader = () => {}; return r; };
const call = async (mod, req, ip = "1.2.3.4") => { const res = mk(); await mod.handle({ headers: { "x-forwarded-for": ip }, query: {}, ...req }, res, { q }); return res; };

// Meldungen
let r = await call(reports, { method: "GET" });
assert.equal(r.code, 200, JSON.stringify(r.body)); assert.deepEqual(r.body.stores, []);
const shop = { storeId: "node/123", name: "REWE Ettlinger Tor", brand: "REWE", lat: 49.0, lon: 8.4 };
r = await call(reports, { method: "POST", body: { ...shop, status: "out" } });
assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(r.body.store.status, "out"); assert.equal(r.body.store.flavor, "ultra-white");
r = await call(reports, { method: "POST", body: JSON.stringify({ ...shop, status: "ok" }) }, "2.2.2.2");
assert.equal(r.body.store.status, "ok"); assert.equal(r.body.store.out, 1); assert.equal(r.body.store.ok, 1);
assert.equal(r.body.updated, false);
// zweite Meldung derselben IP für denselben Laden innerhalb einer Stunde ersetzt die erste (Korrektur)
r = await call(reports, { method: "POST", body: { ...shop, status: "out" } }, "5.5.5.5");
r = await call(reports, { method: "POST", body: { ...shop, status: "ok" } }, "5.5.5.5");
assert.equal(r.body.updated, true); assert.equal(r.body.store.out, 1); assert.equal(r.body.store.ok, 2);
r = await call(reports, { method: "POST", body: { ...shop, status: "out", flavor: "mango-loco" } });
assert.equal(r.body.store.flavor, "mango-loco"); assert.equal(r.body.updated, false, "andere Sorte zählt extra");
r = await call(reports, { method: "GET" }); assert.equal(r.body.stores.length, 1); assert.equal(r.body.stores[0].status, "ok");
r = await call(reports, { method: "GET", query: { flavor: "mango-loco" } }); assert.equal(r.body.stores[0].status, "out");
r = await call(reports, { method: "GET", query: { flavor: "x'; drop" } }); assert.equal(r.code, 400);
await q("UPDATE mp_reports SET ts = now() - interval '8 days'");
r = await call(reports, { method: "GET" }); assert.equal(r.body.stores.length, 0, "alt raus");
r = await call(reports, { method: "POST", body: { ...shop, status: "maybe" } }); assert.equal(r.code, 400);
r = await call(reports, { method: "POST", body: { ...shop, name: "Aral", brand: "Aral", status: "ok", storeId: "node/77" } });
assert.equal(r.code, 400, "nur Supermärkte der bekannten Ketten");
r = await call(reports, { method: "POST", body: { ...shop, name: "REWE <b>X</b>", status: "ok", storeId: "way/9" } });
assert.equal(r.body.store.name, "REWE bX/b"); assert.equal(r.body.store.chain, "rewe");

// Preise
r = await call(prices, { method: "POST", body: { chain: "rewe", price: "1,79", zip: "76137" } });
assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(r.body.summary.median, 1.79);
await call(prices, { method: "POST", body: { chain: "rewe", price: 1.59 } });
r = await call(prices, { method: "POST", body: { chain: "rewe", price: "1.69 €" } });
assert.equal(r.body.summary.median, 1.69); assert.equal(r.body.summary.count, 3); assert.equal(r.body.summary.last, 1.69);
r = await call(prices, { method: "GET" }); assert.equal(r.body.chains.rewe.count, 3);
for (const bad of [{ chain: "amazon", price: 1 }, { chain: "rewe", price: 9 }, { chain: "rewe", price: "abc" }, { chain: "rewe", price: 1, zip: "1" }]) {
  r = await call(prices, { method: "POST", body: bad }); assert.equal(r.code, 400, JSON.stringify(bad));
}
// Limit: 30 pro Stunde über beide Tabellen
let last;
for (let i = 0; i < 40; i++) last = await call(prices, { method: "POST", body: { chain: "lidl", price: 1.5 } }, "9.9.9.9");
assert.equal(last.code, 429);
r = await call(prices, { method: "POST", body: { chain: "lidl", price: 1.5 } }, "8.8.8.8"); assert.equal(r.code, 200);
// ohne DB
const res = mk(); await prices.handle({ method: "GET", headers: {} }, res, { env: {} }); assert.equal(res.code, 503);

// Sorten
const f = (d) => detectFlavors({ product: { name: "Energy" }, description: d });
assert.deepEqual(f("Ultra White 0,5 l"), ["ultra-white"]); assert.deepEqual(f("versch. Sorten"), ["*"]);
assert.deepEqual(f("Mango Loco"), ["mango-loco"]); assert.deepEqual(f("0,5-l-Dose"), ["*"]);
console.log("db + flavors ok");
