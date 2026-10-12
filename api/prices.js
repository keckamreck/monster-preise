// Von Nutzern gemeldete Regalpreise für Monster 0,5 l, je Handelskette.
import { getSql, ensureSchema, ipHash, overLimit, NOT_CONFIGURED, parseBody } from "../lib/db.js";

export const CHAINS = ["aldi-sued", "aldi-nord", "edeka", "kaufland", "lidl", "netto", "norma", "penny", "rewe", "globus"];
const RATE_LIMIT = 30;

export function parsePrice(raw) {
  const p = Number(String(raw ?? "").replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(p) ? Math.round(p * 100) / 100 : NaN;
}

export function validate(body) {
  if (!body || typeof body !== "object") return "Ungültige Anfrage.";
  if (!CHAINS.includes(body.chain)) return "Unbekannter Händler.";
  const p = parsePrice(body.price);
  if (!(p >= 0.3 && p <= 5)) return "Bitte einen Preis pro Dose zwischen 0,30 € und 5,00 € angeben.";
  if (body.zip != null && body.zip !== "" && !/^\d{5}$/.test(String(body.zip))) return "Ungültige PLZ.";
  return null;
}

export const toSummary = (r) => ({
  median: Math.round(Number(r.median) * 100) / 100,
  count: Number(r.count),
  last: Number(r.last),
  lastTs: new Date(r.last_ts).getTime(),
});

const SUMMARY = `
  SELECT chain,
         percentile_cont(0.5) WITHIN GROUP (ORDER BY price) AS median,
         count(*) AS count,
         (array_agg(price ORDER BY ts DESC))[1] AS last,
         max(ts) AS last_ts
    FROM mp_prices
   WHERE ts > now() - interval '30 days'`;

export async function handle(req, res, { env = process.env, q: injected } = {}) {
  const q = injected || (await getSql(env));
  if (!q) {
    res.status(503).json({ error: NOT_CONFIGURED });
    return;
  }
  try {
    await ensureSchema(q);
    if (req.method === "GET") {
      const rows = await q(`${SUMMARY} GROUP BY chain`);
      const chains = {};
      for (const r of rows) chains[r.chain] = toSummary(r);
      res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=60");
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
      const ip = ipHash(req);
      if (await overLimit(q, ip, RATE_LIMIT)) {
        res.status(429).json({ error: "Zu viele Meldungen. Versuch es später nochmal." });
        return;
      }
      await q(`INSERT INTO mp_prices (chain, price, zip, ip) VALUES ($1,$2,$3,$4)`, [body.chain, parsePrice(body.price), body.zip ? String(body.zip) : null, ip]);
      const [row] = await q(`${SUMMARY} AND chain = $1 GROUP BY chain`, [body.chain]);
      res.status(200).json({ chain: body.chain, summary: row ? toSummary(row) : null });
      return;
    }
    res.setHeader("Allow", "GET, POST");
    res.status(405).json({ error: "Methode nicht erlaubt." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Datenbankfehler: " + (e.message || "unbekannt") });
  }
}

export default function handler(req, res) {
  return handle(req, res);
}
