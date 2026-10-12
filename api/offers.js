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
  // Monster Munch (Chips), Spielzeug, Tierfutter u. ä. raus
  if (/munch|chips|snack|jam\b|truck|belloween|futter|spielzeug|plüsch|kostüm/.test(hay)) return false;
  // Nur Getränke: Literpreis oder eindeutige Getränke-Begriffe
  const unit = (o?.unit?.shortName || "").toLowerCase();
  return unit === "l" || /energy|dose|0[,.]5\s*-?\s*l|ultra|drink/.test(hay);
}

// Sorten-Erkennung. Ergebnis: Liste von Sorten-Schlüsseln, oder ["*"] wenn "versch. Sorten" bzw. keine Sorte genannt.
export const FLAVORS = [
  ["ultra-white", /ultra\s*white|zero\s*ultra|ultra\s*zero|\bwhite\b/],
  ["zero-sugar", /zero\s*(sugar|zucker)/],
  ["ultra-paradise", /paradise/],
  ["ultra-rosa", /\brosa\b/],
  ["ultra-fiesta", /fiesta/],
  ["ultra-violet", /violet/],
  ["ultra-watermelon", /watermelon|wassermelone/],
  ["ultra-strawberry", /strawberry|erdbeer/],
  ["ultra-citron", /citron/],
  ["ultra-gold", /\bgold\b/],
  ["ultra-blue", /blue\s*hawaiian|ultra\s*blue/],
  ["mango-loco", /mango/],
  ["pipeline-punch", /pipeline/],
  ["pacific-punch", /pacific/],
  ["khaotic", /khaotic/],
  ["monarch", /monarch/],
  ["bad-apple", /bad\s*apple/],
  ["aussie-lemonade", /aussie|lemonade/],
  ["ripper", /ripper/],
  ["lewis-hamilton", /hamilton|lh\s*44/],
  ["assault", /assault/],
  ["nitro", /nitro/],
  ["reserve", /reserve/],
  ["rehab", /rehab/],
  ["original", /original|classic|\bgr(ü|ue)n\b/],
];

export function detectFlavors(o) {
  const t = `${o?.product?.name ?? ""} ${o?.description ?? ""}`.toLowerCase();
  const assorted = /versch|sortiert|sorten|div\.|diverse|verschiedene|auswahl/.test(t);
  const hits = FLAVORS.filter(([, re]) => re.test(t)).map(([k]) => k);
  if (assorted || !hits.length) return ["*", ...hits];
  return hits;
}

// Kompatibel zur alten Logik: white | assorted | other
export function detectVariant(o) {
  const f = detectFlavors(o);
  if (f.includes("ultra-white")) return "white";
  if (f.includes("*")) return "assorted";
  return "other";
}

export function parseNormalPrice(text = "") {
  const m = String(text).match(/normalpreis:?\s*(\d+[.,]\d{2})/i);
  return m ? Number(m[1].replace(",", ".")) : null;
}

// Werbe-Hinweise aus der Beschreibung entfernen, damit die Zeile lesbar bleibt
export function cleanDesc(text = "") {
  return String(text)
    .replace(/hinweis:\s*/gi, "")
    .replace(/normalpreis:?\s*\d+[.,]\d{2}\s*€?/gi, "")
    .replace(/taurin-?\s*und\s*koffeinhaltig\.?/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function normalize(o, now = new Date()) {
  const desc = [o.product?.name, cleanDesc(o.description)].filter(Boolean).join(" · ");
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
    oldPrice: o.oldPrice ?? parseNormalPrice(o.description),
    perLitre: perLitre ? round2(perLitre) : null,
    perCan,
    canLitres: canL,
    cans,
    loyalty: !!o.requiresLoyalityMembership || /plus[\s-]*app|mit (der )?app|payback|kundenkarte|lidl plus|k-card|kaufland card/i.test(o.description || ""),
    variant: detectVariant(o),
    flavors: detectFlavors(o),
    validFrom: span?.from ?? null,
    validTo: span?.to ?? null,
    active: !!current,
    image: `https://mg2de.b-cdn.net/api/v1/offers/${o.id}/images/default/0/medium.jpg`,
  };
}

async function searchOnce(zip, keys, fetchImpl, q = "monster energy") {
  const url = new URL(MG_API);
  url.search = new URLSearchParams({
    as: "web",
    q,
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

const QUERIES = ["monster energy", "monster", "monster ultra white"];

async function searchAll(zip, keys, fetchImpl) {
  const responses = await Promise.all(QUERIES.map((q) => searchOnce(zip, keys, fetchImpl, q)));
  if (responses.some((r) => r.status === 401 || r.status === 403)) return null;
  const ok = responses.filter((r) => r.ok);
  if (!ok.length) throw new Error(`Marktguru-API antwortet mit ${responses[0].status}`);
  const lists = await Promise.all(ok.map((r) => r.json().then((d) => d.results || []).catch(() => [])));
  return lists.flat();
}

export async function fetchOffers(zip, fetchImpl = fetch) {
  let keys = await getKeys(fetchImpl);
  let results = await searchAll(zip, keys, fetchImpl);
  if (results === null) {
    keys = await getKeys(fetchImpl, true);
    results = await searchAll(zip, keys, fetchImpl);
    if (results === null) throw new Error("Marktguru-API verweigert den Zugriff");
  }
  const now = new Date();
  const seen = new Set();
  return results
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
