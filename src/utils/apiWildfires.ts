import Papa from 'papaparse';
import { readCountriesGeoJson, replaceCountryObservations } from './wildfireDb';

const FALLBACK_GEOJSON_PATHS: Record<string, string> = {
  BRA: '/brazil.geojson',
  ARG: '/argentina.geojson',
  USA: '/USA.geojson',
};

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

const NASA_MAP_KEY = 'd83533a15b94181f62f362b63581c990';

export async function apiWildfires({
  countries = 'USA,ARG,BRA',
  numberOfDays = '4',
}) {
  try {
    const countryList = countries
      .split(',')
      .map((code: string) => code.trim().toUpperCase())
      .filter(Boolean);

    const cachedBeforeFetch = await readCountriesGeoJson(countryList);
    const fetchOutcomes: Record<string, { error?: string }> = {};
    // Function to fetch CSV data for a single country and convert it to GeoJSON
    async function fetchCountryData(countryCode: string) {
      const countryUrl = `https://firms.modaps.eosdis.nasa.gov/api/country/csv/${NASA_MAP_KEY}/MODIS_NRT/${countryCode}/${numberOfDays}`;
      try {
        const response = await fetch(countryUrl);
        console.log('response', response);
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        // Read CSV text
        const csvData = await response.text();
        // Parse CSV to JSON rows
        console.log('csvData', csvData);
        const parsed = Papa.parse(csvData, { header: true });
        const rows = parsed.data.filter(
          (row: any) => row.longitude && row.latitude
        );
        await replaceCountryObservations(countryCode, rows as any[]);
        return true;
      } catch (error) {
        console.error('Error fetching data for', countryCode, error);
        const fallbackSuccess = await loadFallbackData(countryCode);
        if (fallbackSuccess) {
          fetchOutcomes[countryCode] = {};
          return true;
        }
        fetchOutcomes[countryCode] = {
          error: `Failed to fetch or process data for ${countryCode}`,
        };
        return null;
      }
    }
    // Process all countries in parallel
    await Promise.all(countryList.map(fetchCountryData));
    const cachedAfterFetch = await readCountriesGeoJson(countryList);
    const result: Record<string, any> = {};

    for (const code of countryList) {
      const stored = cachedAfterFetch[code] ?? cachedBeforeFetch[code];
      if (stored) {
        result[code] = stored;
        continue;
      }
      const outcome = fetchOutcomes[code];
      if (outcome?.error) {
        result[code] = { error: outcome.error };
      } else {
        result[code] = { type: 'FeatureCollection', features: [] };
      }
    }

    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
}
