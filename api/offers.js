// Serverless-Funktion (Vercel): holt aktuelle Monster-Energy-Angebote aus Prospekten
// über die (inoffizielle) Marktguru-API und gibt sie normalisiert zurück.

const MG_HOME = "https://www.marktguru.de/";
const MG_API = "https://api.marktguru.de/api/v1/offers/search";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const KEY_TTL_MS = 6 * 60 * 60 * 1000;

let cachedKeys = null; // { apiKey, clientKey, at }

export async function getKeys(fetchImpl = fetch, force = false) {
  if (!force && cachedKeys && Date.now() - cachedKeys.at < KEY_TTL_MS) return cachedKeys;
  const res = await fetchImpl(MG_HOME, { headers: { "user-agent": UA } });
  if (!res.ok) throw new Error(`marktguru.de antwortet mit ${res.status}`);
  const html = await res.text();
  const re = /<script\s+type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const json = JSON.parse(m[1]);
      const cfg = json?.config;
      if (cfg?.apiKey && cfg?.clientKey) {
        cachedKeys = { apiKey: cfg.apiKey, clientKey: cfg.clientKey, at: Date.now() };
        return cachedKeys;
      }
    } catch {
      /* nächsten Block probieren */
    }
  }
  throw new Error("API-Schlüssel auf marktguru.de nicht gefunden");
}

const round2 = (n) => Math.round(n * 100) / 100;

// Liest das Dosenvolumen aus der Beschreibung (z. B. "je 0,5-l-Dose", "500 ml").
export function parseCanLitres(text = "") {
  const t = text.toLowerCase().replace(/,/g, ".");
  const ml = t.match(/(\d{3})\s*-?\s*ml/);
  if (ml) {
    const v = Number(ml[1]) / 1000;
    if (v >= 0.2 && v <= 1) return v;
  }
  const l = t.match(/(0\.\d{1,3})\s*-?\s*l\b/);
  if (l) {
    const v = Number(l[1]);
    if (v >= 0.2 && v <= 1) return v;
  }
  return null;
}

export function isMonster(o) {
  const hay = `${o?.brand?.name ?? ""} ${o?.product?.name ?? ""} ${o?.description ?? ""}`.toLowerCase();
  if (!hay.includes("monster")) return false;
  // Monster Munch (Chips) u. ä. raus
  if (/munch|chips|snack/.test(hay)) return false;
  return true;
}

// "white": Ultra White ausdrücklich genannt; "assorted": "versch. Sorten" o. Ä., White wahrscheinlich dabei;
// "other": nur andere Sorten genannt.
export function detectVariant(o) {
  const t = `${o?.product?.name ?? ""} ${o?.description ?? ""}`.toLowerCase();
  if (/white|zero\s*ultra|ultra\s*zero/.test(t)) return "white";
  if (/versch|sortiert|sorten|div\.|diverse|verschiedene|auswahl/.test(t)) return "assorted";
  if (/ultra|mango|pipeline|punch|juiced|rehab|lewis|paradise|aussie|khaotic|java|nitro|reserve|lemonade|original|zero sugar|zero/.test(t)) return "other";
  return "assorted";
}

export function normalize(o, now = new Date()) {
  const desc = [o.product?.name, o.description].filter(Boolean).join(" · ");
  const unit = (o.unit?.shortName || "").toLowerCase();
  const perLitre = unit === "l" && o.referencePrice ? o.referencePrice : null;
  const canL = parseCanLitres(o.description || "") ?? 0.5;
  const perCan = perLitre ? round2(perLitre * canL) : null;
  const packLitres = perLitre ? o.price / perLitre : null;
  const cans = packLitres ? Math.max(1, Math.round(packLitres / canL)) : null;
  const dates = (o.validityDates || [])
    .map((d) => ({ from: d.from, to: d.to }))
    .sort((a, b) => new Date(a.from) - new Date(b.from));
  const current = dates.find((d) => new Date(d.from) <= now && new Date(d.to) >= now);
  const next = dates.find((d) => new Date(d.to) >= now);
  const span = current || next || dates[dates.length - 1] || null;
  return {
    id: o.id,
    retailer: o.advertisers?.[0]?.name ?? "Unbekannt",
    retailerId: o.advertisers?.[0]?.uniqueName ?? "",
    brand: o.brand?.name ?? "",
    product: o.product?.name ?? "",
    description: o.description ?? "",
    title: desc,
    price: o.price,
    oldPrice: o.oldPrice ?? null,
    perLitre: perLitre ? round2(perLitre) : null,
    perCan,
    canLitres: canL,
    cans,
    loyalty: !!o.requiresLoyalityMembership,
    variant: detectVariant(o),
    validFrom: span?.from ?? null,
    validTo: span?.to ?? null,
    active: !!current,
    image: `https://mg2de.b-cdn.net/api/v1/offers/${o.id}/images/default/0/medium.jpg`,
  };
}

async function searchOnce(zip, keys, fetchImpl) {
  const url = new URL(MG_API);
  url.search = new URLSearchParams({
    as: "web",
    q: "monster energy",
    zipCode: String(zip),
    limit: "200",
    offset: "0",
  }).toString();
  return fetchImpl(url, {
    headers: {
      "x-apikey": keys.apiKey,
      "x-clientkey": keys.clientKey,
      "user-agent": UA,
      accept: "application/json",
    },
  });
}

export async function fetchOffers(zip, fetchImpl = fetch) {
  let keys = await getKeys(fetchImpl);
  let res = await searchOnce(zip, keys, fetchImpl);
  if (res.status === 401 || res.status === 403) {
    keys = await getKeys(fetchImpl, true);
    res = await searchOnce(zip, keys, fetchImpl);
  }
  if (!res.ok) throw new Error(`Marktguru-API antwortet mit ${res.status}`);
  const data = await res.json();
  const now = new Date();
  const seen = new Set();
  return (data.results || [])
    .filter(isMonster)
    .map((o) => normalize(o, now))
    .filter((o) => {
      if (seen.has(o.id)) return false;
      seen.add(o.id);
      return !o.validTo || new Date(o.validTo) >= now;
    })
    .sort((a, b) => (a.perCan ?? 99) - (b.perCan ?? 99) || a.price - b.price);
}

export default async function handler(req, res) {
  const zip = String(req.query?.zip ?? "").trim();
  if (!/^\d{5}$/.test(zip)) {
    res.status(400).json({ error: "Bitte eine gültige fünfstellige PLZ angeben." });
    return;
  }
  try {
    const offers = await fetchOffers(zip);
    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=3600");
    res.status(200).json({ zip, fetchedAt: new Date().toISOString(), count: offers.length, offers });
  } catch (err) {
    res.status(502).json({ error: err.message || "Unbekannter Fehler" });
  }
}
