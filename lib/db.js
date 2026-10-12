// Neon Postgres (Vercel Marketplace). Verbindung über DATABASE_URL bzw. POSTGRES_URL.
import { createHash } from "node:crypto";

export const NOT_CONFIGURED = "Meldungen sind noch nicht eingerichtet (Datenbank fehlt).";

export function dbUrl(env = process.env) {
  return env.DATABASE_URL || env.POSTGRES_URL || env.NEON_DATABASE_URL || null;
}

let cached = null;
// Liefert eine Funktion q(text, params) -> rows. In Tests wird sie direkt übergeben.
export async function getSql(env = process.env) {
  const url = dbUrl(env);
  if (!url) return null;
  if (cached?.url === url) return cached.q;
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url);
  const q = (text, params = []) => (typeof sql.query === "function" ? sql.query(text, params) : sql(text, params));
  cached = { url, q };
  return q;
}

let schemaReady = false;
export async function ensureSchema(q) {
  if (schemaReady) return;
  await q(`CREATE TABLE IF NOT EXISTS mp_reports (
    id bigserial PRIMARY KEY,
    store_id text NOT NULL,
    flavor text NOT NULL,
    name text NOT NULL,
    brand text NOT NULL DEFAULT '',
    lat double precision NOT NULL,
    lon double precision NOT NULL,
    status text NOT NULL,
    ip text NOT NULL,
    ts timestamptz NOT NULL DEFAULT now()
  )`);
  await q(`CREATE INDEX IF NOT EXISTS mp_reports_flavor_ts ON mp_reports (flavor, ts)`);
  await q(`CREATE TABLE IF NOT EXISTS mp_prices (
    id bigserial PRIMARY KEY,
    chain text NOT NULL,
    price numeric(5,2) NOT NULL,
    zip text,
    ip text NOT NULL,
    ts timestamptz NOT NULL DEFAULT now()
  )`);
  await q(`CREATE INDEX IF NOT EXISTS mp_prices_chain_ts ON mp_prices (chain, ts)`);
  schemaReady = true;
}

export function resetSchemaFlag() { schemaReady = false; }

// IP nur gehasht speichern (für das Limit pro Stunde)
export function ipHash(req) {
  const xf = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  const ip = xf || req.socket?.remoteAddress || "unknown";
  return createHash("sha256").update("monster-preise:" + ip).digest("hex").slice(0, 32);
}

export async function overLimit(q, ip, limit) {
  const [row] = await q(
    `SELECT (SELECT count(*) FROM mp_reports WHERE ip = $1 AND ts > now() - interval '1 hour')
          + (SELECT count(*) FROM mp_prices  WHERE ip = $1 AND ts > now() - interval '1 hour') AS n`,
    [ip]
  );
  return Number(row?.n || 0) >= limit;
}

export function parseBody(req) {
  return typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
}
