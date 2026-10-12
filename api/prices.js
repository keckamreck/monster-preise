// Von Nutzern gemeldete Regalpreise für Monster Ultra White 0,5 l, je Handelskette.
import { redisConfig, redis, overLimit, NOT_CONFIGURED, parseBody } from "../lib/redis.js";

export const CHAINS = ["aldi-sued", "aldi-nord", "edeka", "kaufland", "lidl", "netto", "norma", "penny", "rewe", "globus"];
const HASH = "mp:prices";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const KEEP = 30;
const RATE_LIMIT = 30;

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 100) / 100;
};

export function summarize(list, now = Date.now()) {
  const recent = (list || []).filter((r) => now - r.ts < MAX_AGE_MS);
  if (!recent.length) return null;
  return { median: median(recent.map((r) => r.price)), count: recent.length, last: recent[0].price, lastTs: recent[0].ts };
}

export function validate(body) {
  if (!body || typeof body !== "object") return "Ungültige Anfrage.";
  if (!CHAINS.includes(body.chain)) return "Unbekannter Händler.";
  const p = Number(String(body.price).replace(",", "."));
  if (!Number.isFinite(p) || p < 0.3 || p > 5) return "Bitte einen Preis pro Dose zwischen 0,30 € und 5,00 € angeben.";
  if (body.zip != null && body.zip !== "" && !/^\d{5}$/.test(String(body.zip))) return "Ungültige PLZ.";
  return null;
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
      const chains = {};
      for (let i = 0; i < (flat || []).length; i += 2) {
        try {
          const s = summarize(JSON.parse(flat[i + 1]), now);
          if (s) chains[flat[i]] = s;
        } catch {}
      }
      res.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=60");
      res.status(200).json({ chains });
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
      const price = Math.round(Number(String(body.price).replace(",", ".")) * 100) / 100;
      const [raw] = await redis(cfg, [["HGET", HASH, body.chain]], fetchImpl);
      let list = [];
      try { list = raw ? JSON.parse(raw) : []; } catch {}
      list = [{ price, ts: now, zip: body.zip ? String(body.zip) : null }, ...list]
        .filter((r) => now - r.ts < MAX_AGE_MS)
        .slice(0, KEEP);
      await redis(cfg, [["HSET", HASH, body.chain, JSON.stringify(list)]], fetchImpl);
      res.status(200).json({ chain: body.chain, summary: summarize(list, now) });
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
