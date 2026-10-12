// Läden im Kartenausschnitt aus OpenStreetMap (Overpass), serverseitig abgefragt,
// damit der Browser nicht an CORS oder Overpass-Limits scheitert. Ergebnis wird 1 Tag gecacht.

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];
const UA = "monster-preise/1.0 (private fan project; vercel)";

export function parseBbox(raw) {
  const parts = String(raw || "").split(",").map(Number);
  if (parts.length !== 4 || parts.some((x) => !Number.isFinite(x))) return null;
  // auf 2 Nachkommastellen runden (≈1 km), damit sich der Cache gut trifft
  const [s, w, n, e] = [Math.floor(parts[0] * 100) / 100, Math.floor(parts[1] * 100) / 100, Math.ceil(parts[2] * 100) / 100, Math.ceil(parts[3] * 100) / 100];
  if (!(s < n && w < e)) return null;
  if (s < 45 || n > 56 || w < 4 || e > 17) return null;
  if ((n - s) * (e - w) > 0.06) return null; // max. ca. 25 × 25 km
  return [s, w, n, e];
}

export function compact(elements) {
  const out = [];
  for (const el of elements || []) {
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const t = el.tags || {};
    const brand = t.brand || t.operator || "";
    const kind = t.amenity === "fuel" ? "fuel" : t.shop || "shop";
    const name = t.name || brand || (kind === "fuel" ? "Tankstelle" : "Laden");
    out.push({ id: `${el.type}/${el.id}`, name, brand, kind, lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 });
  }
  return out;
}

export async function fetchShops(bbox, fetchImpl = fetch) {
  const b = bbox.join(",");
  const q = `[out:json][timeout:20];(nwr["shop"~"^(supermarket|convenience|kiosk)$"](${b});nwr["amenity"="fuel"](${b}););out center 500;`;
  let lastErr;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": UA, accept: "application/json" },
        body: "data=" + encodeURIComponent(q),
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error(`${new URL(url).host}: ${res.status}`);
      const data = await res.json();
      return compact(data.elements);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Overpass nicht erreichbar");
}

export default async function handler(req, res) {
  const bbox = parseBbox(req.query?.bbox);
  if (!bbox) {
    res.status(400).json({ error: "Ausschnitt zu groß oder ungültig. Bitte weiter reinzoomen." });
    return;
  }
  try {
    const shops = await fetchShops(bbox);
    res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
    res.status(200).json({ bbox, shops });
  } catch (e) {
    res.status(502).json({ error: "Läden konnten gerade nicht geladen werden." });
  }
}
