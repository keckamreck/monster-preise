// Gemeinsame Helfer für Upstash Redis (REST) und einfaches Rate-Limiting.

export function redisConfig(env = process.env) {
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

export function ipOf(req) {
  const xf = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || req.socket?.remoteAddress || "unknown";
}

// true = Limit überschritten
export async function overLimit(cfg, req, limit, fetchImpl = fetch) {
  const key = `mp:rl:${ipOf(req)}`;
  const [count] = await redis(cfg, [["INCR", key], ["EXPIRE", key, 3600, "NX"]], fetchImpl);
  return count > limit;
}

export const NOT_CONFIGURED = "Meldungen sind noch nicht eingerichtet (Redis-Speicher in Vercel fehlt).";

export function parseBody(req) {
  return typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
}
