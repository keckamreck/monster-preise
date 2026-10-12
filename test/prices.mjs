import assert from "node:assert";
import { handle, validate, summarize } from "../api/prices.js";
import { parseBbox, compact, compactNominatim } from "../api/shops.js";
const db = new Map(); const kv = new Map();
const fakeFetch = async (url, opts) => {
  const out = JSON.parse(opts.body).map(([c, ...a]) => {
    if (c === "HGETALL") return { result: [...(db.get(a[0]) || new Map())].flat() };
    if (c === "HGET") return { result: db.get(a[0])?.get(a[1]) ?? null };
    if (c === "HSET") { if (!db.has(a[0])) db.set(a[0], new Map()); db.get(a[0]).set(a[1], a[2]); return { result: 1 }; }
    if (c === "INCR") { kv.set(a[0], (kv.get(a[0]) || 0) + 1); return { result: kv.get(a[0]) }; }
    return { result: 1 };
  });
  return new Response(JSON.stringify(out));
};
const env = { KV_REST_API_URL: "https://x", KV_REST_API_TOKEN: "t" };
const mk = () => { const r = { code: 0 }; r.status = (c) => (r.code = c, r); r.json = (b) => (r.body = b, r); r.setHeader = () => {}; return r; };
const call = async (req, o = {}) => { const res = mk(); await handle({ headers: {}, ...req }, res, { env, fetchImpl: fakeFetch, ...o }); return res; };
let r = await call({ method: "POST", body: { chain: "rewe", price: "1,79", zip: "76137" } });
assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(r.body.summary.median, 1.79);
await call({ method: "POST", body: { chain: "rewe", price: 1.59 } });
r = await call({ method: "POST", body: { chain: "rewe", price: 1.69 } });
assert.equal(r.body.summary.median, 1.69); assert.equal(r.body.summary.count, 3);
r = await call({ method: "GET" }); assert.equal(r.body.chains.rewe.count, 3);
r = await call({ method: "GET" }, { now: Date.now() + 31 * 864e5 }); assert.deepEqual(r.body.chains, {});
assert.ok(validate({ chain: "amazon", price: 1 })); assert.ok(validate({ chain: "rewe", price: 9 })); assert.ok(validate({ chain: "rewe", price: "abc" }));
assert.equal(summarize([{ price: 1, ts: Date.now() }, { price: 2, ts: Date.now() }]).median, 1.5);
assert.deepEqual(parseBbox("48.99,8.38,49.02,8.43"), [48.99, 8.38, 49.02, 8.43]);
assert.equal(parseBbox("40,8,49,9"), null); assert.equal(parseBbox("48,8,49.5,9.5"), null); assert.equal(parseBbox("x"), null);
const c = compact([{ type: "node", id: 1, lat: 49, lon: 8.4, tags: { shop: "supermarket", brand: "REWE", name: "REWE Ettlinger Tor" } }, { type: "way", id: 2, center: { lat: 49.1, lon: 8.5 }, tags: { amenity: "fuel" } }]);
assert.equal(c.length, 2); assert.equal(c[1].name, "Tankstelle"); assert.equal(c[0].id, "node/1");
const nm = compactNominatim([{ osm_type: "node", osm_id: 7, lat: "49.01", lon: "8.4", name: "Lidl", type: "supermarket", extratags: { brand: "Lidl" } }, { osm_type: "way", osm_id: 8, lat: "49", lon: "8.41", name: "", type: "fuel" }]);
assert.equal(nm[0].id, "node/7"); assert.equal(nm[0].brand, "Lidl"); assert.equal(nm[1].name, "Tankstelle");
console.log("prices + shops ok");
