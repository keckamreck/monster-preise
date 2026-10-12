// Nutzer-Meldungen zur Verfügbarkeit von Monster Ultra White je Laden.
// Speicher: Upstash Redis (Vercel Marketplace), angesprochen über die REST-API.
import { redisConfig, redis, overLimit, NOT_CONFIGURED, parseBody } from "../lib/redis.js";

const STATUSES = new Set(["out", "ok"]); // out = kein White da, ok = White da
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // Meldungen älter als 7 Tage zählen nicht mehr
const KEEP_PER_STORE = 10;
const RATE_LIMIT = 30; // Meldungen pro IP und Stunde
const HASH = "mp:stores";

const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);

export function validate(body) {
  if (!body || typeof body !== "object") return "Ungültige Anfrage.";
  const { storeId, name, lat, lon, status } = body;
  if (!/^(node|way|relation)\/\d{1,15}$/.test(String(storeId))) return "Ungültiger Laden.";
  if (!STATUSES.has(status)) return "Ungültiger Status.";
  const la = Number(lat), lo = Number(lon);
  // grob Deutschland plus Nachbarn
  if (!(la > 45 && la < 56 && lo > 4 && lo < 17)) return "Ort außerhalb des unterstützten Gebiets.";
  if (!clean(name, 80)) return "Name fehlt.";
  return null;
}

export function summarize(store, now = Date.now()) {
  const recent = (store.reports || []).filter((r) => now - r.ts < MAX_AGE_MS);
  if (!recent.length) return null;
  const last = recent[0];
  return {
    id: store.id,
    name: store.name,
    brand: store.brand || "",
    lat: store.lat,
    lon: store.lon,
    status: last.status,
    lastTs: last.ts,
    out: recent.filter((r) => r.status === "out").length,
    ok: recent.filter((r) => r.status === "ok").length,
  };
}

export async function handle(req, res, { env = process.env, fetchImpl = fetch, now = Date.now() } = {}) {
  const cfg = redisConfig(env);
  if (!cfg) {
    res.status(503).json({ error: NOT_CONFIGURED });
    return;
  }
  try {
    if (req.method === "GET") {
      const [flat] = await redis(cfg, [["HGETALL", HASH]], fetchImpl);
      const stores = [];
      for (let i = 0; i < (flat || []).length; i += 2) {
        try {
          const s = summarize(JSON.parse(flat[i + 1]), now);
          if (s) stores.push(s);
        } catch {}
      }
      res.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=60");
      res.status(200).json({ stores });
      return;
    }

    if (req.method === "POST") {
      const body = parseBody(req);
      const err = validate(body);
      if (err) {
        res.status(400).json({ error: err });
        return;
      }
      if (await overLimit(cfg, req, RATE_LIMIT, fetchImpl)) {
        res.status(429).json({ error: "Zu viele Meldungen. Versuch es später nochmal." });
        return;
      }
      const id = String(body.storeId);
      const [raw] = await redis(cfg, [["HGET", HASH, id]], fetchImpl);
      let store = null;
      try { store = raw ? JSON.parse(raw) : null; } catch {}
      store = store || { id, reports: [] };
      store.name = clean(body.name, 80);
      store.brand = clean(body.brand, 40);
      store.lat = Math.round(Number(body.lat) * 1e5) / 1e5;
      store.lon = Math.round(Number(body.lon) * 1e5) / 1e5;
      store.reports = [{ status: body.status, ts: now }, ...(store.reports || [])]
        .filter((r) => now - r.ts < MAX_AGE_MS)
        .slice(0, KEEP_PER_STORE);
      await redis(cfg, [["HSET", HASH, id, JSON.stringify(store)]], fetchImpl);
      res.status(200).json({ store: summarize(store, now) });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Methode nicht erlaubt." });
  } catch (e) {
    res.status(500).json({ error: e.message || "Unbekannter Fehler" });
  }
}

export default function handler(req, res) {
  return handle(req, res);
}
