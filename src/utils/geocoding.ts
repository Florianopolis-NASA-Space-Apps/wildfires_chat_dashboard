import type { BoundingBox } from '../types/geospatial';
import { NOMINATIM_SEARCH_URL } from '../constants/links';

const NOMINATIM_CONTACT_EMAIL = 'support@archlife.org';

// In-memory cache for geocoding results to speed up repeated queries
const geocodingCache = new Map<string, BoundingBoxLookupResult>();
const CACHE_MAX_SIZE = 100;
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

interface CachedResult {
  result: BoundingBoxLookupResult;
  timestamp: number;
}

interface NominatimPlace {
  boundingbox?: [string, string, string, string];
  display_name?: string;
  lat?: string;
  lon?: string;
  importance?: number;
}

export interface BoundingBoxLookupResult {
  boundingBox: BoundingBox;
  displayName: string;
  center: {
    lat: number;
    lon: number;
  } | null;
  source: 'nominatim';
}

function parseBoundingBox(
  boundingBox: [string, string, string, string] | undefined
): BoundingBox | null {
  if (!boundingBox) {
    return null;
  }
  const [south, north, west, east] = boundingBox.map((value) => Number(value));
  if (![south, north, west, east].every((value) => Number.isFinite(value))) {
    return null;
  }
  return {
    north,
    south,
    east,
    west,
  };
}

function parseCenter(
  lat?: string,
  lon?: string
): { lat: number; lon: number } | null {
  if (!lat || !lon) {
    return null;
  }
  const parsedLat = Number(lat);
  const parsedLon = Number(lon);
  if (!Number.isFinite(parsedLat) || !Number.isFinite(parsedLon)) {
    return null;
  }
  return { lat: parsedLat, lon: parsedLon };
}

export async function lookupBoundingBoxForPlace(
  query: string
): Promise<BoundingBoxLookupResult> {
  if (typeof query !== 'string' || !query.trim()) {
    throw new Error('Place query must be a non-empty string.');
  }

  // Normalize query for cache lookup
  const normalizedQuery = query.trim().toLowerCase();
  
  // Check cache first
  const cached = geocodingCache.get(normalizedQuery);
  if (cached) {
    const age = Date.now() - (cached as any).timestamp;
    if (age < CACHE_TTL_MS) {
      // Return cached result for faster response
      return (cached as any).result;
    }
    // Remove expired entry
    geocodingCache.delete(normalizedQuery);
  }

  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: '3',
    polygon_geojson: '0',
    addressdetails: '0',
    email: NOMINATIM_CONTACT_EMAIL,
    'accept-language': 'en',
  });

  let response: Response;
  try {
    response = await fetch(`${NOMINATIM_SEARCH_URL}?${params.toString()}`, {
      headers: {
        Accept: 'application/json',
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to contact geocoding service: ${reason}`);
  }

  if (!response.ok) {
    throw new Error(
      `Geocoding service returned ${response.status} ${response.statusText}`
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error('Unable to parse geocoding response.');
  }

  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error('No bounding box found for the requested location.');
  }

  const candidates = (payload as NominatimPlace[])
    .map((place) => ({
      ...place,
      parsedBox: parseBoundingBox(place.boundingbox),
      center: parseCenter(place.lat, place.lon),
      weight: typeof place.importance === 'number' ? place.importance : 0,
    }))
    .filter((place) => Boolean(place.parsedBox))
    .sort((a, b) => b.weight - a.weight);

  if (!candidates.length) {
    throw new Error('Bounding box data unavailable for the selected location.');
  }

  const best = candidates[0];
  const result: BoundingBoxLookupResult = {
    boundingBox: best.parsedBox as BoundingBox,
    displayName: best.display_name || query,
    center: best.center,
    source: 'nominatim',
  };
  
  // Cache the result for future lookups
  // Evict oldest entry if cache is full
  if (geocodingCache.size >= CACHE_MAX_SIZE) {
    const firstKey = geocodingCache.keys().next().value;
    if (firstKey !== undefined) {
      geocodingCache.delete(firstKey);
    }
  }
  geocodingCache.set(normalizedQuery, {
    result,
    timestamp: Date.now(),
  } as any);
  
  return result;
}
