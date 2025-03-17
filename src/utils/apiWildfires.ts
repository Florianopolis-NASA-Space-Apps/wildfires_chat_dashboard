const Papa = require('papaparse'); // for CSV parsing

export async function apiWildfires({
  countries = 'USA,ARG,BRA',
  numberOfDays = '4',
}) {
  const nasaMapKey = 'd83533a15b94181f62f362b63581c990';
  try {
    const countryList = countries.split(',');
    const result: {
      USA: any;
      ARG: any;
      BRA: any;
    } = {
      USA: {},
      ARG: {},
      BRA: {},
    };
    // Function to fetch CSV data for a single country and convert it to GeoJSON
    async function fetchCountryData(countryCode: string) {
      const countryUrl = `https://firms.modaps.eosdis.nasa.gov/api/country/csv/${nasaMapKey}/MODIS_NRT/${countryCode}/${numberOfDays}`;
      try {
        const response = await fetch(countryUrl);
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        // Read CSV text
        const csvData = await response.text();
        // Parse CSV to JSON rows
        const parsed = Papa.parse(csvData, { header: true });
        const rows = parsed.data;
        // Construct GeoJSON Features
        const features = rows
          .filter((row: any) => row.longitude && row.latitude)
          .map((row: any) => ({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [
                parseFloat(row.longitude),
                parseFloat(row.latitude),
              ],
            },
            properties: { ...row },
          }));
        // Build a FeatureCollection
        const geoJson = {
          type: 'FeatureCollection',
          features,
        };
        // Return the data keyed by country code
        return { [countryCode]: geoJson };
      } catch (error) {
        console.error('Error fetching data for', countryCode, error);
        return {
          [countryCode]: {
            error: `Failed to fetch or process data for ${countryCode}`,
          },
        };
      }
    }
    // Process all countries in parallel
    const promises = countryList.map(fetchCountryData);
    const results = await Promise.all(promises);
    // Merge each country’s result into a single object
    for (const obj of results) {
      Object.assign(result, obj);
    }
    return result;
  } catch (error) {
    console.error(error);
    return null;
  }
}
