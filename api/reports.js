// Nutzer-Meldungen zur Verfügbarkeit von Monster Ultra White je Laden.
// Speicher: Upstash Redis (Vercel Marketplace), angesprochen über die REST-API.

const STATUSES = new Set(["out", "ok"]); // out = kein White da, ok = White da
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // Meldungen älter als 7 Tage zählen nicht mehr
const KEEP_PER_STORE = 10;
const RATE_LIMIT = 30; // Meldungen pro IP und Stunde
const HASH = "mp:stores";

function redisConfig(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export async function redis(cfg, commands, fetchImpl = fetch) {
  const res = await fetchImpl(`${cfg.url}/pipeline`, {
    method: "POST",
    headers: { authorization: `Bearer ${cfg.token}`, "content-type": "application/json" },
    body: JSON.stringify(commands),
  });
  if (!res.ok) throw new Error(`Speicher antwortet mit ${res.status}`);
  const out = await res.json();
  return out.map((r) => {
    if (r.error) throw new Error(r.error);
    return r.result;
  });
}

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

function ipOf(req) {
  const xf = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || req.socket?.remoteAddress || "unknown";
}

export async function handle(req, res, { env = process.env, fetchImpl = fetch, now = Date.now() } = {}) {
  const cfg = redisConfig(env);
  if (!cfg) {
    res.status(503).json({ error: "Meldungen sind noch nicht eingerichtet (Redis-Speicher fehlt)." });
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
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
      const err = validate(body);
      if (err) {
        res.status(400).json({ error: err });
        return;
      }
      const rlKey = `mp:rl:${ipOf(req)}`;
      const [count] = await redis(cfg, [["INCR", rlKey], ["EXPIRE", rlKey, 3600, "NX"]], fetchImpl);
      if (count > RATE_LIMIT) {
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
