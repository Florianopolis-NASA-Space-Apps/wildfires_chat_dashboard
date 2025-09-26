import Papa from 'papaparse';
import { readCountriesGeoJson, replaceCountryObservations } from './wildfireDb';
import { NASA_FIRMS_AREA_CSV_BASE_URL } from '../constants/links';

const AMERICAS_CODE = 'AMERICAS';
const FALLBACK_GEOJSON_PATHS: Record<string, string> = {
  [AMERICAS_CODE]: '/americas.geojson',
};

// North & South America
// const AMERICAS_BBOX: [number, number, number, number] = [-170, -60, -30, 83];

const WORLD_BBOX: [number, number, number, number] = [-180, -90, 180, 90];

const NASA_DATA_SOURCE = 'MODIS_NRT';

async function fetchAmericasWildfireRows({
  numberOfDays,
  startDate,
}: {
  numberOfDays: string;
  startDate?: string;
}) {
  if (typeof fetch === 'undefined') {
    throw new Error('Fetch API is not available in this environment');
  }
  const [west, south, east, north] = WORLD_BBOX;
  const parsedDays = Math.floor(Number(numberOfDays));
  if (!Number.isFinite(parsedDays) || parsedDays < 1 || parsedDays > 10) {
    throw new Error(
      `Invalid numberOfDays "${numberOfDays}". Must be between 1 and 10.`
    );
  }
  const dayRange = String(parsedDays);
  const baseUrl = `${NASA_FIRMS_AREA_CSV_BASE_URL}/${NASA_MAP_KEY}/${NASA_DATA_SOURCE}/${west},${south},${east},${north}/${dayRange}`;
  const params = new URLSearchParams();
  if (startDate) {
    params.set('startDate', startDate);
  }
  const query = params.toString();
  const url = query ? `${baseUrl}?${query}` : baseUrl;
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Status ${response.status}: ${text.slice(0, 200)}`);
  }
  if (!text || text.trim().length === 0) {
    throw new Error('Empty response body');
  }
  if (text.trim().startsWith('<')) {
    throw new Error('Received HTML instead of CSV');
  }
  const parsed = Papa.parse<Record<string, any>>(text, {
    header: true,
    // @ts-expect-error - Papa types do not include boolean for dynamicTyping
    dynamicTyping: true,
    skipEmptyLines: true,
  });
  const rows = parsed.data.filter(
    (row: any) =>
      row && row.longitude !== undefined && row.latitude !== undefined
  );
  if (!rows.length) {
    throw new Error('No valid rows in CSV');
  }
  return rows;
}

function featureToObservation(row: any) {
  if (!row) return null;
  const geometry = row.geometry ?? {};
  const coordinates = Array.isArray(geometry.coordinates)
    ? geometry.coordinates
    : [];
  const props = row.properties ?? {};
  const longitude = props.longitude ?? coordinates[0];
  const latitude = props.latitude ?? coordinates[1];
  if (
    longitude === undefined ||
    latitude === undefined ||
    props.acq_date === undefined ||
    props.acq_time === undefined
  ) {
    return null;
  }
  return {
    latitude,
    longitude,
    brightness: props.brightness,
    scan: props.scan,
    track: props.track,
    acq_date: props.acq_date,
    acq_time: props.acq_time,
    satellite: props.satellite ?? props.platform ?? 'Unknown',
    confidence: props.confidence,
    version: props.version,
    bright_t31: props.bright_t31,
    frp: props.frp,
    daynight: props.daynight,
  };
}

async function loadFallbackData(countryCode: string) {
  const fallbackPath = FALLBACK_GEOJSON_PATHS[countryCode];
  if (!fallbackPath || typeof fetch === 'undefined') {
    return null;
  }
  try {
    const response = await fetch(fallbackPath);
    if (!response.ok) {
      throw new Error(`Fallback response not OK: ${response.status}`);
    }
    const geojson = await response.json();
    const features = Array.isArray(geojson?.features) ? geojson.features : [];
    const observations = features
      .map((feature: any) => featureToObservation(feature))
      .filter(Boolean);
    if (observations.length) {
      await replaceCountryObservations(countryCode, observations as any[]);
      return true;
    }
  } catch (fallbackError) {
    console.error(
      'Error loading fallback data for',
      countryCode,
      fallbackError
    );
  }
  return null;
}

const NASA_MAP_KEY = process.env.REACT_APP_NASA_MAP_KEY || '';

export async function apiWildfires({
  numberOfDays = '2',
  startDate,
}: {
  numberOfDays?: string;
  startDate?: string;
} = {}) {
  try {
    const regionCodes = [AMERICAS_CODE];
    const cachedBeforeFetch = await readCountriesGeoJson(regionCodes);
    let storedSuccessfully = false;
    let lastError: string | null = null;
    let americasRows: Record<string, any>[] | null = null;
    try {
      americasRows = await fetchAmericasWildfireRows({
        numberOfDays,
        startDate,
      });
    } catch (error) {
      console.error(
        'Error fetching aggregated wildfire data for the Americas',
        error
      );
      lastError = 'Failed to fetch data for the Americas';
    }
    if (americasRows && americasRows.length) {
      try {
        await replaceCountryObservations(AMERICAS_CODE, americasRows as any[]);
        storedSuccessfully = true;
      } catch (storageError) {
        console.error(
          'Error storing wildfire data for the Americas',
          storageError
        );
        lastError = 'Failed to store data for the Americas';
      }
    }
    if (!storedSuccessfully) {
      const fallbackSuccess = await loadFallbackData(AMERICAS_CODE);
      if (!fallbackSuccess) {
        lastError = americasRows?.length
          ? 'No data available for the Americas'
          : lastError ?? 'Failed to fetch or process data for the Americas';
      }
    }
    const cachedAfterFetch = await readCountriesGeoJson(regionCodes);
    const stored =
      cachedAfterFetch[AMERICAS_CODE] ?? cachedBeforeFetch[AMERICAS_CODE];
    if (stored) {
      return { [AMERICAS_CODE]: stored };
    }
    if (lastError) {
      return { [AMERICAS_CODE]: { error: lastError } };
    }
    return { [AMERICAS_CODE]: { type: 'FeatureCollection', features: [] } };
  } catch (error) {
    console.error(error);
    return null;
  }
}
