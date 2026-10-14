// Supermärkte der bekannten Ketten (lib/chains.js) im Kartenausschnitt aus OpenStreetMap, serverseitig abgefragt,
// damit der Browser nicht an CORS oder Rate-Limits scheitert. Zuerst Nominatim (zuverlässiger), bei Ausfall Overpass.
// Ergebnis wird 1 Tag gecacht.
import { chainOf } from "../lib/chains.js";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
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

const round5 = (x) => Math.round(Number(x) * 1e5) / 1e5;

// Overpass-Elemente -> Läden, nur Supermärkte der bekannten Ketten
export function compact(elements) {
  const out = [];
  for (const el of elements || []) {
    const lat = el.lat ?? el.center?.lat, lon = el.lon ?? el.center?.lon;
    if (lat == null || lon == null) continue;
    const t = el.tags || {};
    const brand = t.brand || t.operator || "";
    const chain = chainOf({ name: t.name, brand, wikidata: t["brand:wikidata"], lat, lon });
    if (!chain) continue;
    out.push({ id: `${el.type}/${el.id}`, name: t.name || brand, brand, chain, lat: round5(lat), lon: round5(lon) });
  }
  return out;
}

// Nominatim liefert höchstens 40 Treffer pro Anfrage. Bei Zoom 14 reicht das für die Supermärkte im Ausschnitt.
const NOMINATIM = "https://nominatim.openstreetmap.org/search";

export function compactNominatim(list) {
  const out = [];
  for (const x of list || []) {
    if (!x.lat || !x.lon) continue;
    const brand = x.extratags?.brand || "";
    const chain = chainOf({ name: x.name, brand, wikidata: x.extratags?.["brand:wikidata"], lat: x.lat, lon: x.lon });
    if (!chain) continue;
    out.push({ id: `${x.osm_type}/${x.osm_id}`, name: x.name || brand, brand, chain, lat: round5(x.lat), lon: round5(x.lon) });
  }
  return out;
}

async function nominatim([s, w, n, e], fetchImpl) {
  const url = `${NOMINATIM}?format=jsonv2&limit=40&bounded=1&extratags=1&viewbox=${w},${n},${e},${s}&q=${encodeURIComponent("[supermarket]")}`;
  const res = await fetchImpl(url, { headers: { "user-agent": UA, "accept-language": "de" }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`nominatim: ${res.status}`);
  const seen = new Set();
  return compactNominatim(await res.json()).filter((x) => (seen.has(x.id) ? false : seen.add(x.id)));
}

export function overpassQuery([s, w, n, e]) {
  const b = `(${s},${w},${n},${e})`;
  return `[out:json][timeout:15];nwr["shop"="supermarket"]${b};out center tags 400;`;
}

async function overpass(bbox, fetchImpl) {
  let last;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "user-agent": UA, "content-type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(overpassQuery(bbox)),
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error(`overpass: ${res.status}`);
      return compact((await res.json()).elements);
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

export async function fetchShops(bbox, fetchImpl = fetch) {
  try {
    return await nominatim(bbox, fetchImpl);
  } catch (e) {
    console.warn("Nominatim nicht erreichbar, nehme Overpass:", e.message);
    return overpass(bbox, fetchImpl);
  }
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
