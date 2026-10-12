import assert from "node:assert";
import { handle, validate } from "../api/reports.js";
import { detectVariant } from "../api/offers.js";

// Mini-Redis für die Upstash-Pipeline
const db = new Map(); const kv = new Map();
const fakeFetch = async (url, opts) => {
  const cmds = JSON.parse(opts.body);
  const out = cmds.map(([c, ...a]) => {
    if (c === "HGETALL") return { result: [...(db.get(a[0]) || new Map())].flat() };
    if (c === "HGET") return { result: db.get(a[0])?.get(a[1]) ?? null };
    if (c === "HSET") { if (!db.has(a[0])) db.set(a[0], new Map()); db.get(a[0]).set(a[1], a[2]); return { result: 1 }; }
    if (c === "INCR") { kv.set(a[0], (kv.get(a[0]) || 0) + 1); return { result: kv.get(a[0]) }; }
    if (c === "EXPIRE") return { result: 1 };
    return { error: "unknown " + c };
  });
  return new Response(JSON.stringify(out));
};
const env = { KV_REST_API_URL: "https://x.upstash.io", KV_REST_API_TOKEN: "t" };
function mkRes() { const r = { code: 0, body: null, headers: {} }; r.status = (c) => (r.code = c, r); r.json = (b) => (r.body = b, r); r.setHeader = (k, v) => (r.headers[k] = v); return r; }
const call = async (req, extra = {}) => { const res = mkRes(); await handle({ headers: { "x-forwarded-for": "1.2.3.4" }, ...req }, res, { env, fetchImpl: fakeFetch, ...extra }); return res; };

let r = await call({ method: "GET" });
assert.equal(r.code, 200); assert.deepEqual(r.body.stores, []);

const shop = { storeId: "node/123", name: "REWE Ettlinger Tor", brand: "REWE", lat: 49.0, lon: 8.4 };
r = await call({ method: "POST", body: { ...shop, status: "out" } });
assert.equal(r.code, 200, JSON.stringify(r.body)); assert.equal(r.body.store.status, "out");
r = await call({ method: "POST", body: JSON.stringify({ ...shop, status: "ok" }) });
assert.equal(r.body.store.status, "ok"); assert.equal(r.body.store.out, 1); assert.equal(r.body.store.ok, 1);

r = await call({ method: "GET" });
assert.equal(r.body.stores.length, 1); assert.equal(r.body.stores[0].name, "REWE Ettlinger Tor");
// alte Meldungen fallen nach 7 Tagen raus
r = await call({ method: "GET" }, { now: Date.now() + 8 * 864e5 });
assert.equal(r.body.stores.length, 0);

assert.ok(validate({ ...shop, status: "x" })); assert.ok(validate({ ...shop, storeId: "1; drop", status: "ok" }));
assert.ok(validate({ ...shop, lat: 10, status: "ok" }));
r = await call({ method: "POST", body: { ...shop, storeId: "node/9", name: "<b>X</b>", status: "ok" } });
assert.equal(r.code, 200); assert.equal(r.body.store.name, "bX/b");
r = await call({ method: "POST", body: { ...shop, name: "<>", status: "ok" } });
assert.equal(r.code, 400);

for (let i = 0; i < 40; i++) r = await call({ method: "POST", body: { ...shop, status: "ok" } });
assert.equal(r.code, 429);

let res = mkRes(); await handle({ method: "GET", headers: {} }, res, { env: {}, fetchImpl: fakeFetch });
assert.equal(res.code, 503);

const v = (d, p = "Energy") => detectVariant({ product: { name: p }, description: d });
assert.equal(v("Ultra White, 0,5-l-Dose"), "white");
assert.equal(v("versch. Sorten, je 0,5-l-Dose"), "assorted");
assert.equal(v("Mango Loco, 0,5 l"), "other");
assert.equal(v("Zero Ultra 0,5 l"), "white");
assert.equal(v("0,5-l-Dose"), "assorted");
console.log("reports + variant ok");
