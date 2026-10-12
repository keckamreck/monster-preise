// Läden im Kartenausschnitt aus OpenStreetMap (über Nominatim), serverseitig abgefragt,
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

// Nominatim liefert pro Kategorie bis zu 50 Treffer im Ausschnitt und ist deutlich zuverlässiger als Overpass.
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const CATEGORIES = ["[supermarket]", "[convenience]", "[kiosk]", "[fuel]"];

export function compactNominatim(list) {
  return (list || []).filter((x) => x.lat && x.lon).map((x) => {
    const kind = x.type === "fuel" ? "fuel" : x.type || "shop";
    const name = x.name || (kind === "fuel" ? "Tankstelle" : "Laden");
    return { id: `${x.osm_type}/${x.osm_id}`, name, brand: x.extratags?.brand || "", kind, lat: Math.round(Number(x.lat) * 1e5) / 1e5, lon: Math.round(Number(x.lon) * 1e5) / 1e5 };
  });
}

async function nominatim(bbox, fetchImpl) {
  const [s, w, n, e] = bbox;
  const out = [];
  for (const q of CATEGORIES) {
    const url = `${NOMINATIM}?format=jsonv2&limit=50&bounded=1&extratags=1&viewbox=${w},${n},${e},${s}&q=${encodeURIComponent(q)}`;
    const res = await fetchImpl(url, { headers: { "user-agent": UA, "accept-language": "de" }, signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`nominatim: ${res.status}`);
    out.push(...compactNominatim(await res.json()));
  }
  const seen = new Set();
  return out.filter((x) => (seen.has(x.id) ? false : seen.add(x.id)));
}

export async function fetchShops(bbox, fetchImpl = fetch) {
  return nominatim(bbox, fetchImpl);
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
