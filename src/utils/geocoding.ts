import type { BoundingBox } from '../types/geospatial';

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_CONTACT_EMAIL = 'support@wildfireschatdashboard.local';

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

function parseCenter(lat?: string, lon?: string): { lat: number; lon: number } | null {
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
    response = await fetch(`${NOMINATIM_ENDPOINT}?${params.toString()}`, {
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
  return {
    boundingBox: best.parsedBox as BoundingBox,
    displayName: best.display_name || query,
    center: best.center,
    source: 'nominatim',
  };
}
