/**
 * Parse ISO 6709 location strings (e.g. "+45.4642+009.1900+100.000/")
 * into latitude/longitude.
 */

export interface ParsedLocation {
  latitude: number;
  longitude: number;
  altitude?: number;
}

/**
 * Parse an ISO 6709 Annex H string into lat/lng/alt.
 * Supports formats like "+DD.DDDD+DDD.DDDD+AAA.AAA/" and "+DDMM.MM+DDDMM.MM/"
 */
export function parseISO6709(iso: string): ParsedLocation | null {
  if (!iso || typeof iso !== "string") return null;

  // Remove trailing "/" if present
  const cleaned = iso.replace(/\/$/, "").trim();

  // Match signed decimal degrees: +45.4642+009.1900 or +45.4642+009.1900+100.000
  const match = cleaned.match(
    /^([+-]\d+\.?\d*?)([+-]\d+\.?\d*?)([+-]\d+\.?\d*)?$/
  );

  if (!match) return null;

  const latitude = parseFloat(match[1]);
  const longitude = parseFloat(match[2]);
  const altitude = match[3] ? parseFloat(match[3]) : undefined;

  if (isNaN(latitude) || isNaN(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;

  return { latitude, longitude, altitude };
}

/**
 * Format coordinates for display as "45.4642° N, 9.1900° E"
 */
export function formatCoordinates(loc: ParsedLocation): string {
  const latDir = loc.latitude >= 0 ? "N" : "S";
  const lngDir = loc.longitude >= 0 ? "E" : "W";
  return `${Math.abs(loc.latitude).toFixed(4)}° ${latDir}, ${Math.abs(loc.longitude).toFixed(4)}° ${lngDir}`;
}

/**
 * Build a Google Maps URL for the given coordinates.
 */
export function mapsUrl(loc: ParsedLocation): string {
  return `https://www.google.com/maps?q=${loc.latitude},${loc.longitude}`;
}

/**
 * Reverse geocode coordinates to a human-readable label via OpenStreetMap Nominatim.
 * Returns e.g. "Milan, Italy" or null on failure.
 */
export async function reverseGeocode(loc: ParsedLocation): Promise<string | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${loc.latitude}&lon=${loc.longitude}&format=json&zoom=10&accept-language=en`,
      { headers: { "User-Agent": "WhatSaid/1.0" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const addr = data.address;
    if (!addr) return null;

    // Build a concise label: city/town, country
    const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || "";
    const country = addr.country || "";
    if (!city && !country) return data.display_name?.split(",").slice(0, 2).join(",").trim() || null;
    return [city, country].filter(Boolean).join(", ");
  } catch {
    return null;
  }
}
