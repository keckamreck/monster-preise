// Nutzer-Meldungen zur Verfügbarkeit einer Monster-Sorte je Laden (Standard: Ultra White).
import { getSql, ensureSchema, ipHash, overLimit, NOT_CONFIGURED, parseBody } from "../lib/db.js";

const STATUSES = new Set(["out", "ok"]); // out = Sorte nicht da, ok = Sorte da
const FLAVOR_RE = /^[a-z0-9-]{2,30}$/;
const RATE_LIMIT = 30;

const clean = (s, max) => String(s ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);

export function validate(body) {
  if (!body || typeof body !== "object") return "Ungültige Anfrage.";
  const { storeId, name, lat, lon, status } = body;
  if (!/^(node|way|relation)\/\d{1,15}$/.test(String(storeId))) return "Ungültiger Laden.";
  if (!STATUSES.has(status)) return "Ungültiger Status.";
  if (!FLAVOR_RE.test(String(body.flavor ?? "ultra-white"))) return "Ungültige Sorte.";
  const la = Number(lat), lo = Number(lon);
  if (!(la > 45 && la < 56 && lo > 4 && lo < 17)) return "Ort außerhalb des unterstützten Gebiets.";
  if (!clean(name, 80)) return "Name fehlt.";
  return null;
}

export function toStore(r) {
  return {
    id: r.store_id,
    flavor: r.flavor,
    name: r.name,
    brand: r.brand || "",
    lat: Number(r.lat),
    lon: Number(r.lon),
    status: r.status,
    lastTs: new Date(r.last_ts).getTime(),
    out: Number(r.out),
    ok: Number(r.ok),
  };
}

const SUMMARY = `
  SELECT store_id, flavor,
         (array_agg(name   ORDER BY ts DESC))[1] AS name,
         (array_agg(brand  ORDER BY ts DESC))[1] AS brand,
         (array_agg(lat    ORDER BY ts DESC))[1] AS lat,
         (array_agg(lon    ORDER BY ts DESC))[1] AS lon,
         (array_agg(status ORDER BY ts DESC))[1] AS status,
         max(ts) AS last_ts,
         count(*) FILTER (WHERE status = 'out') AS out,
         count(*) FILTER (WHERE status = 'ok')  AS ok
    FROM mp_reports
   WHERE ts > now() - interval '7 days' AND flavor = $1`;

export async function handle(req, res, { env = process.env, q: injected } = {}) {
  const q = injected || (await getSql(env));
  if (!q) {
    res.status(503).json({ error: NOT_CONFIGURED });
    return;
  }
  try {
    await ensureSchema(q);
    if (req.method === "GET") {
      const flavor = String(req.query?.flavor || "ultra-white");
      if (!FLAVOR_RE.test(flavor)) {
        res.status(400).json({ error: "Ungültige Sorte." });
        return;
      }
      const rows = await q(`${SUMMARY} GROUP BY store_id, flavor`, [flavor]);
      res.setHeader("Cache-Control", "s-maxage=15, stale-while-revalidate=60");
      res.status(200).json({ flavor, stores: rows.map(toStore) });
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
      const flavor = String(body.flavor || "ultra-white");
      const id = String(body.storeId);
      await q(
        `INSERT INTO mp_reports (store_id, flavor, name, brand, lat, lon, status, ip) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, flavor, clean(body.name, 80), clean(body.brand, 40), Math.round(Number(body.lat) * 1e5) / 1e5, Math.round(Number(body.lon) * 1e5) / 1e5, body.status, ip]
      );
      const [row] = await q(`${SUMMARY} AND store_id = $2 GROUP BY store_id, flavor`, [flavor, id]);
      res.status(200).json({ store: row ? toStore(row) : null });
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
